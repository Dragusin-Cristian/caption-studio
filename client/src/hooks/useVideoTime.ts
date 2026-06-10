import { useEffect, useState, type RefObject } from 'react';

export function useVideoTime(videoRef: RefObject<HTMLVideoElement | null>): {
  currentTime: number;
  duration: number;
} {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    let raf = 0;
    const tickRaf = () => {
      setCurrentTime(v.currentTime);
      if (!v.paused && !v.ended) raf = requestAnimationFrame(tickRaf);
    };

    const onPlay = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tickRaf); };
    const onPauseLike = () => { cancelAnimationFrame(raf); setCurrentTime(v.currentTime); };
    const onMeta = () => setDuration(v.duration || 0);

    v.addEventListener('play', onPlay);
    v.addEventListener('playing', onPlay);
    v.addEventListener('pause', onPauseLike);
    v.addEventListener('seeked', onPauseLike);
    v.addEventListener('timeupdate', onPauseLike);
    v.addEventListener('loadedmetadata', onMeta);
    if (!Number.isNaN(v.duration) && v.duration) setDuration(v.duration);

    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('playing', onPlay);
      v.removeEventListener('pause', onPauseLike);
      v.removeEventListener('seeked', onPauseLike);
      v.removeEventListener('timeupdate', onPauseLike);
      v.removeEventListener('loadedmetadata', onMeta);
    };
  }, [videoRef]);

  return { currentTime, duration };
}
