import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/Button";
import { FilterDefinition, isIdentity } from "../filters/definition";
import FilterCanvas from "../filters/FilterCanvas";
import { webgl2Supported } from "../filters/FilterRenderer";

/** A small decoded-image cache. Retain at most 16 frames: the 8-frame decode window plus a few behind. */
export class FrameCache {
  entries = new Map<string, { image: HTMLImageElement; promise: Promise<void>; cancel: () => void }>();
  load(url: string): Promise<void> {
    const cached = this.entries.get(url);
    if (cached) {
      this.entries.delete(url); this.entries.set(url, cached);
      return cached.promise;
    }
    const image = new Image();
    image.decoding = "async";
    let cancel = () => {};
    const promise = new Promise<void>((resolve, reject) => {
      let finished = false;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true; clearTimeout(timer); image.onload = null; image.onerror = null;
        error ? reject(error) : resolve();
      };
      const timer = setTimeout(() => { finish(new Error("Photo took too long to load")); image.src = ""; }, 15000);
      cancel = () => { finish(new Error("Cancelled")); image.src = ""; };
      image.onerror = () => finish(new Error("Could not load this photo"));
      image.onload = () => { image.decode().then(() => finish(), () => finish(new Error("Could not decode this photo"))); };
      image.src = url;
    });
    this.entries.set(url, { image, promise, cancel });
    while (this.entries.size > 16) this.remove(this.entries.keys().next().value!);
    return promise;
  }
  remove(url: string) { this.entries.get(url)?.cancel(); this.entries.delete(url); }
  clear() { for (const url of this.entries.keys()) this.remove(url); }
}

/*
 * The player waits for each frame before advancing, so even a frame that's
 * already cached is "not displayed yet" for a moment on every tick. Only call
 * it loading once it's been waiting this long (or nothing is on screen yet).
 */
const SLOW_FRAME_MS = 500;

export default function BufferedFrame({ src, ahead, alt, className, onReady, filter, frameIndex = 0 }: {
  src: string; ahead: string[]; alt: string; className: string; onReady: (url: string) => void;
  /** Applied on top of the decoded frame; identity or null shows the plain image. */
  filter?: FilterDefinition | null; frameIndex?: number;
}) {
  const cache = useRef(new FrameCache());
  const [displayed, setDisplayed] = useState<{ src: string; alt: string; image: HTMLImageElement | null; index: number } | null>(null);
  const [glUnavailable, setGlUnavailable] = useState(() => !webgl2Supported());
  const requestedIndex = useRef(frameIndex);
  requestedIndex.current = frameIndex;
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [slow, setSlow] = useState(false);
  const ready = useRef(onReady); ready.current = onReady;
  const waiting = displayed?.src !== src;
  useEffect(() => {
    setSlow(false);
    if (!waiting) return;
    const t = setTimeout(() => setSlow(true), SLOW_FRAME_MS);
    return () => clearTimeout(t);
  }, [src, waiting]);
  useEffect(() => () => cache.current.clear(), []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setFailed(false);
    const index = requestedIndex.current;
    const load = (attempt: number) => {
      cache.current.load(src).then(() => {
        if (active) { setDisplayed({ src, alt, image: cache.current.entries.get(src)?.image ?? null, index }); ready.current(src); }
      }).catch(() => {
        if (!active) return;
        cache.current.remove(src);
        if (attempt < 2) timer = setTimeout(() => load(attempt + 1), 700 * (attempt + 1));
        else setFailed(true);
      });
    };
    load(0);
    return () => { active = false; clearTimeout(timer); };
  }, [src, alt, retry]);
  const aheadKey = ahead.join("\n");
  useEffect(() => {
    for (const url of aheadKey.split("\n").filter(Boolean)) {
      const pending = cache.current.load(url);
      void pending.catch(() => { if (cache.current.entries.get(url)?.promise === pending) cache.current.remove(url); });
    }
  }, [aheadKey]);
  const filtered = !!filter && !isIdentity(filter);
  return <>
    {displayed && <img data-testid="timelapse-frame" src={displayed.src} alt={displayed.alt} className={className} />}
    {displayed && filtered && !glUnavailable && <FilterCanvas testId="timelapse-filtered-frame" src={displayed.src} image={displayed.image}
      filter={filter} frameIndex={displayed.index} className={className} onUnavailable={() => setGlUnavailable(true)} />}
    {filtered && glUnavailable && <p role="note" data-testid="filter-preview-unavailable" style={{ position: "absolute", top: 8, left: 8, right: 8, margin: 0, color: "white", background: "rgba(0,0,0,.7)", textAlign: "center", padding: 6, fontSize: 12 }}>
      Filter preview isn’t available in this browser; the download will still use it.
    </p>}
    {(failed || (waiting && (slow || !displayed))) && <div role="status" style={{ position: "absolute", bottom: 8, left: 8, right: 8, color: "white", background: "rgba(0,0,0,.7)", textAlign: "center", padding: 8 }}>
      {failed ? <><span>Couldn’t load this frame. </span><Button onClick={() => { cache.current.remove(src); setRetry(n => n + 1); }}>Retry frame</Button></> : "Loading frame…"}
    </div>}
  </>;
}
