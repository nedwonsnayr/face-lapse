import React from "react";
import forms from "./ui/forms.module.css";
import s from "./SpeedSlider.module.css";

interface SpeedSliderProps {
  value: number;
  onChange: (value: number) => void;
}

const MIN = 0.05;
const MAX = 1.0;

export default function SpeedSlider({ value, onChange }: SpeedSliderProps) {
  const fps = 1 / value;
  const fill = ((value - MIN) / (MAX - MIN)) * 100;

  return (
    <div data-testid="speed-slider" className={s.container}>
      <div className={s.labelRow}>
        <label htmlFor="speed-slider-input" className={s.label}>
          Frame duration
        </label>
        <span className={s.readout}>
          <span data-testid="speed-slider-value" className={s.value}>
            {value.toFixed(2)}s
          </span>
          <span className={s.fps}>{fps >= 10 ? Math.round(fps) : fps.toFixed(1)} fps</span>
        </span>
      </div>
      <input
        id="speed-slider-input"
        data-testid="speed-slider-input"
        type="range"
        min={MIN}
        max={MAX}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={forms.range}
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
      />
      <div className={s.ticks} aria-hidden="true">
        <span>Fast</span>
        <span>Slow</span>
      </div>
    </div>
  );
}
