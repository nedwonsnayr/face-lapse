/**
 * Filter definition, version 1. The pipeline is normative in
 * .10x/specs/2026-11-10-timelapse-filters-design.md; the backend
 * (backend/app/services/filters.py) validates the same ranges.
 */
export type BlendMode = "soft-light" | "overlay" | "multiply" | "screen";
export const BLEND_MODES: BlendMode[] = ["soft-light", "overlay", "multiply", "screen"];

export interface FilterDefinition {
  version: 1;
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  warmth: number;
  hue: number;
  fade: number;
  tint: { color: string; blend: BlendMode; strength: number };
  vignette: { strength: number; size: number };
  grain: { amount: number; size: number };
}

export const IDENTITY: FilterDefinition = {
  version: 1, brightness: 1, contrast: 1, saturation: 1, grayscale: 0, warmth: 0, hue: 0, fade: 0,
  tint: { color: "#ffffff", blend: "soft-light", strength: 0 },
  vignette: { strength: 0, size: 0.5 },
  grain: { amount: 0, size: 0.5 },
};

/** Ranges for every numeric control; also drives the editor's sliders. */
export const RANGES = {
  brightness: [0.5, 1.5], contrast: [0.5, 1.5], saturation: [0, 2], grayscale: [0, 1], warmth: [0, 1],
  hue: [-180, 180], fade: [0, 1], "tint.strength": [0, 1], "vignette.strength": [0, 1], "vignette.size": [0, 1],
  "grain.amount": [0, 1], "grain.size": [0, 1],
} as const;

export function isIdentity(f: FilterDefinition): boolean {
  return f.brightness === 1 && f.contrast === 1 && f.saturation === 1 && f.grayscale === 0 && f.warmth === 0 &&
    f.hue === 0 && f.fade === 0 && f.tint.strength === 0 && f.vignette.strength === 0 && f.grain.amount === 0;
}

/** Fill omitted fields from IDENTITY (used for built-ins written sparsely). */
export function withDefaults(partial: DeepPartial<FilterDefinition>): FilterDefinition {
  return {
    ...IDENTITY, ...partial, version: 1,
    tint: { ...IDENTITY.tint, ...partial.tint },
    vignette: { ...IDENTITY.vignette, ...partial.vignette },
    grain: { ...IDENTITY.grain, ...partial.grain },
  } as FilterDefinition;
}
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };

const HEX = /^#[0-9a-f]{6}$/i;
const inRange = (value: unknown, [lo, hi]: readonly [number, number]) =>
  typeof value === "number" && Number.isFinite(value) && value >= lo && value <= hi;
const exactKeys = (value: unknown, keys: string[]) =>
  !!value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(k => k in (value as object));

/** Strict check for untrusted data (localStorage, API). Returns null when invalid. */
export function validateFilter(value: unknown): FilterDefinition | null {
  if (!exactKeys(value, Object.keys(IDENTITY))) return null;
  const f = value as FilterDefinition;
  if (f.version !== 1) return null;
  for (const key of ["brightness", "contrast", "saturation", "grayscale", "warmth", "hue", "fade"] as const)
    if (!inRange(f[key], RANGES[key])) return null;
  if (!exactKeys(f.tint, ["color", "blend", "strength"]) || typeof f.tint.color !== "string" || !HEX.test(f.tint.color) ||
    !BLEND_MODES.includes(f.tint.blend) || !inRange(f.tint.strength, RANGES["tint.strength"])) return null;
  if (!exactKeys(f.vignette, ["strength", "size"]) || !inRange(f.vignette.strength, RANGES["vignette.strength"]) ||
    !inRange(f.vignette.size, RANGES["vignette.size"])) return null;
  if (!exactKeys(f.grain, ["amount", "size"]) || !inRange(f.grain.amount, RANGES["grain.amount"]) ||
    !inRange(f.grain.size, RANGES["grain.size"])) return null;
  return {
    version: 1, brightness: f.brightness, contrast: f.contrast, saturation: f.saturation, grayscale: f.grayscale,
    warmth: f.warmth, hue: f.hue, fade: f.fade,
    tint: { color: f.tint.color.toLowerCase(), blend: f.tint.blend, strength: f.tint.strength },
    vignette: { strength: f.vignette.strength, size: f.vignette.size },
    grain: { amount: f.grain.amount, size: f.grain.size },
  };
}

export function sameFilter(a: FilterDefinition, b: FilterDefinition): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
