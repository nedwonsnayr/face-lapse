import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ArchiveTools from "./components/ArchiveTools";
import FacePicker, { FaceReview } from "./components/FacePicker";
import Upload, { UploadHandle } from "./components/Upload";
import ImageLibrary from "./components/ImageLibrary";
import Timelapse from "./components/Timelapse";
import ErrorBoundary from "./components/ErrorBoundary";
import { Button } from "./components/ui/Button";
import Icon from "./components/ui/Icon";
import { ImageRecord, AlignResponse } from "./api";
import s from "./App.module.css";
import PersonTabs from "./components/PersonTabs";
import { createProfileApi, listProfiles, Profile, saveProfile } from "./api";
import { ProfileApiContext, useProfileApi } from "./ProfileContext";

function yearRange(images: ImageRecord[]): string | null {
  const years = images
    .map((img) => (img.photo_taken_at ? new Date(img.photo_taken_at).getFullYear() : NaN))
    .filter((y) => !isNaN(y));
  if (years.length === 0) return null;
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? `${min}` : `${min}–${max}`;
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

const REFRESH_MS = 30_000;

const ACTIVE_PERSON_KEY = "face-lapse:active-person";

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<number>(() => {
    try { return Number(localStorage.getItem(ACTIVE_PERSON_KEY)) || 1; } catch { return 1; }
  });
  const [error, setError] = useState<string | null>(null);
  const profileRequest = useRef(0);
  const load = useCallback(async () => {
    const request = ++profileRequest.current;
    try {
      const data = await listProfiles();
      if (request === profileRequest.current) { setProfiles(data); setError(null); }
    } catch (err) {
      if (request === profileRequest.current) setError(err instanceof Error ? err.message : "Could not load people");
    }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => { window.removeEventListener("focus", refresh); clearInterval(timer); };
  }, [load]);
  const profile = profiles.find((p) => p.id === activeId) ?? profiles[0];
  const api = useMemo(() => createProfileApi(profile?.id ?? 1), [profile?.id]);
  const select = (id: number) => {
    setActiveId(id);
    requestAnimationFrame(() => document.getElementById(`person-tab-${id}`)?.focus({ preventScroll: true }));
    try { localStorage.setItem(ACTIVE_PERSON_KEY, String(id)); } catch { /* unavailable storage */ }
  };
  const updated = (p: Profile) => {
    ++profileRequest.current; // an older list response must not undo a local save
    setProfiles((old) => old.some((v) => v.id === p.id) ? old.map((v) => v.id === p.id ? p : v) : [...old, p]);
  };
  const saved = (p: Profile) => { updated(p); select(p.id); };
  if (!profile) return <div className={s.loading}>
    {error ? <><p role="alert">{error}</p><Button onClick={load}>Try again</Button></> : "Loading people…"}
  </div>;
  return <ProfileApiContext.Provider value={api}>
    <PersonWorkspace key={profile.id} profile={profile} profiles={profiles} onProfileSaved={updated}
      tabs={<PersonTabs profiles={profiles} current={profile} onSelect={select} onSaved={saved} />} />
  </ProfileApiContext.Provider>;
}

