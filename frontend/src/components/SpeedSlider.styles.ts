import type React from "react";

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: "var(--text)",
    display: "block",
    marginBottom: 8,
  },
  value: {
    fontWeight: 600,
    color: "var(--primary)",
  },
  sliderRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  slider: {
    flex: 1,
    accentColor: "var(--primary)",
    height: 6,
  },
  tick: {
    fontSize: 12,
    color: "var(--text-muted)",
    minWidth: 36,
  },
};

export default styles;
