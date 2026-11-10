import { useProfileApi } from "../ProfileContext";
import { archiveRequest } from "../archiveApi";
import { Profile } from "../api";
import WindowedLibrary from "./WindowedLibrary";
import ResilientImage from "./ResilientImage";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ImageRecord } from "../api";
import { Button, IconButton } from "./ui/Button";
import Icon from "./ui/Icon";
import cx from "./ui/cx";
import forms from "./ui/forms.module.css";
import s from "./ImageLibrary.module.css";

/* ── Props ─────────────────────────────────────────────── */

interface ImageLibraryProps {
  images: ImageRecord[];
  profiles: Profile[];
  recentUploadIds: Set<number>;
  onRefresh: () => void;
  onChooseFace: (id: number) => void;
  onDismissRecent: () => void;
  /** Told when a drag-to-reorder starts/ends, so background refreshes can wait. */
  onDraggingChange?: (dragging: boolean) => void;
}

/* ── Card ──────────────────────────────────────────── */

const formatRowDate = (iso: string | null): string | null =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

export type LibraryView = "grid" | "list";
const VIEW_STORAGE_KEY = "face-lapse:library-view";

function loadView(): LibraryView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

const formatCardDate = (iso: string | null): string | null =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

interface CardActionsProps {
  img: ImageRecord;
  deletingId: number | null;
  realigningId: number | null;
  onDelete: (id: number) => void;
  onToggle: (id: number) => void;
  onRealign: (id: number) => void;
  onChooseFace: (id: number) => void;
  selectedIds?: Set<number>;
  onSelect?: (id: number) => void;
}

/*
 * Card and row bodies are memoized and take only stable props, so rendering a
 * new batch of items (or any other library re-render) skips the ones already
 * on screen. The drag handle is rendered by SortableCard, outside the body,
 * because its listeners change on every render.
 */

/** Thumbnail, hover actions, date and include toggle. Shared by sortable and static grids. */
const CardBody = memo(function CardBody({ img, deletingId, realigningId, onDelete, onToggle, onRealign, onChooseFace }: CardActionsProps) {
  const { getAlignedImageUrl } = useProfileApi();
  const date = formatCardDate(img.photo_taken_at);
  const isRealigning = realigningId === img.id;
  const isDeleting = deletingId === img.id;

  return (
    <>
      <div className={s.thumbWrap}>
        {img.has_aligned ? (
          <ResilientImage
            src={getAlignedImageUrl(img.id, img.content_hash, "thumb")}
            alt={date ? `Photo from ${date}` : img.original_filename}
            className={s.thumbnail}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className={s.noFace}>
            <Icon name="alert" size={20} />
            <span>No face</span>
          </div>
        )}

        <div className={cx(s.hoverActions, (isRealigning || isDeleting) && s.hoverActionsBusy)}>
          <PhotoActions {...{ img, deletingId, realigningId, onDelete, onRealign, onChooseFace }} variant="overlay" />
        </div>
      </div>

      <div className={s.cardFooter}>
        <span className={s.date} title={img.original_filename}>
          {date ?? img.original_filename}
        </span>
        {img.has_aligned && <IncludeChip img={img} onToggle={onToggle} />}
      </div>
    </>
  );
});

/** Re-align + delete buttons, shared by grid cards (on hover) and list rows (always shown). */
function PhotoActions({
  img,
  deletingId,
  realigningId,
  onDelete,
  onRealign,
  onChooseFace,
  variant,
}: Pick<CardActionsProps, "img" | "deletingId" | "realigningId" | "onDelete" | "onRealign" | "onChooseFace"> & {
  variant: "overlay" | "plain";
}) {
  const isRealigning = realigningId === img.id;
  const isDeleting = deletingId === img.id;
  return (
    <>
      <IconButton
        data-testid={`change-face-button-${img.id}`}
        icon="eye"
        label="Change face"
        variant={variant}
        size="sm"
        onClick={() => onChooseFace(img.id)}
        disabled={isRealigning || isDeleting}
      />
      <IconButton
        data-testid={`realign-button-${img.id}`}
        icon="rotate"
        label={isRealigning ? "Re-aligning…" : "Re-run face alignment"}
        variant={variant}
        size="sm"
        tone="accent"
        className={cx(isRealigning && s.spinning)}
        onClick={() => onRealign(img.id)}
        disabled={isRealigning}
      />
      <IconButton
        data-testid={`delete-button-${img.id}`}
        icon="trash"
        label={isDeleting ? "Deleting…" : "Delete photo"}
        variant={variant}
        size="sm"
        tone="danger"
        onClick={() => onDelete(img.id)}
        disabled={isDeleting}
      />
    </>
  );
}

