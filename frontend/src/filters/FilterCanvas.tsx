import { useEffect, useRef } from "react";
import { FilterDefinition } from "./definition";
import { FilterRenderer } from "./FilterRenderer";

/**
 * Draws a decoded photo through the filter pipeline. Uniform changes (slider
 * moves, frame index) redraw on the next animation frame; the texture is only
 * re-uploaded when the photo changes. Calls onUnavailable if WebGL2 fails or
 * the context is lost, so the caller can fall back to the plain <img>.
 */
export default function FilterCanvas({ src, image, filter, frameIndex, className, onUnavailable, testId }: {
  src: string; image?: HTMLImageElement | null; filter: FilterDefinition; frameIndex: number;
  className?: string; onUnavailable: () => void; testId?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<FilterRenderer | null>(null);
  const loaded = useRef<{ src: string; image: HTMLImageElement } | null>(null);
  const latest = useRef({ filter, frameIndex });
  latest.current = { filter, frameIndex };
  const frame = useRef(0);
  const unavailable = useRef(onUnavailable);
  unavailable.current = onUnavailable;

  const draw = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = renderer.current, photo = loaded.current;
      if (!r || !photo || r.gl.isContextLost()) return;
      r.setSource(photo.image, photo.image.naturalWidth, photo.image.naturalHeight);
      r.render(latest.current.filter, latest.current.frameIndex);
      // Hidden until the first real frame, so the default 300×150 canvas never flashes.
      r.canvas instanceof HTMLCanvasElement && (r.canvas.style.visibility = "visible");
    });
  };

  // Renderer lifecycle (StrictMode-safe: a remount builds a fresh one).
  useEffect(() => {
    const canvas = canvasRef.current!;
    try { renderer.current = new FilterRenderer(canvas); }
    catch { unavailable.current(); return; }
    const lost = (e: Event) => { e.preventDefault(); unavailable.current(); };
    canvas.addEventListener("webglcontextlost", lost);
    draw();
    return () => {
      canvas.removeEventListener("webglcontextlost", lost);
      cancelAnimationFrame(frame.current);
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, []);

  // Photo changes: use the decoded cached image when it is still intact,
  // otherwise decode our own copy (the browser cache makes this cheap).
  useEffect(() => {
    if (image && image.complete && image.naturalWidth && image.src === new URL(src, location.href).href) {
      loaded.current = { src, image };
      draw();
      return;
    }
    let active = true;
    const own = new Image();
    own.decoding = "async";
    own.onload = () => { own.decode().then(() => { if (active) { loaded.current = { src, image: own }; draw(); } }, () => {}); };
    own.src = src;
    return () => { active = false; };
  }, [src, image]);

  useEffect(draw, [filter, frameIndex]);

  return <canvas ref={canvasRef} className={className} data-testid={testId} aria-hidden="true" style={{ visibility: "hidden" }} />;
}
