import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/Button";

/** A small decoded-image cache. Retain at most 12 frames, including lookahead. */
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
    while (this.entries.size > 12) this.remove(this.entries.keys().next().value!);
    return promise;
  }
  remove(url: string) { this.entries.get(url)?.cancel(); this.entries.delete(url); }
  clear() { for (const url of this.entries.keys()) this.remove(url); }
}

export default function BufferedFrame({ src, ahead, alt, className, onReady }: {
  src: string; ahead: string[]; alt: string; className: string; onReady: (url: string) => void;
}) {
  const cache = useRef(new FrameCache());
  const [displayed, setDisplayed] = useState<{ src: string; alt: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const ready = useRef(onReady); ready.current = onReady;
  useEffect(() => () => cache.current.clear(), []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setFailed(false);
    const load = (attempt: number) => {
      cache.current.load(src).then(() => {
        if (active) { setDisplayed({ src, alt }); ready.current(src); }
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
  return <>
    {displayed && <img data-testid="timelapse-frame" src={displayed.src} alt={displayed.alt} className={className} />}
    {(displayed?.src !== src || failed) && <div role="status" style={{ position: "absolute", bottom: 8, left: 8, right: 8, color: "white", background: "rgba(0,0,0,.7)", textAlign: "center", padding: 8 }}>
      {failed ? <><span>Couldn’t load this frame. </span><Button onClick={() => { cache.current.remove(src); setRetry(n => n + 1); }}>Retry frame</Button></> : "Loading frame…"}
    </div>}
  </>;
}