function IncludeChip({ img, onToggle }: { img: ImageRecord; onToggle: (id: number) => void }) {
  return (
    <button
      data-testid={`toggle-include-button-${img.id}`}
      className={cx(s.includeChip, img.included_in_video ? s.included : s.excluded)}
      onClick={() => onToggle(img.id)}
      title={img.included_in_video ? "Exclude from video" : "Include in video"}
      aria-pressed={img.included_in_video}
    >
      <Icon name={img.included_in_video ? "eye" : "eyeOff"} size={12} />
      {img.included_in_video ? "In" : "Out"}
    </button>
  );
}

/** One row in list view: thumbnail, full date, source filename, and always-visible controls. */
const RowBody = memo(function RowBody({ img, deletingId, realigningId, onDelete, onToggle, onRealign, onChooseFace }: CardActionsProps) {
  const { getAlignedImageUrl } = useProfileApi();
  const date = formatRowDate(img.photo_taken_at);
  return (
    <>
      <div className={s.rowThumb}>
        {img.has_aligned ? (
          <ResilientImage
            src={getAlignedImageUrl(img.id, img.content_hash, "thumb")}
            alt={date ? `Photo from ${date}` : img.original_filename}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <Icon name="alert" size={16} />
        )}
      </div>
      <div className={s.rowMeta}>
        <span className={s.rowDate}>{date ?? img.original_filename}</span>
        <span className={s.rowFile} title={img.original_filename}>
          {img.source_filename || img.original_filename}
        </span>
      </div>
      {img.has_aligned && <IncludeChip img={img} onToggle={onToggle} />}
      <div className={s.rowActions}>
        <PhotoActions {...{ img, deletingId, realigningId, onDelete, onRealign, onChooseFace }} variant="plain" />
      </div>
    </>
  );
});

interface SortableCardProps extends CardActionsProps {
  testIdPrefix?: string;
  layout: LibraryView;
}

const SortableCard = memo(function SortableCard({ testIdPrefix = "image-card", layout, ...props }: SortableCardProps) {
  const { img } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: img.id,
  });

  // Dynamic drag position stays inline; everything else is in CSS.
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isList = layout === "list";
  const handle = (
    <div {...attributes} {...listeners} className={isList ? s.rowDragHandle : s.dragHandle} title="Drag to reorder">
      <Icon name="grip" size={14} />
    </div>
  );
  const Body = isList ? RowBody : CardBody;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cx(
        isList ? s.row : s.card,
        !img.included_in_video && (isList ? s.rowExcluded : s.cardExcluded),
        isDragging && s.cardDragging
      )}
      data-testid={`${testIdPrefix}-${img.id}`}
    >
      {props.onSelect && <label className={isList ? s.rowSelect : s.cardSelect}>
        <input type="checkbox" aria-label={`Select photo ${img.source_filename || img.original_filename}`}
          checked={props.selectedIds?.has(img.id) ?? false} onChange={() => props.onSelect?.(img.id)} />
      </label>}
      {isList && handle}
      <Body {...props} />
      {!isList && handle /* absolutely positioned over the photo */}
    </div>
  );
});

/** A card or row without drag-to-reorder (used while searching). */
const StaticCard = memo(function StaticCard({ layout, ...props }: CardActionsProps & { layout: LibraryView }) {
  const { img } = props;
  const isList = layout === "list";
  const Body = isList ? RowBody : CardBody;
  return (
    <div
      className={cx(
        isList ? s.row : s.card,
        !img.included_in_video && (isList ? s.rowExcluded : s.cardExcluded)
      )}
      data-testid={`previous-image-card-${img.id}`}
    >
      {props.onSelect && <label className={isList ? s.rowSelect : s.cardSelect}>
        <input type="checkbox" aria-label={`Select photo ${img.source_filename || img.original_filename}`}
          checked={props.selectedIds?.has(img.id) ?? false} onChange={() => props.onSelect?.(img.id)} />
      </label>}
      <Body {...props} />
    </div>
  );
});

