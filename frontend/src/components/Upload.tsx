import { useProfileApi } from "../ProfileContext";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ImageRecord, UploadedImage, AlignProgress, AlignResponse, UploadProgress } from "../api";
import { Button, IconButton } from "./ui/Button";
import Icon from "./ui/Icon";
import cx from "./ui/cx";
import s from "./Upload.module.css";

interface UploadProps {
  onAlignComplete: (result: AlignResponse) => void;
  pendingImages?: UploadedImage[];
  personName?: string;
  previousPhoto?: ImageRecord;
  /** Library already has photos: show a slim drop strip instead of the big empty state. */
  compact?: boolean;
}

/** Lets the app shell (top-bar button, drop-anywhere overlay) drive uploads. */
export interface UploadHandle {
  openFilePicker: () => void;
  addFiles: (files: File[]) => void;
}

type Stage = "idle" | "uploading" | "staging" | "aligning";

const DUPLICATE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23ede8df' width='100' height='100'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-family='sans-serif' font-size='11' fill='%23a29c92'%3EDuplicate%3C/text%3E%3C/svg%3E";

const Upload = forwardRef<UploadHandle, UploadProps>(function Upload(
  { onAlignComplete, compact = false, pendingImages, personName = "this person", previousPhoto },
  ref
) {
  const { uploadImages, alignImages, deleteImage, getOriginalImageUrl, getAlignedImageUrl } = useProfileApi();
  const [isDragging, setIsDragging] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [uploadCurrent, setUploadCurrent] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [stagedImages, setStagedImages] = useState<UploadedImage[]>([]);
  // Recover pending photos, including an upload that finished after we left
  // and returned to this tab. Don't resurrect a stale list after align/cancel.
  const knownPendingIds = useRef(new Set<number>());
  useEffect(() => {
    if (stage !== "idle" || !pendingImages) return;
    const unseen = pendingImages.filter((img) => !knownPendingIds.current.has(img.id));
    if (unseen.length) {
      unseen.forEach((img) => knownPendingIds.current.add(img.id));
      setStagedImages(unseen);
      setStage("staging");
    }
  }, [pendingImages, stage]);
  const [alignCurrent, setAlignCurrent] = useState(0);
  const [alignTotal, setAlignTotal] = useState(0);
  const [lastResult, setLastResult] = useState<AlignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Webcam state
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [guide, setGuide] = useState(true);
  const [delay, setDelay] = useState(3);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => () => clearInterval(countdownTimer.current), []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const handleFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    // Sort by filename — the backend re-sorts by photo date, so this is
    // just a best-effort client-side pre-sort for simple numeric filenames.
    imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    setStage("uploading");
    setUploadCurrent(0);
    setUploadTotal(imageFiles.length);
    setLastResult(null);
    setError(null);

    try {
      const uploaded = await uploadImages(imageFiles, (p: UploadProgress) => {
        setUploadCurrent(p.uploaded);
        setUploadTotal(p.total);
      });
      uploaded.forEach((img) => knownPendingIds.current.add(img.id));
      setStagedImages(uploaded);
      setStage("staging");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Upload failed:", msg);
      setError(msg);
      setStage("idle");
    }
  }, []);

  const handleRemoveStaged = useCallback(
    async (id: number) => {
      try {
        // Only delete if it's not a duplicate (duplicates aren't in DB yet)
        const image = stagedImages.find((img) => img.id === id);
        if (image && !image.skipped) {
          await deleteImage(id);
        }
        setStagedImages((prev) => {
          const next = prev.filter((img) => img.id !== id);
          if (next.length === 0) setStage("idle");
          return next;
        });
      } catch (err) {
        console.error("Failed to remove image:", err);
      }
    },
    [stagedImages]
  );

  const handleAlign = useCallback(async () => {
    // Filter out duplicates - only align new images (must have valid ID > 0 and not skipped)
    const imagesToAlign = stagedImages.filter((img) => !img.skipped && img.id > 0);
    if (imagesToAlign.length === 0) return;

    const imageIds = imagesToAlign.map((img) => img.id);

    setStage("aligning");
    setAlignCurrent(0);
    setAlignTotal(imagesToAlign.length);

    try {
      const result = await alignImages(
        imageIds,
        (progress: AlignProgress) => {
          setAlignCurrent(progress.current);
          setAlignTotal(progress.total);
        }
      );
      setLastResult(result);
      setStagedImages([]);
      setStage("idle");
      onAlignComplete(result);
    } catch (err) {
      console.error("Alignment failed:", err);
      setStage("staging"); // go back to staging so user can retry
    }
  }, [stagedImages, onAlignComplete]);

  const handleCancelStaged = useCallback(async () => {
    // Delete only non-duplicate staged images from the server
    // (duplicates weren't created, so nothing to delete)
    for (const img of stagedImages) {
      if (!img.skipped) {
        try {
          await deleteImage(img.id);
        } catch {
          // best effort
        }
      }
    }
    setStagedImages([]);
    setStage("idle");
  }, [stagedImages]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(Array.from(e.dataTransfer.files));
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = () => {
    if (stage === "idle") fileInputRef.current?.click();
  };

  const startWebcam = useCallback(async () => {
    try {
      setWebcamError(null);
      
      // Request stream first
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "user", // Front-facing camera
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      
      if (!mounted.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      setIsWebcamActive(true); // Set active after stream is ready
      
      // Wait for modal to render, then set stream on video
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play()
            .catch((err) => {
              console.error("Video play error:", err);
              setWebcamError("Failed to start video preview: " + err.message);
            });
        }
      }, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to access webcam";
      console.error("Webcam error:", msg);
      setWebcamError(msg);
      setIsWebcamActive(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  }, []);

  const stopWebcam = useCallback(() => {
    clearInterval(countdownTimer.current); setCountdown(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsWebcamActive(false);
    setWebcamError(null);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    
    // Check if video is ready
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setWebcamError("Video not ready. Please wait a moment and try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0);

    // Convert canvas to blob, then to File
    canvas.toBlob(
      (blob) => {
        if (!blob || !mounted.current || !streamRef.current) return;
        
        // Create a File from the blob with a timestamp filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const file = new File([blob], `webcam-${timestamp}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });

        // Stop webcam and upload the photo
        stopWebcam();
        handleFiles([file]);
      },
      "image/jpeg",
      0.95 // Quality
    );
  }, [stopWebcam, handleFiles]);

  const startCountdown = () => {
    if (countdown !== null) { clearInterval(countdownTimer.current); setCountdown(null); return; }
    if (!delay) { capturePhoto(); return; }
    let remaining = delay;
    setCountdown(remaining);
    countdownTimer.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) { clearInterval(countdownTimer.current); setCountdown(null); capturePhoto(); }
      else setCountdown(remaining);
    }, 1000);
  };
  useEffect(() => {
    if (!isWebcamActive) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") stopWebcam(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [isWebcamActive, stopWebcam]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const progressPercent =
    alignTotal > 0 ? Math.round((alignCurrent / alignTotal) * 100) : 0;

  const succeededCount =
    lastResult?.results.filter((r) => r.face_detected).length ?? 0;
  const failedCount =
    lastResult?.results.filter((r) => !r.face_detected && !r.needs_face_selection).length ?? 0;

  // Calculate duplicate count and non-duplicate count
  const duplicateCount = stagedImages.filter((img) => img.skipped).length;
  const nonDuplicateCount = stagedImages.filter((img) => !img.skipped).length;
  const canAlign = nonDuplicateCount > 0;

  useImperativeHandle(
    ref,
    () => ({
      openFilePicker: () => {
        if (stage === "idle") fileInputRef.current?.click();
      },
      addFiles: (files: File[]) => {
        if (stage === "idle") handleFiles(files);
      },
    }),
    [stage, handleFiles]
  );

  // Cleanup webcam on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const uploadPercent =
    uploadTotal > 0 ? Math.round((uploadCurrent / uploadTotal) * 100) : 0;

  return (
    <div className={s.section}>
      {/* Single file input for the whole app (top bar, dropzone and tests all use it) */}
      <input
        data-testid="file-input"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleInputChange}
        hidden
      />

      {/* Drop zone: big empty state, or a slim strip once the library has photos */}
      {(stage === "idle" || stage === "uploading") && (
        <div
          data-testid="dropzone"
          role="button"
          tabIndex={stage === "idle" ? 0 : -1}
          aria-label="Add photos"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              handleClick();
            }
          }}
          className={cx(
            s.dropzone,
            compact ? s.dropzoneCompact : s.dropzoneHero,
            isDragging && s.dropzoneActive,
            stage === "uploading" && s.dropzoneUploading
          )}
        >
          {stage === "uploading" ? (
            <div data-testid="upload-progress" className={s.progress}>
              <p data-testid="upload-progress-text" className={s.progressText}>
                Uploading {uploadCurrent} of {uploadTotal} files...
              </p>
              <div className={s.progressTrack}>
                <div
                  data-testid="upload-progress-bar"
                  className={s.progressFill}
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
            </div>
          ) : compact ? (
            <>
              <span className={s.compactIcon}>
                <Icon name="upload" size={18} />
              </span>
              <div className={s.compactText}>
                <p data-testid="dropzone-text" className={s.dropText}>
                  Drop images here or click to browse
                </p>
                <p className={s.dropSubtext}>JPG, PNG, WebP, HEIC</p>
              </div>
              <Button
                data-testid="webcam-button"
                size="sm"
                icon="camera"
                onClick={(e) => {
                  e.stopPropagation();
                  startWebcam();
                }}
              >
                Take Photo
              </Button>
            </>
          ) : (
            <>
              <p className={s.heroEyebrow}>Face Lapse</p>
              <h2 className={s.heroTitle}>
                Start your <em>timelapse</em>
              </h2>
              <p data-testid="dropzone-text" className={s.heroText}>
                Drop images here or click to browse
              </p>
              <p className={s.dropSubtext}>
                Selfies are sorted by photo date and aligned by eye position. JPG, PNG, WebP, HEIC.
              </p>
              <div className={s.heroActions}>
                <Button
                  variant="primary"
                  icon="plus"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClick();
                  }}
                >
                  Choose photos
                </Button>
                <Button
                  data-testid="webcam-button"
                  icon="camera"
                  onClick={(e) => {
                    e.stopPropagation();
                    startWebcam();
                  }}
                >
                  Take Photo
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Staging tray: review uploaded originals before aligning */}
      {stage === "staging" && (
        <div className={s.tray}>
          <div className={s.trayHeader}>
            <div>
              <p className={s.eyebrow}>Ready to align</p>
              <span data-testid="staging-image-count" className={s.trayTitle}>
                {stagedImages.length} image{stagedImages.length !== 1 ? "s" : ""}{" "}
                {nonDuplicateCount > 0 && `(${nonDuplicateCount} ready to align)`}
              </span>
            </div>
            <div className={s.trayActions}>
              <Button data-testid="cancel-staged-button" variant="ghost" onClick={handleCancelStaged}>
                Cancel
              </Button>
              <Button
                data-testid="align-images-button"
                variant="primary"
                onClick={handleAlign}
                disabled={!canAlign}
              >
                {canAlign
                  ? "Align Images"
                  : duplicateCount > 0
                  ? "No new images to align"
                  : "Align Images"}
              </Button>
            </div>
          </div>

          {duplicateCount > 0 && (
            <div data-testid="duplicate-warning" className={s.notice}>
              <Icon name="alert" size={16} />
              <span>
                {duplicateCount} duplicate{duplicateCount !== 1 ? "s" : ""} detected and will not be used for alignment.
              </span>
            </div>
          )}

          <div data-testid="staging-grid" className={s.stagingGrid}>
            {stagedImages.map((img, idx) => (
              <figure
                key={`${img.id}-${img.source_filename || img.original_filename}-${idx}`}
                data-testid={img.skipped ? "staging-item-duplicate" : "staging-item-new"}
                className={cx(s.stagingItem, img.skipped && s.stagingItemDuplicate)}
              >
                <div className={s.stagingThumbWrap}>
                  <img
                    src={
                      img.id > 0
                        ? getOriginalImageUrl(img.id, img.content_hash, "thumb")
                        : DUPLICATE_PLACEHOLDER
                    }
                    alt={img.source_filename || img.original_filename}
                    className={s.stagingThumb}
                  />
                  {img.skipped && (
                    <span data-testid="duplicate-badge" className={s.duplicateBadge}>
                      Duplicate
                    </span>
                  )}
                  {!img.skipped && (
                    <IconButton
                      data-testid="remove-staged-button"
                      icon="close"
                      label="Remove"
                      variant="overlay"
                      size="sm"
                      tone="danger"
                      className={s.removeBtn}
                      onClick={() => handleRemoveStaged(img.id)}
                    />
                  )}
                </div>
                <figcaption className={s.stagingCaption}>
                  <span className={s.stagingLabel}>
                    {img.source_filename || img.original_filename}
                  </span>
                  {img.photo_taken_at && (
                    <span className={s.stagingDate}>
                      {new Date(img.photo_taken_at).toLocaleDateString()}
                    </span>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {/* Aligning progress */}
      {stage === "aligning" && (
        <div data-testid="alignment-progress-container" className={s.tray}>
          <div className={s.progress}>
            <p data-testid="alignment-progress" className={s.progressText}>
              Aligning image {alignCurrent} of {alignTotal}...
            </p>
            <div className={s.progressTrack}>
              <div
                data-testid="alignment-progress-bar"
                className={s.progressFill}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Result summary */}
      {lastResult && stage === "idle" && (
        <div data-testid="alignment-results" className={s.results}>
          <span data-testid="alignment-result-success" className={s.resultSuccess}>
            <Icon name="check" size={14} />
            {succeededCount} aligned successfully · Saved to {personName}
          </span>
          {lastResult.results.some((r) => r.needs_face_selection) && (
            <span className={s.resultFail}>Multiple faces found. Choose your face below.</span>
          )}
          {failedCount > 0 && (
            <span data-testid="alignment-result-failed" className={s.resultFail}>
              <Icon name="alert" size={14} />
              {failedCount} face not detected
            </span>
          )}
        </div>
      )}

      {error && stage === "idle" && (
        <p data-testid="upload-error" className={s.error}>
          {error}
        </p>
      )}

      {/* Webcam modal */}
      {isWebcamActive && (
        <div
          data-testid="webcam-modal"
          className={s.modalBackdrop}
          onClick={(e) => {
            // Close on backdrop click
            if (e.target === e.currentTarget) {
              stopWebcam();
            }
          }}
        >
          <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="webcam-title">
            <div className={s.modalHeader}>
              <h3 id="webcam-title" className={s.modalTitle}>
                Take a photo for {personName}
              </h3>
              <IconButton
                data-testid="webcam-close-button"
                icon="close"
                label="Close"
                onClick={stopWebcam}
              />
            </div>
            {webcamError ? (
              <div className={s.webcamError}>
                <p>{webcamError}</p>
                <Button onClick={startWebcam}>Try Again</Button>
              </div>
            ) : (
              <>
                <div className={s.videoFrame} style={{ position: "relative" }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={s.video}
                    data-testid="webcam-video"
                    onLoadedMetadata={() => {
                      // Ensure video plays when metadata loads
                      if (videoRef.current) {
                        videoRef.current.play().catch((err) => {
                          console.error("Video play error on metadata:", err);
                        });
                      }
                    }}
                    onError={(e) => {
                      console.error("Video error:", e);
                      setWebcamError("Video error occurred");
                    }}
                  />
                  {guide && previousPhoto && <img className={s.cameraGuide}
                    src={getAlignedImageUrl(previousPhoto.id, previousPhoto.content_hash, "frame")} alt="Previous selfie framing guide" />}
                  {countdown !== null && <span className={s.countdown} role="status" aria-live="assertive">{countdown}</span>}
                </div>
                <div className={s.cameraSettings}>
                  {previousPhoto && <label><input type="checkbox" checked={guide} onChange={e => setGuide(e.target.checked)} /> Previous selfie guide</label>}
                  <label>Timer <select aria-label="Capture timer" value={delay} onChange={e => setDelay(Number(e.target.value))} disabled={countdown !== null}>
                    <option value={0}>Off</option><option value={3}>3 seconds</option><option value={5}>5 seconds</option>
                  </select></label>
                </div>
                <div className={s.modalControls}>
                  <button
                    data-testid="webcam-capture-button"
                    className={s.shutter}
                    onClick={startCountdown}
                    aria-label={countdown === null ? "Capture" : "Cancel countdown"}
                    title="Capture"
                  >
                    <span className={s.shutterInner} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default Upload;
