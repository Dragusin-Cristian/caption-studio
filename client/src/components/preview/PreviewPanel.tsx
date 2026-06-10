import styled from 'styled-components';
import { Panel, PanelHeader, PanelBody } from '@/design-system/primitives/Panel';
import { CaptionOverlay } from './CaptionOverlay';
import { Transport } from './Transport';
import type { CaptionStyle, Cue } from '@/types';
import { useCaptionFontSize } from '@/hooks/useCaptionFontSize';
import type { RefObject } from 'react';

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
`;

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  src: string | null;
  style: CaptionStyle;
  activeCue: Cue | null;
  currentTime: number;
  duration: number;
};

export function PreviewPanel({ videoRef, src, style, activeCue, currentTime, duration }: Props) {
  const fontSizePx = useCaptionFontSize(videoRef, style.size);
  return (
    <Panel>
      <PanelHeader>Preview</PanelHeader>
      <PanelBody>
        <Stage>
          <video ref={videoRef} controls playsInline src={src ?? undefined} />
          <CaptionOverlay style={style} fontSizePx={fontSizePx} text={activeCue?.text ?? ''} />
        </Stage>
        <Transport current={currentTime} duration={duration} />
      </PanelBody>
    </Panel>
  );
}
