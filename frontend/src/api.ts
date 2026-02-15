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
}

/** Record returned by the upload endpoint (before alignment). */
export interface UploadedImage {
  id: number;
  original_filename: string;
  source_filename: string | null;
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

export interface UploadProgress {
  uploaded: number;
  total: number;
}

/**
 * Upload images in batches (save originals only, no alignment).
 * Files are sent in chunks of UPLOAD_BATCH_SIZE to avoid request-size limits.
 * `onProgress` fires after each batch completes.
 */
export async function uploadImages(
  files: File[],
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadedImage[]> {
  const allResults: UploadedImage[] = [];

  for (let i = 0; i < files.length; i += UPLOAD_BATCH_SIZE) {
    const batch = files.slice(i, i + UPLOAD_BATCH_SIZE);
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

    onProgress?.({ uploaded: Math.min(i + batch.length, files.length), total: files.length });
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

export async function generateVideo(
  frameDuration: number
): Promise<GenerateResponse> {
  const res = await fetch(
    `${API_BASE}/video/generate?frame_duration=${frameDuration}`,
    { method: "POST" }
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Video generation failed");
  }
  return res.json();
}

export function getAlignedImageUrl(id: number): string {
  return `${API_BASE}/images/${id}/aligned`;
}

export function getOriginalImageUrl(id: number): string {
  return `${API_BASE}/images/${id}/original`;
}

