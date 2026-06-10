import { useEffect, useState } from 'react';

export function useCaptionFontSize(
  video: HTMLVideoElement | null,
  sizePercent: number,
): number {
  const [pxSize, setPxSize] = useState(() => Math.max(11, (sizePercent / 100) * 640));

  useEffect(() => {
    if (!video) return;
    const recompute = () => {
      const w = video.clientWidth || 640;
      setPxSize(Math.max(11, (sizePercent / 100) * w));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(video);
    window.addEventListener('resize', recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [video, sizePercent]);

  return pxSize;
}
