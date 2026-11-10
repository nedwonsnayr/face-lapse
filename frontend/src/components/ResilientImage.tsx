import { ImgHTMLAttributes, useEffect, useRef, useState } from "react";

/** Lazy thumbnails retry transient errors twice, then offer an explicit retry. */
export default function ResilientImage({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    setAttempt(0); setFailed(false);
    return () => clearTimeout(timer.current);
  }, [src]);
  const retry = () => { setFailed(false); setAttempt(n => n + 1); };
  return <>
    <img {...props} style={{ ...props.style, visibility: failed ? "hidden" : props.style?.visibility }} alt={alt} src={attempt && src ? `${src}${src.includes("?") ? "&" : "?"}_retry=${attempt}` : src}
      onError={() => {
        if (failed) return;
        if (attempt < 2) timer.current = setTimeout(retry, 600 * (attempt + 1));
        else setFailed(true);
      }} />
    {failed && <button type="button" onClick={() => { setAttempt(0); setFailed(false); }}
      aria-label={`Retry photo ${alt ?? ""}`} style={{ position: "absolute", inset: 0, padding: 8, minHeight: 44, color: "var(--muted)", background: "var(--surface)" }}>Photo unavailable · Retry</button>}
  </>;
}
