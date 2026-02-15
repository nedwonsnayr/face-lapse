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
};

export default styles;
