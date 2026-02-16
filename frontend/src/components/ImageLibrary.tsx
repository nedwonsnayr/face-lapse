import React, { useCallback, useState } from "react";
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
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ImageRecord,
  getAlignedImageUrl,
  getOriginalImageUrl,
  deleteImage,
  toggleImage,
  reorderImages,
  deleteNoFaceImages,
  realignImage,
} from "../api";
import styles from "./ImageLibrary.styles";

/* ── Props ─────────────────────────────────────────────── */

interface ImageLibraryProps {
  images: ImageRecord[];
  recentUploadIds: Set<number>;
  onRefresh: () => void;
  onDismissRecent: () => void;
}

/* ── Sortable card ─────────────────────────────────────── */

interface SortableCardProps {
  img: ImageRecord;
  deletingId: number | null;
  realigningId: number | null;
  onDelete: (id: number) => void;
  onToggle: (id: number) => void;
  onRealign: (id: number) => void;
  testIdPrefix?: string;
}

function SortableCard({ img, deletingId, realigningId, onDelete, onToggle, onRealign, testIdPrefix = "image-card" }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: img.id });

  const style: React.CSSProperties = {
    ...styles.card,
    ...(img.included_in_video ? {} : styles.cardExcluded),
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} data-testid={`${testIdPrefix}-${img.id}`}>
      {/* Drag handle */}
      <div {...attributes} {...listeners} style={styles.dragHandle} title="Drag to reorder">
        ⠿
      </div>

      {img.has_aligned ? (
        <img
          src={`${getAlignedImageUrl(img.id)}?v=${img.id}-${img.original_filename}`}
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
        {img.has_aligned && (
          <button
            data-testid={`toggle-include-button-${img.id}`}
            style={{
              ...styles.btnSmall,
              ...(img.included_in_video ? styles.btnIncluded : styles.btnExcluded),
            }}
            onClick={() => onToggle(img.id)}
            title={img.included_in_video ? "Exclude from video" : "Include in video"}
          >
            {img.included_in_video ? "In" : "Out"}
          </button>
        )}
        <button
          data-testid={`realign-button-${img.id}`}
          style={{ ...styles.btnSmall, ...styles.btnRealign }}
          onClick={() => onRealign(img.id)}
          disabled={realigningId === img.id}
          title="Re-run face alignment"
        >
          {realigningId === img.id ? "..." : "⟳"}
        </button>
        <button
          data-testid={`delete-button-${img.id}`}
          style={{ ...styles.btnSmall, ...styles.btnDelete }}
          onClick={() => onDelete(img.id)}
          disabled={deletingId === img.id}
        >
          {deletingId === img.id ? "..." : "Del"}
        </button>
      </div>
    </div>
  );
}

/* ── Main component ───────────────────────────────────── */

