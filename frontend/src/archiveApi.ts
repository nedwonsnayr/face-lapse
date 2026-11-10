export interface TrashPhoto { id: number; original_filename: string; source_filename: string | null; photo_taken_at: string | null; deleted_at: string; content_hash: string }
export interface ArchiveHealth {
  photos: number; trashed: number; pending: number; needs_face_selection: number;
  missing_originals: number; missing_aligned: number; checked_at: string;
  backup: { last_success: string | null; last_attempt: string | null; status: string };
}
export async function archiveRequest<T>(person: number, path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/archive/${path}?profile_id=${person}`, {
    method, headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data.detail === "string" ? data.detail : "Could not complete that action. Please try again.");
  }
  return response.json();
}
