import React from "react";
import forms from "./ui/forms.module.css";
import s from "./SpeedSlider.module.css";
import { MAX_FRAME_DURATION as MAX, MIN_FRAME_DURATION as MIN } from "../settings";

interface SpeedSliderProps {
  value: number;
  onChange: (value: number) => void;
  /** Prefix for the element id and test ids, so two sliders can share a page. */
  idPrefix?: string;
  label?: string;
}

export default function SpeedSlider({ value, onChange, idPrefix = "speed-slider", label = "Frame duration" }: SpeedSliderProps) {
  const fps = 1 / value;
  const fill = ((value - MIN) / (MAX - MIN)) * 100;

  return (
    <div data-testid={idPrefix} className={s.container}>
      <div className={s.labelRow}>
        <label htmlFor={`${idPrefix}-input`} className={s.label}>
          {label}
        </label>
        <span className={s.readout}>
          <span data-testid={`${idPrefix}-value`} className={s.value}>
            {value.toFixed(2)}s
          </span>
          <span className={s.fps}>{fps >= 10 ? Math.round(fps) : fps.toFixed(1)} fps</span>
        </span>
      </div>
      <input
        id={`${idPrefix}-input`}
        data-testid={`${idPrefix}-input`}
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
