import type { FrameSelection } from "./selection";
const API_BASE = "/api";
function scoped(path: string, profileId = 1): string {
  return `${path}${path.includes("?") ? "&" : "?"}profile_id=${profileId}`;
}

export interface Profile { id: number; name: string; birthday: string | null }
export async function listProfiles(): Promise<Profile[]> {
  const res = await fetch(`${API_BASE}/profiles`);
  if (!res.ok) throw await readError(res, "Could not load people");
  return res.json();
}
export async function saveProfile(values: { name: string; birthday: string | null }, id?: number): Promise<Profile> {
  const res = await fetch(`${API_BASE}/profiles${id ? `/${id}` : ""}`, {
    method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
  });
  if (!res.ok) throw await readError(res, "Could not save this person");
  return res.json();
}

export interface ImageRecord {
  id: number;
  profile_id: number;
  original_filename: string;
  source_filename: string | null;
  face_detected: boolean;
  included_in_video: boolean;
  photo_taken_at: string | null;
  date_source?: "exif" | "filename" | "upload" | "manual" | "legacy";
  created_at: string | null;
  has_aligned: boolean;
  sort_order: number | null;
  /** Uploaded but not aligned yet (staged on some device). */
  pending: boolean;
  needs_face_selection: boolean;
  selected_face_index: number | null;
  /** Changes whenever the photo's content changes; used as the image URL cache key. */
  content_hash: string;
}

/** Record returned by the upload endpoint (before alignment). */
export interface UploadedImage {
  id: number;
  original_filename: string;
  source_filename: string | null;
  photo_taken_at: string | null;
  date_source?: ImageRecord["date_source"];
  content_hash?: string;
  skipped?: boolean; // true if this is a duplicate
  existing_id?: number; // ID of the existing duplicate image
}

export interface AlignResult {
  needs_face_selection?: boolean;
  id: number;
  original_filename: string;
  face_detected: boolean;
  error: string | null;
  photo_taken_at: string | null;
}

export interface AlignResponse {
  aligned: number;
  results: AlignResult[];
}

export interface GenerateResponse {
  success: boolean;
  frame_count: number;
  frame_duration: number;
  total_duration: number;
  video_filename: string;
}

export interface AlignProgress {
  current: number;
  total: number;
  result: AlignResult;
}

const UPLOAD_BATCH_SIZE = 20;
// Cloudflare rejects request bodies over 100 MB; stay well under it.
const UPLOAD_BATCH_MAX_BYTES = 80 * 1024 * 1024;

export interface UploadProgress {
  uploaded: number;
  total: number;
}

/**
 * Split files into batches of at most UPLOAD_BATCH_SIZE files and
 * UPLOAD_BATCH_MAX_BYTES bytes. A single file larger than the byte cap
 * goes in a batch on its own.
 */
export function batchFiles(
  files: File[],
  maxCount = UPLOAD_BATCH_SIZE,
  maxBytes = UPLOAD_BATCH_MAX_BYTES
): File[][] {
  const batches: File[][] = [];
  let current: File[] = [];
  let currentBytes = 0;
  for (const file of files) {
    const full = current.length >= maxCount;
    const tooBig = current.length > 0 && currentBytes + file.size > maxBytes;
    if (full || tooBig) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(file);
    currentBytes += file.size;
  }
  if (current.length) batches.push(current);
  return batches;
}

/**
 * Upload images in batches (save originals only, no alignment).
 * Files are sent in chunks (see batchFiles) to stay under request-size limits.
 * `onProgress` fires after each batch completes.
 */
export async function uploadImages(
  files: File[],
  onProgress?: (progress: UploadProgress) => void,
  profileId = 1
): Promise<UploadedImage[]> {
  const allResults: UploadedImage[] = [];
  let uploaded = 0;

  for (const batch of batchFiles(files)) {
    const formData = new FormData();
    formData.append("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    batch.forEach((file) => formData.append("files", file));

    const res = await fetch(scoped(`${API_BASE}/images/upload`, profileId), {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || `Upload failed: ${res.statusText}`);
    }

    const results: UploadedImage[] = await res.json();
    allResults.push(...results);

    uploaded += batch.length;
    onProgress?.({ uploaded, total: files.length });
  }

  return allResults;
}

/**
 * Align images by ID. Streams NDJSON progress, one line per image.
 * `onProgress` fires for each image as it's aligned server-side.
 */
export async function alignImages(
  imageIds: number[],
  onProgress?: (progress: AlignProgress) => void,
  profileId = 1
): Promise<AlignResponse> {
  const res = await fetch(scoped(`${API_BASE}/images/align`, profileId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_ids: imageIds }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Alignment failed");
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse: AlignResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);

      if (msg.type === "progress" && onProgress) {
        onProgress({
          current: msg.current,
          total: msg.total,
          result: msg.result,
        });
      } else if (msg.type === "done") {
        finalResponse = {
          aligned: msg.aligned,
          results: msg.results,
        };
      } else if (msg.type === "error") {
        throw new Error(msg.detail || "Alignment failed");
      }
    }
  }

  if (!finalResponse) {
    throw new Error("Alignment stream ended without completion");
  }

  return finalResponse;
}

