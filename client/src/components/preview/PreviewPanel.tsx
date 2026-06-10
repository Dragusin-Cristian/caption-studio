import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Panel, PanelHeader, PanelBody } from '@/design-system/primitives/Panel';
import { CaptionOverlay } from './CaptionOverlay';
import { Transport } from './Transport';
import type { CaptionStyle, Cue } from '@/types';
import { useCaptionFontSize } from '@/hooks/useCaptionFontSize';

const FsButton = styled.button`
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  color: #fff;
  border: 0;
  padding: 0;
  cursor: pointer;
  opacity: 0;
  transition: opacity 180ms ease;

  &:focus { outline: none; opacity: 1; }
  &:hover { opacity: 1; }
`;

const Stage = styled.div`
  position: relative;
  background: #000;
  border-radius: ${({ theme }) => theme.radius.md};
  overflow: hidden;
  line-height: 0;

  video {
    width: 100%;
    display: block;
    max-height: 52vh;
    background: #000;
  }

  video::-webkit-media-controls-fullscreen-button {
    opacity: 0;
    pointer-events: none;
  }

  &:hover ${FsButton} {
    opacity: 0.9;
  }

  &:fullscreen {
    width: 100vw;
    height: 100vh;
    border-radius: 0;

    video {
      width: 100%;
      height: 100%;
      max-height: none;
      object-fit: contain;
    }
  }

  &:-webkit-full-screen {
    width: 100vw;
    height: 100vh;
    border-radius: 0;

    video {
      width: 100%;
      height: 100%;
      max-height: none;
      object-fit: contain;
    }
  }
`;

const EnterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);

const ExitIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3v3a2 2 0 0 1-2 2H3" />
    <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
    <path d="M3 16h3a2 2 0 0 1 2 2v3" />
    <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
  </svg>
);

type Props = {
  video: HTMLVideoElement | null;
  onVideoRef: (el: HTMLVideoElement | null) => void;
  src: string | null;
  style: CaptionStyle;
  activeCue: Cue | null;
  currentTime: number;
  duration: number;
};

export function PreviewPanel({ video, onVideoRef, src, style, activeCue, currentTime, duration }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const fontSizePx = useCaptionFontSize(video, style.size);
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const sync = () => {
      const fsEl =
        document.fullscreenElement ??
        (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ??
        null;
      setIsFs(fsEl === stageRef.current);
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const toggleFs = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fsEl =
      document.fullscreenElement ??
      (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ??
      null;
    if (fsEl) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      stage.requestFullscreen?.().catch(() => {});
    }
  }, []);

  return (
    <Panel>
      <PanelHeader>Preview</PanelHeader>
      <PanelBody>
        <Stage ref={stageRef}>
          <video
            ref={onVideoRef}
            controls
            playsInline
            disablePictureInPicture
            src={src ?? undefined}
          />
          <CaptionOverlay style={style} fontSizePx={fontSizePx} text={activeCue?.text ?? ''} />
          <FsButton
            type="button"
            onClick={toggleFs}
            aria-label={isFs ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFs ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFs ? <ExitIcon /> : <EnterIcon />}
          </FsButton>
        </Stage>
        <Transport current={currentTime} duration={duration} />
      </PanelBody>
    </Panel>
  );
}
