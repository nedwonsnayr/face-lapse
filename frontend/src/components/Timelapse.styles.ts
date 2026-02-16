import type React from "react";

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginBottom: 32,
  },
  heading: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 16,
    color: "var(--text)",
  },
  empty: {
    background: "var(--surface)",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    padding: "40px 20px",
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "var(--text-muted)",
  },

  /* Player */
  player: {
    position: "relative",
    background: "#000",
    borderRadius: "var(--radius)",
    overflow: "hidden",
    marginBottom: 12,
  },
  frame: {
    width: "100%",
    maxHeight: 600,
    display: "block",
    objectFit: "contain",
    margin: "0 auto",
  },

  /* Controls */
  controls: {
    background: "var(--surface)",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    padding: 20,
  },
  scrubRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  playBtn: {
    padding: "6px 12px",
    fontSize: 16,
    lineHeight: 1,
    borderRadius: "var(--radius-sm)",
    background: "transparent",
    color: "var(--text)",
    border: "1px solid var(--border)",
    cursor: "pointer",
    flexShrink: 0,
  },
  scrubber: {
    flex: 1,
    accentColor: "var(--primary)",
    height: 6,
    cursor: "pointer",
  },
  scrubLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontVariantNumeric: "tabular-nums",
    minWidth: 70,
    textAlign: "right" as const,
    flexShrink: 0,
  },
  info: {
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    color: "var(--text-muted)",
  },
  downloadBtn: {
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
  downloadBtnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  error: {
    marginTop: 12,
    fontSize: 14,
    color: "var(--danger)",
  },
  dateOverlay: {
    position: "absolute",
    bottom: 12,
    right: 12,
    padding: "6px 12px",
    fontSize: 14,
    fontWeight: 500,
    color: "#fff",
    background: "rgba(0, 0, 0, 0.6)",
    borderRadius: "var(--radius-sm)",
    backdropFilter: "blur(4px)",
    pointerEvents: "none",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    alignItems: "flex-end",
  },
  ageText: {
    fontSize: 14,
    fontWeight: 500,
    opacity: 0.9,
    textAlign: "right",
  },
  toggleRow: {
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  toggleRowDisabled: {
    opacity: 0.5,
  },
  toggleLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: "var(--text)",
    cursor: "pointer",
  },
  toggleLabelDisabled: {
    cursor: "not-allowed",
    color: "var(--text-muted)",
  },
  toggleInput: {
    cursor: "pointer",
    accentColor: "var(--primary)",
  },
  birthdayContainer: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  birthdayLabel: {
    fontSize: 13,
    color: "var(--text)",
    whiteSpace: "nowrap",
  },
  birthdayLabelDisabled: {
    color: "var(--text-muted)",
  },
  dateInput: {
    padding: "4px 8px",
    fontSize: 13,
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg)",
    color: "var(--text)",
    cursor: "pointer",
  },
  dateInputDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
    background: "var(--surface)",
  },
};

export default styles;
