import React from "react";
import styles from "./SpeedSlider.styles";

interface SpeedSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export default function SpeedSlider({ value, onChange }: SpeedSliderProps) {
  return (
    <div data-testid="speed-slider" style={styles.container}>
      <label style={styles.label}>
        Frame Duration:{" "}
        <span data-testid="speed-slider-value" style={styles.value}>{value.toFixed(2)}s</span>
      </label>
      <div style={styles.sliderRow}>
        <span style={styles.tick}>0.05s</span>
        <input
          data-testid="speed-slider-input"
          type="range"
          min={0.05}
          max={1.0}
          step={0.05}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={styles.slider}
        />
        <span style={styles.tick}>1.0s</span>
      </div>
    </div>
  );
}

