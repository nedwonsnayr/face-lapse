import { ImageRecord } from "./api";
export interface FrameSelection { date_from: string; date_to: string; sampling: "all" | "day" | "week" | "month" }
export const ALL_FRAMES: FrameSelection = { date_from: "", date_to: "", sampling: "all" };
export function selectFrames(images: ImageRecord[], options: FrameSelection): ImageRecord[] {
  const filtered = images.filter(p => {
    const day = p.photo_taken_at?.slice(0, 10) ?? "";
    return (!options.date_from || (!!day && day >= options.date_from)) && (!options.date_to || (!!day && day <= options.date_to));
  });
  if (options.sampling === "all") return filtered;
  const chosen = new Set<number>();
  const seen = new Set<string>();
  for (const photo of [...filtered].sort((a, b) => (a.photo_taken_at ?? "").localeCompare(b.photo_taken_at ?? "") || a.id - b.id)) {
    if (!photo.photo_taken_at) { chosen.add(photo.id); continue; }
    let key = photo.photo_taken_at.slice(0, 10);
    if (options.sampling === "month") key = key.slice(0, 7);
    else if (options.sampling === "week") {
      const date = new Date(`${key}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
      key = date.toISOString().slice(0, 10);
    }
    if (!seen.has(key)) { seen.add(key); chosen.add(photo.id); }
  }
  return filtered.filter(p => chosen.has(p.id));
}
