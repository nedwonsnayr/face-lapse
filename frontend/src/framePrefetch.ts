/*
 * Network prefetch for timelapse playback (ADR-013).
 *
 * Frame URLs carry the content hash and are served `immutable`, so fetching
 * one into the HTTP cache makes the player's later <img> request a cache hit.
 * This keeps ~3 s of upcoming frames downloaded without holding them decoded;
 * only the few nearest frames are decoded (BufferedFrame's FrameCache).
 */

/** Seconds of playback to keep downloaded ahead of the playhead. */
export const PREFETCH_SECONDS = 3;
const MIN_PREFETCH = 8;
const MAX_PREFETCH = 60;

/** How many frames ahead to download at a given speed (seconds per frame). */
export function prefetchCount(frameDuration: number): number {
  const frames = Math.ceil(PREFETCH_SECONDS / Math.max(frameDuration, 0.01));
  return Math.min(MAX_PREFETCH, Math.max(MIN_PREFETCH, frames));
}

type Fetcher = (url: string, init: RequestInit & { priority?: string }) => Promise<Response>;

export class FramePrefetcher {
  private done = new Set<string>();
  private inflight = new Map<string, AbortController>();
  private queue: string[] = [];

  constructor(
    private readonly concurrency = 6,
    private readonly maxDone = 2000,
    private readonly fetcher: Fetcher = (url, init) => fetch(url, init),
  ) {}

  /** Replace the wanted set, nearest first. Requests no longer wanted are aborted. */
  want(urls: string[]) {
    const wanted = new Set(urls);
    for (const [url, controller] of this.inflight) {
      if (!wanted.has(url)) { controller.abort(); this.inflight.delete(url); }
    }
    this.queue = urls.filter(url => !this.done.has(url) && !this.inflight.has(url));
    this.pump();
  }

  /** Stop everything (unmount). */
  dispose() {
    for (const controller of this.inflight.values()) controller.abort();
    this.inflight.clear();
    this.queue = [];
  }

  /** For tests and diagnostics. */
  get stats() { return { done: this.done.size, inflight: [...this.inflight.keys()], queued: this.queue.length }; }

  private pump() {
    while (this.inflight.size < this.concurrency && this.queue.length) this.start(this.queue.shift()!);
  }

  private start(url: string) {
    const controller = new AbortController();
    this.inflight.set(url, controller);
    this.fetcher(url, { credentials: "same-origin", priority: "low", signal: controller.signal })
      .then(res => { if (!res.ok) throw new Error(String(res.status)); return res.arrayBuffer(); })
      .then(() => {
        if (controller.signal.aborted) return;
        this.done.add(url);
        // Oldest first (Set keeps insertion order).
        while (this.done.size > this.maxDone) this.done.delete(this.done.values().next().value!);
      })
      .catch(() => { /* The frame loads normally when it reaches the decode window. */ })
      .finally(() => {
        if (this.inflight.get(url) === controller) this.inflight.delete(url);
        this.pump();
      });
  }
}
