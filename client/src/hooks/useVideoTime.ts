import { useEffect, useState } from 'react';

export function useVideoTime(video: HTMLVideoElement | null): {
  currentTime: number;
  duration: number;
} {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!video) return;

    let raf = 0;
    const tickRaf = () => {
      setCurrentTime(video.currentTime);
      if (!video.paused && !video.ended) raf = requestAnimationFrame(tickRaf);
    };

    const onPlay = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tickRaf); };
    const onPauseLike = () => { cancelAnimationFrame(raf); setCurrentTime(video.currentTime); };
    const onMeta = () => setDuration(video.duration || 0);

    video.addEventListener('play', onPlay);
    video.addEventListener('playing', onPlay);
    video.addEventListener('pause', onPauseLike);
    video.addEventListener('seeked', onPauseLike);
    video.addEventListener('timeupdate', onPauseLike);
    video.addEventListener('loadedmetadata', onMeta);
    if (!Number.isNaN(video.duration) && video.duration) setDuration(video.duration);

    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('playing', onPlay);
      video.removeEventListener('pause', onPauseLike);
      video.removeEventListener('seeked', onPauseLike);
      video.removeEventListener('timeupdate', onPauseLike);
      video.removeEventListener('loadedmetadata', onMeta);
    };
  }, [video]);

  return { currentTime, duration };
}