function PersonWorkspace({ profile, profiles, tabs, onProfileSaved }: {
  profile: Profile; profiles: Profile[]; tabs: React.ReactNode; onProfileSaved: (profile: Profile) => void;
}) {
  const { listImages } = useProfileApi();
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [facePickerId, setFacePickerId] = useState<number | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentUploadIds, setRecentUploadIds] = useState<Set<number>>(new Set());
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const uploadRef = useRef<UploadHandle>(null);
  const alive = useRef(true);
  const requestNumber = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const fetchImages = useCallback(async () => {
    const number = ++requestNumber.current;
    try {
      const data = await listImages();
      if (alive.current && number === requestNumber.current) { setImages(data); setLibraryError(null); }
    } catch (err) {
      if (alive.current && number === requestNumber.current) setLibraryError("Could not refresh your library. Your photos are still saved.");
    } finally {
      if (alive.current && number === requestNumber.current) setLoading(false);
    }
  }, [listImages]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  // Keep in step with other devices: re-check when the tab comes back into view
  // and every REFRESH_MS while it's visible. Cheap: unchanged lists come back as
  // 304 (ETag), and listImages() then returns the same array, so React skips
  // the re-render. Skipped mid-drag so a reorder isn't yanked out from under you.
  const draggingRef = useRef(false);
  const handleDraggingChange = useCallback((dragging: boolean) => {
    draggingRef.current = dragging;
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && !draggingRef.current) fetchImages();
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [fetchImages]);

  // Drop-anywhere: show an overlay while files are dragged over the window.
  useEffect(() => {
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setIsDraggingFiles(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setIsDraggingFiles(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setIsDraggingFiles(false);
      // The dropzone handles its own drops; anything else lands here.
      if (!(e.target as HTMLElement).closest?.("[data-testid='dropzone']")) {
        uploadRef.current?.addFiles(Array.from(e.dataTransfer?.files ?? []));
      }
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const handleAlignComplete = useCallback(
    (result: AlignResponse) => {
      setRecentUploadIds(new Set(result.results.map((r) => r.id)));
      fetchImages();
    },
    [fetchImages]
  );

  const handleDismissRecent = useCallback(() => {
    setRecentUploadIds(new Set());
  }, []);

  // Uploads waiting to be aligned (possibly staged on another device) belong to
  // the upload tray, not the library.
  const libraryImages = useMemo(() => images.filter((img) => !img.pending && !img.needs_face_selection), [images]);
  // Library order (date taken, adjusted by drags) as the server sends it. The
  // library's "Newest first" only flips its own view, never the timelapse.
  const includedImages = useMemo(
    () => libraryImages.filter((img) => img.included_in_video && img.has_aligned),
    [libraryImages]
  );
  const range = yearRange(libraryImages);

  return (
    <div className={s.app}>
      <header className={s.topbar}>
        <div className={s.brand}>
          <span className={s.mark} aria-hidden="true">
            <Icon name="aperture" size={20} />
          </span>
          <h1 className={s.wordmark}>
            Face <em>Lapse</em>
          </h1>
        </div>
        <div className={s.topbarRight}>
          {libraryImages.length > 0 && (
            <p className={s.stats}>
              <span className={s.statNum}>{libraryImages.length.toLocaleString()}</span> photos
              {range && (
                <>
                  <span className={s.dot} aria-hidden="true">·</span>
                  {range}
                </>
              )}
            </p>
          )}
          <Button
            variant="primary"
            icon="plus"
            onClick={() => uploadRef.current?.openFilePicker()}
            aria-label={`Add photos for ${profile.name}`}
          >
            Add photos
          </Button>
        </div>
      </header>
      {tabs}
      <main id="person-workspace" role="tabpanel" aria-labelledby={`person-tab-${profile.id}`} className={s.shell}>
        <section className={s.libraryPane} aria-label="Library">
          <ErrorBoundary section="Upload">
            <Upload
              ref={uploadRef}
              personName={profile.name}
              previousPhoto={[...includedImages].sort((a, b) => (b.photo_taken_at ?? "").localeCompare(a.photo_taken_at ?? ""))[0]}
              pendingImages={loading ? undefined : images.filter((img) => img.pending)}
              compact={!loading && libraryImages.length > 0}
              onAlignComplete={handleAlignComplete}
            />
          </ErrorBoundary>

          <FaceReview images={images.filter((img) => img.needs_face_selection)} onChoose={setFacePickerId} onRefresh={fetchImages} />

          {libraryError && <p role="alert">{libraryError} <Button onClick={fetchImages}>Retry library</Button></p>}
          {loading ? (
            <p data-testid="loading-message" className={s.loading}>
              Loading library…
            </p>
          ) : (
            <ErrorBoundary section="Image Library">
              <ImageLibrary
                images={libraryImages}
                profiles={profiles}
                recentUploadIds={recentUploadIds}
                onRefresh={fetchImages}
                onDismissRecent={handleDismissRecent}
                onDraggingChange={handleDraggingChange}
                onChooseFace={setFacePickerId}
              />
            </ErrorBoundary>
          )}
          <ArchiveTools images={images} onRefresh={fetchImages} />
        </section>

        <aside className={s.studioPane} aria-label="Timelapse">
          {!loading && (
            <ErrorBoundary section="Timelapse">
              <Timelapse images={includedImages} initialBirthday={profile.birthday} onBirthdayChange={async (birthday) => {
                const updated = await saveProfile({ name: profile.name, birthday: birthday || null }, profile.id);
                onProfileSaved(updated);
              }} />
            </ErrorBoundary>
          )}
        </aside>
      </main>

      {facePickerId !== null && (
        <FacePicker
          imageId={facePickerId}
          onClose={() => setFacePickerId(null)}
          onSaved={() => { setFacePickerId(null); fetchImages(); }}
        />
      )}

      {isDraggingFiles && (
        <div className={s.dropOverlay} aria-hidden="true">
          <div className={s.dropCard}>
            <Icon name="upload" size={28} />
            <p className={s.dropTitle}>Drop to add photos for {profile.name}</p>
            <p className={s.dropHint}>JPG, PNG, WebP or HEIC</p>
          </div>
        </div>
      )}
    </div>
  );
}
