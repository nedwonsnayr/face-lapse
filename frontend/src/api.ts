const API_BASE = "/api";

export interface ImageRecord {
  id: number;
  original_filename: string;
  source_filename: string | null;
  face_detected: boolean;
  included_in_video: boolean;
  photo_taken_at: string | null;
  created_at: string | null;
  has_aligned: boolean;
  sort_order: number | null;
  /** Uploaded but not aligned yet (staged on some device). */
  pending: boolean;
  /** Changes whenever the photo's content changes; used as the image URL cache key. */
  content_hash: string;
}

/** Record returned by the upload endpoint (before alignment). */
export interface UploadedImage {
  id: number;
  original_filename: string;
  source_filename: string | null;
  photo_taken_at: string | null;
  content_hash?: string;
  skipped?: boolean; // true if this is a duplicate
  existing_id?: number; // ID of the existing duplicate image
}

export interface AlignResult {
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
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadedImage[]> {
  const allResults: UploadedImage[] = [];
  let uploaded = 0;

  for (const batch of batchFiles(files)) {
    const formData = new FormData();
    batch.forEach((file) => formData.append("files", file));

    const res = await fetch(`${API_BASE}/images/upload`, {
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
  onProgress?: (progress: AlignProgress) => void
): Promise<AlignResponse> {
  const res = await fetch(`${API_BASE}/images/align`, {
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

let _imagesEtag: string | null = null;
let _imagesCached: ImageRecord[] = [];

export async function listImages(): Promise<ImageRecord[]> {
  const headers: Record<string, string> = {};
  if (_imagesEtag) headers["If-None-Match"] = _imagesEtag;

  const res = await fetch(`${API_BASE}/images`, { headers });

  if (res.status === 304) return _imagesCached;
  if (!res.ok) throw new Error("Failed to fetch images");

  _imagesEtag = res.headers.get("etag");
  _imagesCached = await res.json();
  return _imagesCached;
}

export async function deleteImage(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/images/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete image");
}

export async function toggleImage(
  id: number
): Promise<{ id: number; included_in_video: boolean }> {
  const res = await fetch(`${API_BASE}/images/${id}/toggle`, {
    method: "PATCH",
  });
  if (!res.ok) throw new Error("Failed to toggle image");
  return res.json();
}

export async function reorderImages(
  items: { id: number; sort_order: number }[]
): Promise<void> {
  const res = await fetch(`${API_BASE}/images/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items),
  });
  if (!res.ok) throw new Error("Failed to reorder images");
}

export async function realignImage(
  id: number
): Promise<{ id: number; face_detected: boolean; error: string | null }> {
  const res = await fetch(`${API_BASE}/images/${id}/realign`, {
    method: "POST",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Re-alignment failed");
  }
  return res.json();
}

export async function deleteNoFaceImages(): Promise<{ deleted: number }> {
  const res = await fetch(`${API_BASE}/images/no-face`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete no-face images");
  return res.json();
}

interface VideoJob extends Omit<GenerateResponse, "success" | "video_filename"> {
  job_id: string;
  status: "running" | "done" | "error";
  video_filename: string | null;
  error: string | null;
}

const VIDEO_POLL_MS = 2000;
const VIDEO_TIMEOUT_MS = 15 * 60 * 1000;

async function readError(res: Response, fallback: string): Promise<Error> {
  const data = await res.json().catch(() => ({}));
  const errorMsg: string = data.detail || fallback;
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
  birthday: string | null = null
): Promise<GenerateResponse> {
  const params = new URLSearchParams({
    frame_duration: frameDuration.toString(),
  });
  if (showDates) {
    params.append("show_dates", "true");
  }
  if (birthday) {
    params.append("birthday", birthday);
  }
  const res = await fetch(
    `${API_BASE}/video/generate?${params.toString()}`,
    { method: "POST" }
  );
  if (!res.ok) throw await readError(res, "Video generation failed");
  let job: VideoJob = await res.json();

  const deadline = Date.now() + VIDEO_TIMEOUT_MS;
  while (job.status === "running") {
    if (Date.now() > deadline) throw new Error("Video generation timed out");
    await new Promise((r) => setTimeout(r, VIDEO_POLL_MS));
    const poll = await fetch(`${API_BASE}/video/jobs/${job.job_id}`);
    if (!poll.ok) throw await readError(poll, "Lost track of video generation");
    job = await poll.json();
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

// Image responses are cached for a year, so the URL must change with the
// content: IDs can be reused after a delete. `version` is the content hash.
export function getAlignedImageUrl(id: number, version?: string): string {
  return `${API_BASE}/images/${id}/aligned${version ? `?v=${version}` : ""}`;
}

export function getOriginalImageUrl(id: number, version?: string): string {
  return `${API_BASE}/images/${id}/original${version ? `?v=${version}` : ""}`;
}