/** A callback whose identity never changes but always runs the latest closure. */
function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}

/* ── Main component ───────────────────────────────────── */

export default function ImageLibrary({
  images,
  recentUploadIds,
  profiles,
  onRefresh,
  onChooseFace,
  onDismissRecent,
  onDraggingChange,
}: ImageLibraryProps) {
  const { profileId, getOriginalImageUrl, deleteImage, toggleImage, reorderImages, deleteNoFaceImages, realignImage } = useProfileApi();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [realigningId, setRealigningId] = useState<number | null>(null);
  const [previousCollapsed, setPreviousCollapsed] = useState(false);
  const [recentCollapsed, setRecentCollapsed] = useState(false);
  const [noFaceCollapsed, setNoFaceCollapsed] = useState(false);
  const [dismissingNoFace, setDismissingNoFace] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [sortAscending, setSortAscending] = useState(true);
  const [view, setViewState] = useState<LibraryView>(loadView);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [month, setMonth] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set<number>());
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [undoIds, setUndoIds] = useState<number[]>([]);
  const [dragging, setDragging] = useState(false);
  const setView = (next: LibraryView) => {
    setViewState(next);
    try { localStorage.setItem(VIEW_STORAGE_KEY, next); } catch { /* unavailable */ }
  };
  const selectPhoto = useStableCallback((id: number) => setSelectedIds(old => {
    const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next;
  }));
  useEffect(() => setSelectedIds(old => new Set([...old].filter(id => images.some(p => p.id === id)))), [images]);
  const batchAction = async (path: string, extra = {}) => {
    setBusy(true); setNotice("");
    const ids = [...selectedIds];
    try {
      await archiveRequest(profileId, path, "POST", { image_ids: ids, ...extra });
      if (path === "trash") setUndoIds(ids);
      setNotice(path === "trash" ? `${ids.length} photos moved to Trash.` : `${ids.length} photos ${path === "transfer" ? "transferred" : "restored"}.`);
      setSelectedIds(new Set()); onRefresh();
    } catch (err) { setNotice(err instanceof Error ? err.message : "Action failed"); }
    finally { setBusy(false); }
  };
  const undo = async () => {
    setBusy(true);
    try { await archiveRequest(profileId, "restore", "POST", { image_ids: undoIds }); setUndoIds([]); setNotice("Photos restored."); onRefresh(); }
    catch (err) { setNotice(err instanceof Error ? err.message : "Could not restore photos"); }
    finally { setBusy(false); }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDelete = useStableCallback(async (id: number) => {
    if (!confirm("Move this photo to Trash? You can restore it later.")) return;
    setDeletingId(id);
    try {
      await deleteImage(id);
      setUndoIds([id]); setNotice("Photo moved to Trash.");
      onRefresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not move photo to Trash");
    } finally {
      setDeletingId(null);
    }
  });

  const handleToggle = useStableCallback(async (id: number) => {
    try {
      await toggleImage(id);
      onRefresh();
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  });

  const handleRealign = useStableCallback(async (id: number) => {
    setRealigningId(id);
    try {
      const result = await realignImage(id);
      onRefresh();
      if (result.needs_face_selection) onChooseFace(id);
    } catch (err) {
      console.error("Re-align failed:", err);
    } finally {
      setRealigningId(null);
    }
  });

  /*
   * Library order is the server's: manual sort_order first, then photo number.
   * After a drop we show the new order straight away (until the refreshed list
   * arrives) so the card doesn't snap back first.
   */
  const [optimisticOrder, setOptimisticOrder] = useState<number[] | null>(null);
  useEffect(() => setOptimisticOrder(null), [images]);
  const orderedImages = useMemo(() => {
    if (!optimisticOrder) return images;
    const pos = new Map(optimisticOrder.map((id, i) => [id, i]));
    const at = (id: number) => pos.get(id) ?? Number.MAX_SAFE_INTEGER;
    return [...images].sort((a, b) => at(a.id) - at(b.id));
  }, [images, optimisticOrder]);

  // Moves the photo within the whole library, so dragging inside "Just
  // uploaded" (or with newest-first on) keeps every other photo where it was.
  const handleDragEnd = useStableCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = orderedImages.map((img) => img.id);
    const from = ids.indexOf(Number(active.id));
    const to = ids.indexOf(Number(over.id));
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);

    setOptimisticOrder(ids);
    try {
      await reorderImages(ids.map((id, i) => ({ id, sort_order: i })));
      onRefresh();
    } catch (err) {
      console.error("Reorder failed:", err);
      setOptimisticOrder(null);
    }
  });

  const handleDismissNoFace = async () => {
    if (!confirm("Move all photos with no detected face to Trash? You can restore them later.")) return;
    setDismissingNoFace(true);
    try {
      const result = await deleteNoFaceImages();
      setUndoIds(result.image_ids); setNotice(`${result.deleted} photos moved to Trash.`);
      onRefresh();
    } catch (err) {
      console.error("Failed to dismiss no-face images:", err);
    } finally {
      setDismissingNoFace(false);
    }
  };

  // Split into three groups
  const noFaceImages = orderedImages.filter((img) => !img.face_detected);
  const faceImages = orderedImages.filter((img) => img.face_detected);
  const recentImages = faceImages.filter((img) => recentUploadIds.has(img.id));
  // The main list always holds every photo, including ones just uploaded, so
  // it never looks out of date; "Just uploaded" is an extra shortcut on top.
  const previousImagesRaw = faceImages;
  const alignedCount = images.filter((img) => img.has_aligned).length;
  const failedCount = noFaceImages.length;

  // Filter and sort previous images
  const previousImagesFiltered = previousImagesRaw.filter((img) => {
    const day = img.photo_taken_at?.slice(0, 10) ?? "";
    if (month && !day.startsWith(month)) return false;
    if (dateFrom && (!day || day < dateFrom)) return false;
    if (dateTo && (!day || day > dateTo)) return false;
    if (!librarySearch) return true;
    
    const searchLower = librarySearch.toLowerCase();
    
    // Search in filename
    if (`${img.original_filename} ${img.source_filename ?? ""} ${img.photo_taken_at ?? ""}`.toLowerCase().includes(searchLower)) {
      return true;
    }
    
    // Search in date
    if (img.photo_taken_at) {
      const dateStr = new Date(img.photo_taken_at).toLocaleDateString().toLowerCase();
      if (dateStr.includes(searchLower)) {
        return true;
      }
    }
    
    return false;
  });

  // Already in library order (oldest first); newest first just flips it.
  const previousImages = sortAscending ? previousImagesFiltered : [...previousImagesFiltered].reverse();

  const cardProps = {
    deletingId,
    realigningId,
    onDelete: handleDelete,
    onToggle: handleToggle,
    onRealign: handleRealign,
    onChooseFace,
    selectedIds,
    onSelect: selecting ? selectPhoto : undefined,
  };

  const renderSortableGrid = (list: ImageRecord[], enableDrag: boolean = true, testIdPrefix: string = "image-card") => {
    const content = <WindowedLibrary items={list} view={view} className={view === "list" ? s.list : s.grid} frozen={dragging}
      render={img => enableDrag && !selecting
        ? <SortableCard img={img} {...cardProps} testIdPrefix={testIdPrefix} layout={view} />
        : <StaticCard img={img} {...cardProps} layout={view} />} />;
    if (!enableDrag || selecting) return content;
    return <DndContext sensors={sensors} collisionDetection={closestCenter}
      onDragStart={() => { setDragging(true); onDraggingChange?.(true); }}
      onDragCancel={() => { setDragging(false); onDraggingChange?.(false); }}
      onDragEnd={e => { setDragging(false); onDraggingChange?.(false); handleDragEnd(e); }}>
      <SortableContext items={list.map(img => img.id)} strategy={view === "list" ? verticalListSortingStrategy : rectSortingStrategy}>
        {content}
      </SortableContext>
    </DndContext>;
  };

  const groupToggle = (
    testId: string,
    collapsed: boolean,
    onClick: () => void,
    label: React.ReactNode,
    count: React.ReactNode,
    tone?: "warning"
  ) => (
    <button
      data-testid={testId}
      className={cx(s.groupToggle, tone === "warning" && s.groupToggleWarning)}
      onClick={onClick}
      aria-expanded={!collapsed}
    >
      <Icon name="chevron" size={14} className={cx(s.chevron, collapsed && s.chevronCollapsed)} />
      <span className={s.groupTitle}>{label}</span>
      <span className={s.groupCount}>({count})</span>
    </button>
  );

  return (
    <div className={s.section}>
      {/* Overall header */}
      <div className={s.headerRow}>
        <h2 className={s.heading}>
          Library <span className={s.count}>({images.length} images)</span>
        </h2>
        <div className={s.stats}>
          <span className={s.statAligned}>
            <span className={s.statDot} />
            {alignedCount} aligned
          </span>
          {failedCount > 0 && (
            <span className={s.statFailed}>
              <span className={s.statDot} />
              {failedCount} no face
            </span>
          )}
        </div>
      </div>

      {notice && <p role="status" className={s.notice}>{notice} {undoIds.length > 0 && <Button disabled={busy} onClick={undo}>Undo trash</Button>}</p>}
      {images.length > 0 && <div className={s.archiveControls}>
        <Button aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setSelectedIds(new Set()); }}>{selecting ? "Done selecting" : "Select photos"}</Button>
        {selecting && <>
          <span>{selectedIds.size} selected</span>
          <Button onClick={() => setSelectedIds(new Set(previousImages.slice(0, 1000).map(p => p.id)))}>Select filtered photos</Button>
          <Button disabled={busy || !selectedIds.size} onClick={() => batchAction("trash")}>Move to Trash</Button>
          <select className={forms.field} aria-label="Destination person" value={destination} onChange={e => setDestination(e.target.value)}>
            <option value="">Choose person…</option>{profiles.filter(p => p.id !== profileId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {(["move", "copy"] as const).map(mode => <Button key={mode} disabled={busy || !selectedIds.size || !destination}
            onClick={() => batchAction("transfer", { mode, target_profile_id: Number(destination) })}>{mode === "move" ? "Move to person" : "Copy to person"}</Button>)}
        </>}
      </div>}
      {images.length === 0 ? (
        <div className={s.empty}>
          <p data-testid="empty-library-message" className={s.emptyText}>
            No images yet. Upload some selfies to get started!
          </p>
        </div>
      ) : (
        <>
          {/* No Face Detected group */}
          {noFaceImages.length > 0 && (
            <div data-testid="no-face-group" className={cx(s.group, s.noFaceGroup)}>
              <div className={s.groupHeader}>
                {groupToggle(
                  "no-face-collapse-button",
                  noFaceCollapsed,
                  () => setNoFaceCollapsed(!noFaceCollapsed),
                  "No face detected",
                  noFaceImages.length,
                  "warning"
                )}
                <Button
                  data-testid="dismiss-all-button"
                  size="sm"
                  variant="danger"
                  icon="trash"
                  onClick={handleDismissNoFace}
                  disabled={dismissingNoFace}
                >
                  {dismissingNoFace ? "Deleting..." : "Dismiss All"}
                </Button>
              </div>
              {!noFaceCollapsed && (
                <>
                  <p className={s.groupHint}>
                    These photos couldn't be aligned and won't appear in the timelapse.
                  </p>
                  <WindowedLibrary items={noFaceImages} view="grid" className={s.grid} frozen={false} render={img => (
                      <div className={cx(s.card, s.noFaceCard)} data-testid={`no-face-card-${img.id}`}>
                        <div className={s.thumbWrap}>
                          <ResilientImage src={getOriginalImageUrl(img.id, img.content_hash, "thumb")} alt={img.original_filename}
                            className={s.thumbnail} loading="lazy" decoding="async" />
                        </div>
                        {selecting && <label className={s.cardSelect}><input type="checkbox"
                          aria-label={`Select photo ${img.source_filename || img.original_filename}`} checked={selectedIds.has(img.id)} onChange={() => selectPhoto(img.id)} /></label>}
                        <div className={s.cardFooter}><span className={s.date} title={img.original_filename}>{img.original_filename}</span></div>
                      </div>
                  )} />
                </>
              )}
            </div>
          )}

          {/* Just Uploaded group */}
          {recentImages.length > 0 && (
            <div data-testid="just-uploaded-group" className={s.group}>
              <div className={s.groupHeader}>
                {groupToggle(
                  "just-uploaded-collapse-button",
                  recentCollapsed,
                  () => setRecentCollapsed(!recentCollapsed),
                  "Just uploaded",
                  recentImages.length
                )}
                <Button data-testid="dismiss-recent-button" size="sm" variant="ghost" onClick={onDismissRecent}>
                  Dismiss
                </Button>
              </div>
              {!recentCollapsed && renderSortableGrid(recentImages, true, "recent-image-card")}
            </div>
          )}

          {/* Previously Processed group */}
          {previousImagesRaw.length > 0 && (
            <div data-testid="previously-processed-group" className={s.group}>
              <div className={s.groupHeader}>
                {groupToggle(
                  "previously-processed-collapse-button",
                  previousCollapsed,
                  () => setPreviousCollapsed(!previousCollapsed),
                  "All photos",
                  previousImages.length === previousImagesRaw.length
                    ? previousImages.length
                    : `${previousImages.length} of ${previousImagesRaw.length}`
                )}
              </div>
              {!previousCollapsed && (
                <>
                  <div className={s.toolbar}>
                    <label className={s.search}>
                      <Icon name="search" size={15} className={s.searchIcon} />
                      <input
                        data-testid="library-search-input"
                        type="search"
                        placeholder="Search by filename or date…"
                        aria-label="Search photos"
                        value={librarySearch}
                        onChange={(e) => setLibrarySearch(e.target.value)}
                        className={cx(forms.field, s.searchInput)}
                      />
                    </label>
                    <Button
                      data-testid="library-sort-button"
                      icon={sortAscending ? "sortAsc" : "sortDesc"}
                      onClick={() => setSortAscending(!sortAscending)}
                      title={sortAscending ? "Sort descending" : "Sort ascending"}
                    >
                      {sortAscending ? "Oldest first" : "Newest first"}
                    </Button>
                    <div className={s.viewToggle} role="group" aria-label="Library view">
                      {(["grid", "list"] as const).map((v) => (
                        <IconButton
                          key={v}
                          data-testid={`library-view-${v}`}
                          icon={v}
                          label={v === "grid" ? "Grid view" : "List view"}
                          size="sm"
                          aria-pressed={view === v}
                          className={cx(s.viewToggleBtn, view === v && s.viewToggleActive)}
                          onClick={() => setView(v)}
                        />
                      ))}
                    </div>
                  </div>
                  <div className={s.archiveControls}>
                    <label>Jump to <select className={forms.field} aria-label="Jump to year or month" value={month} onChange={e => setMonth(e.target.value)}>
                      <option value="">All years</option>
                      {[...new Set(faceImages.flatMap(p => p.photo_taken_at ? [p.photo_taken_at.slice(0, 4), p.photo_taken_at.slice(0, 7)] : []))].sort().map(value => <option key={value} value={value}>{value}</option>)}
                    </select></label>
                    <label>From <input className={forms.field} type="date" aria-label="Library start date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></label>
                    <label>To <input className={forms.field} type="date" aria-label="Library end date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></label>
                    {(month || dateFrom || dateTo) && <Button onClick={() => { setMonth(""); setDateFrom(""); setDateTo(""); }}>Clear dates</Button>}
                    <span>{previousImages.length} photos</span>
                  </div>
                  {dateFrom && dateTo && dateFrom > dateTo && <p role="alert">Start date must be before the end date.</p>}
                  {previousImages.length > 0 ? (
                    renderSortableGrid(previousImages, !librarySearch && !month && !dateFrom && !dateTo, "previous-image-card")
                  ) : (
                    <div data-testid="previous-no-results" className={s.noResults}>
                      No images match your filters
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
