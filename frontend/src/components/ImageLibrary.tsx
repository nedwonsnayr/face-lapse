import React, { useState } from "react";
import {
  ImageRecord,
  getAlignedImageUrl,
  getOriginalImageUrl,
  deleteImage,
  toggleImage,
  reorderImages,
  deleteNoFaceImages,
} from "../api";

interface ImageLibraryProps {
  images: ImageRecord[];
  recentUploadIds: Set<number>;
  onRefresh: () => void;
  onDismissRecent: () => void;
}

export default function ImageLibrary({
  images,
  recentUploadIds,
  onRefresh,
  onDismissRecent,
}: ImageLibraryProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [previousCollapsed, setPreviousCollapsed] = useState(false);
  const [recentCollapsed, setRecentCollapsed] = useState(false);
  const [noFaceCollapsed, setNoFaceCollapsed] = useState(false);
  const [dismissingNoFace, setDismissingNoFace] = useState(false);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this image?")) return;
    setDeletingId(id);
    try {
      await deleteImage(id);
      onRefresh();
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async (id: number) => {
    try {
      await toggleImage(id);
      onRefresh();
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  };

  const handleMoveInList = async (
    list: ImageRecord[],
    idx: number,
    direction: -1 | 1
  ) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    // Build new sort_order assignments for all images in the full list
    // We swap the two items and assign sequential sort_order values
    const reordered = [...list];
    [reordered[idx], reordered[targetIdx]] = [
      reordered[targetIdx],
      reordered[idx],
    ];
    const items = reordered.map((img, i) => ({
      id: img.id,
      sort_order: i,
    }));

    try {
      await reorderImages(items);
      onRefresh();
    } catch (err) {
      console.error("Reorder failed:", err);
    }
  };

  const handleDismissNoFace = async () => {
    if (!confirm("Delete all images where no face was detected?")) return;
    setDismissingNoFace(true);
    try {
      await deleteNoFaceImages();
      onRefresh();
    } catch (err) {
      console.error("Failed to dismiss no-face images:", err);
    } finally {
      setDismissingNoFace(false);
    }
  };

  // Split into three groups: no-face, recent (with face), previous (with face)
  const noFaceImages = images.filter((img) => !img.face_detected);
  const faceImages = images.filter((img) => img.face_detected);
  const recentImages = faceImages.filter((img) => recentUploadIds.has(img.id));
  const previousImages = faceImages.filter(
    (img) => !recentUploadIds.has(img.id)
  );
  const alignedCount = images.filter((img) => img.has_aligned).length;
  const failedCount = noFaceImages.length;

  const renderImageCard = (
    img: ImageRecord,
    idx: number,
    list: ImageRecord[]
  ) => (
    <div
      key={img.id}
      style={{
        ...styles.card,
        ...(img.included_in_video ? {} : styles.cardExcluded),
      }}
    >
      {img.has_aligned ? (
        <img
          src={getAlignedImageUrl(img.id)}
          alt={img.original_filename}
          style={styles.thumbnail}
          loading="lazy"
        />
      ) : (
        <div style={styles.noFace}>
          <span style={styles.noFaceIcon}>!</span>
          <span style={styles.noFaceText}>No face</span>
        </div>
      )}

      <div style={styles.cardInfo}>
        <p style={styles.filename} title={img.original_filename}>
          {img.original_filename}
        </p>
        {img.photo_taken_at && (
          <p style={styles.date}>
            {new Date(img.photo_taken_at).toLocaleDateString()}
          </p>
        )}
      </div>

      <div style={styles.cardActions}>
        <div style={styles.moveButtons}>
          <button
            style={styles.btnMove}
            onClick={() => handleMoveInList(list, idx, -1)}
            disabled={idx === 0}
            title="Move earlier"
          >
            &#9664;
          </button>
          <button
            style={styles.btnMove}
            onClick={() => handleMoveInList(list, idx, 1)}
            disabled={idx === list.length - 1}
            title="Move later"
          >
            &#9654;
          </button>
        </div>
        {img.has_aligned && (
          <button
            style={{
              ...styles.btnSmall,
              ...(img.included_in_video
                ? styles.btnIncluded
                : styles.btnExcluded),
            }}
            onClick={() => handleToggle(img.id)}
            title={
              img.included_in_video
                ? "Click to exclude from video"
                : "Click to include in video"
            }
          >
            {img.included_in_video ? "In" : "Out"}
          </button>
        )}
        <button
          style={{ ...styles.btnSmall, ...styles.btnDelete }}
          onClick={() => handleDelete(img.id)}
          disabled={deletingId === img.id}
        >
          {deletingId === img.id ? "..." : "Del"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={styles.section}>
      {/* Overall header */}
      <div style={styles.headerRow}>
        <h2 style={styles.heading}>
          Image Library{" "}
          <span style={styles.count}>({images.length} images)</span>
        </h2>
        <div style={styles.stats}>
          <span style={styles.statAligned}>{alignedCount} aligned</span>
          {failedCount > 0 && (
            <span style={styles.statFailed}>{failedCount} no face</span>
          )}
        </div>
      </div>

      {images.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyText}>
            No images yet. Upload some selfies to get started!
          </p>
        </div>
      ) : (
        <>
          {/* No Face Detected group */}
          {noFaceImages.length > 0 && (
            <div style={styles.noFaceGroup}>
              <div style={styles.groupHeader}>
                <button
                  style={styles.collapseBtn}
                  onClick={() => setNoFaceCollapsed(!noFaceCollapsed)}
                >
                  <span
                    style={{
                      ...styles.arrow,
                      transform: noFaceCollapsed
                        ? "rotate(-90deg)"
                        : "rotate(0deg)",
                    }}
                  >
                    &#9660;
                  </span>
                  <span style={styles.noFaceLabel}>
                    No Face Detected{" "}
                    <span style={styles.groupCount}>
                      ({noFaceImages.length})
                    </span>
                  </span>
                </button>
                <button
                  style={styles.dismissNoFaceBtn}
                  onClick={handleDismissNoFace}
                  disabled={dismissingNoFace}
                >
                  {dismissingNoFace ? "Deleting..." : "Dismiss All"}
                </button>
              </div>
              {!noFaceCollapsed && (
                <div style={styles.scrollContainer}>
                  <div style={styles.grid}>
                    {noFaceImages.map((img) => (
                      <div key={img.id} style={styles.noFaceCard}>
                        <img
                          src={getOriginalImageUrl(img.id)}
                          alt={img.original_filename}
                          style={styles.thumbnail}
                          loading="lazy"
                        />
                        <div style={styles.cardInfo}>
                          <p style={styles.filename} title={img.original_filename}>
                            {img.original_filename}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Just Uploaded group */}
          {recentImages.length > 0 && (
            <div style={styles.group}>
              <div style={styles.groupHeader}>
                <button
                  style={styles.collapseBtn}
                  onClick={() => setRecentCollapsed(!recentCollapsed)}
                >
                  <span
                    style={{
                      ...styles.arrow,
                      transform: recentCollapsed
                        ? "rotate(-90deg)"
                        : "rotate(0deg)",
                    }}
                  >
                    &#9660;
                  </span>
                  Just Uploaded{" "}
                  <span style={styles.groupCount}>
                    ({recentImages.length})
                  </span>
                </button>
                <button style={styles.dismissBtn} onClick={onDismissRecent}>
                  Dismiss
                </button>
              </div>
              {!recentCollapsed && (
                <div style={styles.scrollContainer}>
                  <div style={styles.grid}>
                    {recentImages.map((img, idx) =>
                      renderImageCard(img, idx, recentImages)
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Previously Processed group */}
          {previousImages.length > 0 && (
            <div style={styles.group}>
              <div style={styles.groupHeader}>
                <button
                  style={styles.collapseBtn}
                  onClick={() => setPreviousCollapsed(!previousCollapsed)}
                >
                  <span
                    style={{
                      ...styles.arrow,
                      transform: previousCollapsed
                        ? "rotate(-90deg)"
                        : "rotate(0deg)",
                    }}
                  >
                    &#9660;
                  </span>
                  Previously Processed{" "}
                  <span style={styles.groupCount}>
                    ({previousImages.length})
                  </span>
                </button>
              </div>
              {!previousCollapsed && (
                <div style={styles.scrollContainer}>
                  <div style={styles.grid}>
                    {previousImages.map((img, idx) =>
                      renderImageCard(img, idx, previousImages)
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginBottom: 32,
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 8,
  },
  heading: {
    fontSize: 18,
    fontWeight: 600,
    color: "var(--text)",
  },
  count: {
    fontWeight: 400,
    color: "var(--text-muted)",
    fontSize: 14,
  },
  stats: {
    display: "flex",
    gap: 12,
    fontSize: 13,
  },
  statAligned: {
    color: "var(--success)",
  },
  statFailed: {
    color: "var(--warning)",
  },
  empty: {
    padding: "48px 24px",
    textAlign: "center",
    background: "var(--surface)",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
  },
  emptyText: {
    color: "var(--text-muted)",
    fontSize: 14,
  },
  group: {
    marginBottom: 20,
  },
  noFaceGroup: {
    marginBottom: 20,
    border: "1px solid var(--warning)",
    borderRadius: "var(--radius)",
    padding: 12,
    background: "rgba(251, 191, 36, 0.04)",
  },
  noFaceLabel: {
    color: "var(--warning)",
  },
  noFaceCard: {
    background: "var(--bg)",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--warning)",
    overflow: "hidden",
    opacity: 0.8,
  },
  dismissNoFaceBtn: {
    background: "var(--warning)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    color: "#000",
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 14px",
    cursor: "pointer",
  },
  groupHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  collapseBtn: {
    background: "none",
    border: "none",
    color: "var(--text)",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 0",
  },
  arrow: {
    display: "inline-block",
    fontSize: 10,
    transition: "transform 0.2s ease",
  },
  groupCount: {
    fontWeight: 400,
    color: "var(--text-muted)",
    fontSize: 13,
  },
  dismissBtn: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-muted)",
    fontSize: 12,
    padding: "3px 10px",
    cursor: "pointer",
  },
  scrollContainer: {
    maxHeight: 500,
    overflowY: "auto",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    padding: 12,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: 10,
  },
  card: {
    background: "var(--bg)",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    overflow: "hidden",
    transition: "border-color 0.2s",
  },
  cardExcluded: {
    opacity: 0.5,
  },
  thumbnail: {
    width: "100%",
    aspectRatio: "3/4",
    objectFit: "cover",
    display: "block",
  },
  noFace: {
    width: "100%",
    aspectRatio: "3/4",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(251, 191, 36, 0.08)",
    gap: 4,
  },
  noFaceIcon: {
    fontSize: 24,
    fontWeight: 700,
    color: "var(--warning)",
  },
  noFaceText: {
    fontSize: 12,
    color: "var(--warning)",
  },
  cardInfo: {
    padding: "6px 8px 2px",
  },
  filename: {
    fontSize: 11,
    color: "var(--text)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  date: {
    fontSize: 10,
    color: "var(--text-muted)",
    marginTop: 2,
  },
  cardActions: {
    padding: "4px 8px 8px",
    display: "flex",
    gap: 4,
    alignItems: "center",
  },
  moveButtons: {
    display: "flex",
    gap: 2,
  },
  btnMove: {
    fontSize: 9,
    padding: "2px 5px",
    borderRadius: 3,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
    lineHeight: 1,
  },
  btnSmall: {
    fontSize: 11,
    padding: "2px 7px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  btnIncluded: {
    borderColor: "var(--success)",
    color: "var(--success)",
  },
  btnExcluded: {
    borderColor: "var(--text-muted)",
    color: "var(--text-muted)",
  },
  btnDelete: {
    borderColor: "var(--danger)",
    color: "var(--danger)",
    marginLeft: "auto",
  },
};
