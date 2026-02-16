import type React from "react";

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginBottom: 32,
  },
  heading: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 12,
    color: "var(--text)",
  },
  dropzone: {
    border: "2px dashed var(--border)",
    borderRadius: "var(--radius)",
    padding: "48px 24px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.2s ease",
    background: "var(--surface)",
  },
  dropzoneActive: {
    borderColor: "var(--primary)",
    background: "rgba(108, 99, 255, 0.08)",
  },
  dropzoneUploading: {
    cursor: "default",
    borderColor: "var(--primary)",
  },
  icon: {
    fontSize: 40,
    fontWeight: 300,
    color: "var(--text-muted)",
    marginBottom: 8,
    lineHeight: 1,
  },
  dropText: {
    fontSize: 15,
    color: "var(--text)",
    marginBottom: 4,
  },
  dropSubtext: {
    fontSize: 13,
    color: "var(--text-muted)",
  },

  /* Staging area */
  stagingContainer: {
    background: "var(--surface)",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    padding: 16,
  },
  stagingHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  stagingTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text)",
  },
  cancelBtn: {
    padding: "4px 12px",
    fontSize: 13,
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
  },
  stagingGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
    gap: 8,
    maxHeight: 320,
    overflowY: "auto",
    marginBottom: 12,
  },
  stagingItem: {
    position: "relative",
    textAlign: "center",
  },
  stagingThumb: {
    width: "100%",
    aspectRatio: "1",
    objectFit: "cover",
    borderRadius: 6,
    display: "block",
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: "50%",
    border: "none",
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    fontSize: 14,
    lineHeight: "22px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  stagingLabel: {
    fontSize: 10,
    color: "var(--text-muted)",
    display: "block",
    marginTop: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  alignBtn: {
    padding: "10px 28px",
    fontSize: 15,
    fontWeight: 600,
    borderRadius: "var(--radius-sm)",
    background: "var(--primary)",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    transition: "background 0.15s",
    width: "100%",
  },
  alignBtnDisabled: {
    background: "var(--border)",
    color: "var(--text-muted)",
    cursor: "not-allowed",
    opacity: 0.6,
  },
  stagingThumbDuplicate: {
    opacity: 0.5,
    filter: "grayscale(100%)",
  },
  duplicateBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    padding: "2px 6px",
    fontSize: 10,
    fontWeight: 600,
    background: "var(--warning)",
    color: "#fff",
    borderRadius: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  duplicateMessage: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    marginBottom: 12,
    background: "rgba(255, 193, 7, 0.1)",
    border: "1px solid var(--warning)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13,
    color: "var(--text)",
  },
  duplicateIcon: {
    fontSize: 16,
  },

  /* Upload progress (inside dropzone) */
  uploadProgress: {
    width: "100%",
    maxWidth: 400,
    margin: "0 auto",
  },

  /* Alignment progress */
  progressContainer: {
    background: "var(--surface)",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    padding: "32px 24px",
    textAlign: "center",
  },
  progressBarOuter: {
    height: 8,
    borderRadius: 4,
    background: "var(--border)",
    overflow: "hidden",
    marginBottom: 12,
    maxWidth: 400,
    margin: "0 auto 12px",
  },
  progressBarInner: {
    height: "100%",
    borderRadius: 4,
    background: "var(--primary)",
    transition: "width 0.3s ease",
  },
  progressText: {
    fontSize: 14,
    color: "var(--text-muted)",
  },

  /* Results */
  results: {
    display: "flex",
    gap: 16,
    marginTop: 12,
    fontSize: 14,
  },
  resultSuccess: {
    color: "var(--success)",
  },
  resultFail: {
    color: "var(--warning)",
  },
  error: {
    marginTop: 12,
    fontSize: 14,
    color: "var(--danger)",
  },
};

export default styles;