export default function ImageLibrary({
  images,
  recentUploadIds,
  onRefresh,
  onDismissRecent,
}: ImageLibraryProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [realigningId, setRealigningId] = useState<number | null>(null);
  const [previousCollapsed, setPreviousCollapsed] = useState(true);
  const [recentCollapsed, setRecentCollapsed] = useState(false);
  const [noFaceCollapsed, setNoFaceCollapsed] = useState(false);
  const [dismissingNoFace, setDismissingNoFace] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [sortAscending, setSortAscending] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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

  const handleRealign = async (id: number) => {
    setRealigningId(id);
    try {
      await realignImage(id);
      onRefresh();
    } catch (err) {
      console.error("Re-align failed:", err);
    } finally {
      setRealigningId(null);
    }
  };

  const handleDragEnd = useCallback(
    async (event: DragEndEvent, list: ImageRecord[]) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIdx = list.findIndex((img) => img.id === active.id);
      const newIdx = list.findIndex((img) => img.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;

      const reordered = [...list];
      const [moved] = reordered.splice(oldIdx, 1);
      reordered.splice(newIdx, 0, moved);

      const items = reordered.map((img, i) => ({ id: img.id, sort_order: i }));
      try {
        await reorderImages(items);
        onRefresh();
      } catch (err) {
        console.error("Reorder failed:", err);
      }
    },
    [onRefresh]
  );

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

  // Split into three groups
  const noFaceImages = images.filter((img) => !img.face_detected);
  const faceImages = images.filter((img) => img.face_detected);
  const recentImages = faceImages.filter((img) => recentUploadIds.has(img.id));
  const previousImagesRaw = faceImages.filter((img) => !recentUploadIds.has(img.id));
  const alignedCount = images.filter((img) => img.has_aligned).length;
  const failedCount = noFaceImages.length;

  // Extract numeric part from filename for sorting
  const getFilenameNumber = (filename: string): number => {
    const match = filename.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  // Filter and sort previous images
  const previousImagesFiltered = previousImagesRaw.filter((img) => {
    if (!librarySearch) return true;
    
    const searchLower = librarySearch.toLowerCase();
    
    // Search in filename
    if (img.original_filename.toLowerCase().includes(searchLower)) {
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

  const previousImages = [...previousImagesFiltered].sort((a, b) => {
    const aNum = getFilenameNumber(a.original_filename);
    const bNum = getFilenameNumber(b.original_filename);
    
    if (sortAscending) {
      return aNum - bNum;
    } else {
      return bNum - aNum;
    }
  });

  const renderSortableGrid = (list: ImageRecord[], enableDrag: boolean = true, testIdPrefix: string = "image-card") => {
    if (!enableDrag) {
      // Render non-sortable grid (no drag-and-drop)
      return (
        <div style={styles.grid}>
          {list.map((img) => (
            <div key={img.id} style={{ ...styles.card, ...(img.included_in_video ? {} : styles.cardExcluded) }} data-testid={`previous-image-card-${img.id}`}>
              {img.has_aligned ? (
                <img
                  src={`${getAlignedImageUrl(img.id)}?v=${img.id}-${img.original_filename}`}
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
                {img.has_aligned && (
                  <button
                    data-testid={`toggle-include-button-${img.id}`}
                    style={{
                      ...styles.btnSmall,
                      ...(img.included_in_video ? styles.btnIncluded : styles.btnExcluded),
                    }}
                    onClick={() => handleToggle(img.id)}
                    title={img.included_in_video ? "Exclude from video" : "Include in video"}
                  >
                    {img.included_in_video ? "In" : "Out"}
                  </button>
                )}
                <button
                  data-testid={`realign-button-${img.id}`}
                  style={{ ...styles.btnSmall, ...styles.btnRealign }}
                  onClick={() => handleRealign(img.id)}
                  disabled={realigningId === img.id}
                  title="Re-run face alignment"
                >
                  {realigningId === img.id ? "..." : "⟳"}
                </button>
                <button
                  data-testid={`delete-button-${img.id}`}
                  style={{ ...styles.btnSmall, ...styles.btnDelete }}
                  onClick={() => handleDelete(img.id)}
                  disabled={deletingId === img.id}
                >
                  {deletingId === img.id ? "..." : "Del"}
                </button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    // Render sortable grid with drag-and-drop
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e) => handleDragEnd(e, list)}
      >
        <SortableContext items={list.map((img) => img.id)} strategy={rectSortingStrategy}>
          <div style={styles.grid}>
            {list.map((img) => (
              <SortableCard
                key={img.id}
                img={img}
                deletingId={deletingId}
                realigningId={realigningId}
                onDelete={handleDelete}
                onToggle={handleToggle}
                onRealign={handleRealign}
                testIdPrefix={testIdPrefix}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  };

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
          <p data-testid="empty-library-message" style={styles.emptyText}>
            No images yet. Upload some selfies to get started!
          </p>
        </div>
      ) : (
        <>
          {/* No Face Detected group */}
          {noFaceImages.length > 0 && (
            <div data-testid="no-face-group" style={styles.noFaceGroup}>
              <div style={styles.groupHeader}>
                <button
                  data-testid="no-face-collapse-button"
                  style={styles.collapseBtn}
                  onClick={() => setNoFaceCollapsed(!noFaceCollapsed)}
                >
                  <span
                    style={{
                      ...styles.arrow,
                      transform: noFaceCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                    }}
                  >
                    &#9660;
                  </span>
                  <span style={styles.noFaceLabel}>
                    No Face Detected{" "}
                    <span style={styles.groupCount}>({noFaceImages.length})</span>
                  </span>
                </button>
                <button
                  data-testid="dismiss-all-button"
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
                      <div key={img.id} style={styles.noFaceCard} data-testid={`no-face-card-${img.id}`}>
                        <img
                          src={`${getOriginalImageUrl(img.id)}?v=${img.id}-${img.original_filename}`}
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
            <div data-testid="just-uploaded-group" style={styles.group}>
              <div style={styles.groupHeader}>
                <button
                  data-testid="just-uploaded-collapse-button"
                  style={styles.collapseBtn}
                  onClick={() => setRecentCollapsed(!recentCollapsed)}
                >
                  <span
                    style={{
                      ...styles.arrow,
                      transform: recentCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                    }}
                  >
                    &#9660;
                  </span>
                  Just Uploaded{" "}
                  <span style={styles.groupCount}>({recentImages.length})</span>
                </button>
                <button data-testid="dismiss-recent-button" style={styles.dismissBtn} onClick={onDismissRecent}>
                  Dismiss
                </button>
              </div>
              {!recentCollapsed && (
                <div style={styles.scrollContainer}>
                  {renderSortableGrid(recentImages, true, "recent-image-card")}
                </div>
              )}
            </div>
          )}

          {/* Previously Processed group */}
          {previousImagesRaw.length > 0 && (
            <div data-testid="previously-processed-group" style={styles.group}>
              <div style={styles.groupHeader}>
                <button
                  data-testid="previously-processed-collapse-button"
                  style={styles.collapseBtn}
                  onClick={() => setPreviousCollapsed(!previousCollapsed)}
                >
                  <span
                    style={{
                      ...styles.arrow,
                      transform: previousCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                    }}
                  >
                    &#9660;
                  </span>
                  Previously Processed{" "}
                  <span style={styles.groupCount}>
                    ({previousImages.length === previousImagesRaw.length
                      ? previousImages.length
                      : `${previousImages.length} of ${previousImagesRaw.length}`})
                  </span>
                </button>
              </div>
              {!previousCollapsed && (
                <>
                  <div style={styles.previousControls}>
                    <input
                      data-testid="library-search-input"
                      type="text"
                      placeholder="Search by filename or date..."
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      style={styles.searchInput}
                    />
                    <button
                      data-testid="library-sort-button"
                      style={styles.sortButton}
                      onClick={() => setSortAscending(!sortAscending)}
                      title={sortAscending ? "Sort descending" : "Sort ascending"}
                    >
                      {sortAscending ? "↑" : "↓"} Sort
                    </button>
                  </div>
                  <div style={styles.scrollContainer}>
                    {previousImages.length > 0 ? (
                      renderSortableGrid(previousImages, !librarySearch, "previous-image-card")
                    ) : (
                      <div data-testid="previous-no-results" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
                        No images match your filters
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

