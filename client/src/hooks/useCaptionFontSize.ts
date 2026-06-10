import { useEffect, useState, type RefObject } from 'react';

export function useCaptionFontSize(
  videoRef: RefObject<HTMLVideoElement | null>,
  sizePercent: number,
): number {
  const [pxSize, setPxSize] = useState(() => Math.max(11, (sizePercent / 100) * 640));

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const recompute = () => {
      const w = v.clientWidth || 640;
      setPxSize(Math.max(11, (sizePercent / 100) * w));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(v);
    window.addEventListener('resize', recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [videoRef, sizePercent]);

  return pxSize;
}
