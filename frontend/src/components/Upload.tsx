import React, { useCallback, useRef, useState } from "react";
import {
  uploadImages,
  alignImages,
  deleteImage,
  getOriginalImageUrl,
  UploadedImage,
  AlignProgress,
  AlignResponse,
  UploadProgress,
} from "../api";
import styles from "./Upload.styles";

interface UploadProps {
  onAlignComplete: (result: AlignResponse) => void;
}

type Stage = "idle" | "uploading" | "staging" | "aligning";

export default function Upload({ onAlignComplete }: UploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [uploadCurrent, setUploadCurrent] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [stagedImages, setStagedImages] = useState<UploadedImage[]>([]);
  const [alignCurrent, setAlignCurrent] = useState(0);
  const [alignTotal, setAlignTotal] = useState(0);
  const [lastResult, setLastResult] = useState<AlignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        await deleteImage(id);
        setStagedImages((prev) => {
          const next = prev.filter((img) => img.id !== id);
          if (next.length === 0) setStage("idle");
          return next;
        });
      } catch (err) {
        console.error("Failed to remove image:", err);
      }
    },
    []
  );

  const handleAlign = useCallback(async () => {
    if (stagedImages.length === 0) return;

    setStage("aligning");
    setAlignCurrent(0);
    setAlignTotal(stagedImages.length);

    try {
      const result = await alignImages(
        stagedImages.map((img) => img.id),
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
    // Delete all staged images from the server
    for (const img of stagedImages) {
      try {
        await deleteImage(img.id);
      } catch {
        // best effort
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const progressPercent =
    alignTotal > 0 ? Math.round((alignCurrent / alignTotal) * 100) : 0;

  const succeededCount =
    lastResult?.results.filter((r) => r.face_detected).length ?? 0;
  const failedCount =
    lastResult?.results.filter((r) => !r.face_detected).length ?? 0;

  return (
    <div style={styles.section}>
      <h2 style={styles.heading}>Upload Selfies</h2>

      {/* Drop zone — only shown in idle / uploading states */}
      {(stage === "idle" || stage === "uploading") && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
          style={{
            ...styles.dropzone,
            ...(isDragging ? styles.dropzoneActive : {}),
            ...(stage === "uploading" ? styles.dropzoneUploading : {}),
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleInputChange}
            style={{ display: "none" }}
          />

          {stage === "uploading" ? (
            <div style={styles.uploadProgress}>
              <div style={styles.progressBarOuter}>
                <div
                  style={{
                    ...styles.progressBarInner,
                    width: `${uploadTotal > 0 ? Math.round((uploadCurrent / uploadTotal) * 100) : 0}%`,
                  }}
                />
              </div>
              <p style={styles.progressText}>
                Uploading {uploadCurrent} of {uploadTotal} files...
              </p>
            </div>
          ) : (
            <>
              <div style={styles.icon}>+</div>
              <p style={styles.dropText}>Drop images here or click to browse</p>
              <p style={styles.dropSubtext}>Supports JPG, PNG, WebP, HEIC</p>
            </>
          )}
        </div>
      )}

      {/* Staging area — review uploaded originals */}
      {stage === "staging" && (
        <div style={styles.stagingContainer}>
          <div style={styles.stagingHeader}>
            <span style={styles.stagingTitle}>
              {stagedImages.length} image{stagedImages.length !== 1 ? "s" : ""}{" "}
              ready to align
            </span>
            <button style={styles.cancelBtn} onClick={handleCancelStaged}>
              Cancel
            </button>
          </div>

          <div style={styles.stagingGrid}>
            {stagedImages.map((img) => (
              <div key={img.id} style={styles.stagingItem}>
                <img
                  src={getOriginalImageUrl(img.id)}
                  alt={img.source_filename || img.original_filename}
                  style={styles.stagingThumb}
                />
                <button
                  style={styles.removeBtn}
                  onClick={() => handleRemoveStaged(img.id)}
                  title="Remove"
                >
                  ×
                </button>
                <span style={styles.stagingLabel}>
                  {img.source_filename || img.original_filename}
                </span>
              </div>
            ))}
          </div>

          <button style={styles.alignBtn} onClick={handleAlign}>
            Align Images
          </button>
        </div>
      )}

      {/* Aligning progress */}
      {stage === "aligning" && (
        <div style={styles.progressContainer}>
          <div style={styles.progressBarOuter}>
            <div
              style={{
                ...styles.progressBarInner,
                width: `${progressPercent}%`,
              }}
            />
          </div>
          <p style={styles.progressText}>
            Aligning image {alignCurrent} of {alignTotal}...
          </p>
        </div>
      )}

      {/* Result summary */}
      {lastResult && stage === "idle" && (
        <div style={styles.results}>
          <span style={styles.resultSuccess}>
            {succeededCount} aligned successfully
          </span>
          {failedCount > 0 && (
            <span style={styles.resultFail}>
              {failedCount} face not detected
            </span>
          )}
        </div>
      )}

      {error && stage === "idle" && (
        <p style={styles.error}>{error}</p>
      )}
    </div>
  );
}