const imageCaches = new Map<number, { etag: string | null; images: ImageRecord[] }>();

export async function listImages(profileId = 1): Promise<ImageRecord[]> {
  const cached = imageCaches.get(profileId);
  const headers: Record<string, string> = {};
  if (cached?.etag) headers["If-None-Match"] = cached.etag;

  const res = await fetch(scoped(`${API_BASE}/images`, profileId), { headers });

  if (res.status === 304 && cached) return cached.images;
  if (!res.ok) throw new Error("Failed to fetch images");

  const images = await res.json();
  imageCaches.set(profileId, { etag: res.headers.get("etag"), images });
  return images;
}

export async function deleteImage(id: number, profileId = 1): Promise<void> {
  const res = await fetch(scoped(`${API_BASE}/images/${id}`, profileId), { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete image");
}

export async function toggleImage(
  id: number, profileId = 1
): Promise<{ id: number; included_in_video: boolean }> {
  const res = await fetch(scoped(`${API_BASE}/images/${id}/toggle`, profileId), {
    method: "PATCH",
  });
  if (!res.ok) throw new Error("Failed to toggle image");
  return res.json();
}

export async function reorderImages(
  items: { id: number; sort_order: number }[], profileId = 1
): Promise<void> {
  const res = await fetch(scoped(`${API_BASE}/images/reorder`, profileId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items),
  });
  if (!res.ok) throw new Error("Failed to reorder images");
}

export async function realignImage(
  id: number, profileId = 1
): Promise<{ id: number; face_detected: boolean; error: string | null; needs_face_selection: boolean }> {
  const res = await fetch(scoped(`${API_BASE}/images/${id}/realign`, profileId), {
    method: "POST",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Re-alignment failed");
  }
  return res.json();
}

export async function deleteNoFaceImages(profileId = 1): Promise<{ deleted: number; image_ids: number[] }> {
  const res = await fetch(scoped(`${API_BASE}/images/no-face`, profileId), { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete no-face images");
  return res.json();
}

export interface VideoJob extends Omit<GenerateResponse, "success" | "video_filename"> {
  phase?: "rendering" | "encoding" | "done" | "error";
  completed_frames?: number;
  job_id: string;
  status: "running" | "done" | "error";
  video_filename: string | null;
  error: string | null;
}

const VIDEO_POLL_MS = 2000;
const VIDEO_TIMEOUT_MS = 15 * 60 * 1000;

async function readError(res: Response, fallback: string): Promise<Error> {
  const data = await res.json().catch(() => ({}));
  const errorMsg: string = typeof data.detail === "string" ? data.detail
    : Array.isArray(data.detail) ? data.detail.map((d: { msg: string }) => d.msg).join(". ") : fallback;
  // Provide more helpful error message if FFmpeg is not found
  if (errorMsg.includes("FFmpeg not found") || errorMsg.includes("ffmpeg")) {
    return new Error("Video generation failed. Ensure FFmpeg is installed (brew install ffmpeg).");
  }
  return new Error(errorMsg);
}

/**
 * Start video generation and wait for it to finish.
 * The server runs it as a background job (it can take minutes, longer than
 * Cloudflare's proxy timeout), so we poll until it's done.
 */
export async function generateVideo(
  frameDuration: number,
  showDates: boolean = false,
  birthday: string | null = null,
  showAge: boolean = false,
  onProgress?: (job: VideoJob) => void,
  profileId = 1,
  selection?: FrameSelection
): Promise<GenerateResponse> {
  const params = new URLSearchParams({
    frame_duration: frameDuration.toString(),
    show_dates: String(showDates),
    show_age: String(showAge),
  });
  if (selection) {
    if (selection.date_from) params.set("date_from", selection.date_from);
    if (selection.date_to) params.set("date_to", selection.date_to);
    params.set("sampling", selection.sampling);
  }
  if (birthday) {
    params.append("birthday", birthday);
  }
  const res = await fetch(
    scoped(`${API_BASE}/video/generate?${params.toString()}`, profileId),
    { method: "POST" }
  );
  if (!res.ok) throw await readError(res, "Video generation failed");
  let job: VideoJob = await res.json();
  onProgress?.(job);

  const deadline = Date.now() + VIDEO_TIMEOUT_MS;
  while (job.status === "running") {
    if (Date.now() > deadline) throw new Error("Video generation timed out");
    await new Promise((r) => setTimeout(r, VIDEO_POLL_MS));
    const poll = await fetch(scoped(`${API_BASE}/video/jobs/${job.job_id}`, profileId));
    if (!poll.ok) throw await readError(poll, "Lost track of video generation");
    job = await poll.json();
    onProgress?.(job);
  }
  if (job.status === "error" || !job.video_filename) {
    throw new Error(job.error || "Video generation failed");
  }
  return {
    success: true,
    frame_count: job.frame_count,
    frame_duration: job.frame_duration,
    total_duration: job.total_duration,
    video_filename: job.video_filename,
  };
}

/**
 * Image sizes the server can return:
 * - "thumb": ≤300×400 (~12 KB), for library tiles and the staging tray
 * - "frame": ≤600×800 (~45 KB), for the timelapse player
 * - "full": the stored file (aligned ~450 KB; originals can be several MB)
 */
export type ImageSize = "thumb" | "frame" | "full";

// Image responses are cached for a year, so the URL must change with the
// content: IDs can be reused after a delete. `version` is the content hash.
function imageUrl(id: number, kind: "aligned" | "original", version?: string, size: ImageSize = "full", profileId = 1): string {
  const params = new URLSearchParams();
  if (version) params.set("v", version);
  if (size !== "full") params.set("size", size);
  const qs = params.toString();
  return scoped(`${API_BASE}/images/${id}/${kind}${qs ? `?${qs}` : ""}`, profileId);
}

export function getAlignedImageUrl(id: number, version?: string, size: ImageSize = "full", profileId = 1): string {
  return imageUrl(id, "aligned", version, size, profileId);
}

export function getOriginalImageUrl(id: number, version?: string, size: ImageSize = "full", profileId = 1): string {
  return imageUrl(id, "original", version, size, profileId);
}

export interface FaceCandidate {
  bounds: { x: number; y: number; width: number; height: number };
  left_eye: [number, number];
  right_eye: [number, number];
}

export interface FaceChoices {
  faces: FaceCandidate[];
  selected_face_index: number | null;
  content_hash: string;
}

export async function discoverFaces(id: number, profileId = 1): Promise<FaceChoices> {
  const res = await fetch(scoped(`${API_BASE}/images/${id}/faces`, profileId), { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not find faces. Please try again.");
  }
  return res.json();
}

export async function selectFace(id: number, faceIndex: number, profileId = 1): Promise<void> {
  const res = await fetch(scoped(`${API_BASE}/images/${id}/select-face`, profileId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ face_index: faceIndex }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Could not align that face. Please try again.");
  }
}

/** Change only date metadata; image files and cache keys stay intact. */
export async function updatePhotoDate(id: number, date: string | null, profileId = 1): Promise<void> {
  const res = await fetch(scoped(`${API_BASE}/images/${id}/date`, profileId), {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: date === null ? "upload" : "manual", date,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }),
  });
  if (!res.ok) throw await readError(res, "Could not update the photo date");
}

/** Bound to one person for the lifetime of a workspace and any async work it starts. */
export function createProfileApi(profileId: number) {
  return {
    profileId,
    listImages: () => listImages(profileId),
    updatePhotoDate: (id: number, date: string | null) => updatePhotoDate(id, date, profileId),
    uploadImages: (files: File[], progress?: (p: UploadProgress) => void) => uploadImages(files, progress, profileId),
    alignImages: (ids: number[], progress?: (p: AlignProgress) => void) => alignImages(ids, progress, profileId),
    deleteImage: (id: number) => deleteImage(id, profileId),
    toggleImage: (id: number) => toggleImage(id, profileId),
    reorderImages: (items: { id: number; sort_order: number }[]) => reorderImages(items, profileId),
    realignImage: (id: number) => realignImage(id, profileId),
    deleteNoFaceImages: () => deleteNoFaceImages(profileId),
    discoverFaces: (id: number) => discoverFaces(id, profileId),
    selectFace: (id: number, faceIndex: number) => selectFace(id, faceIndex, profileId),
    getAlignedImageUrl: (id: number, version?: string, size: ImageSize = "full") => getAlignedImageUrl(id, version, size, profileId),
    getOriginalImageUrl: (id: number, version?: string, size: ImageSize = "full") => getOriginalImageUrl(id, version, size, profileId),
    generateVideo: (duration: number, dates = false, birthday: string | null = null, age = false, progress?: (job: VideoJob) => void, selection?: FrameSelection) =>
      generateVideo(duration, dates, birthday, age, progress, profileId, selection),
    getVideoUrl: (filename: string) => scoped(`${API_BASE}/video/${encodeURIComponent(filename)}`, profileId),
  };
}
