import styled from 'styled-components';
import type { CaptionStyle } from '@/types';

const Overlay = styled.div<{ $bottomPct: number }>`
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
  padding: 0 6%;
  bottom: ${({ $bottomPct }) => $bottomPct}%;
`;

const Caption = styled.span<{
  $color: string;
  $bgAlpha: number;
  $weight: number;
  $outline: boolean;
  $fontSizePx: number;
  $visible: boolean;
}>`
  font-family: ${({ theme }) => theme.fonts.sans};
  text-align: center;
  color: ${({ $color }) => $color};
  background: rgba(0, 0, 0, ${({ $bgAlpha }) => $bgAlpha.toFixed(2)});
  font-weight: ${({ $weight }) => $weight};
  font-size: ${({ $fontSizePx }) => $fontSizePx}px;
  padding: .15em .5em;
  border-radius: 4px;
  white-space: pre-wrap;
  line-height: 1.25;
  visibility: ${({ $visible }) => ($visible ? 'visible' : 'hidden')};
  text-shadow: ${({ $outline }) =>
    $outline
      ? '0 0 2px #000, 0 0 2px #000, 1px 1px 2px #000, -1px -1px 2px #000'
      : '0 1px 2px rgba(0, 0, 0, .6)'};
`;

type Props = {
  style: CaptionStyle;
  fontSizePx: number;
  text: string;
};

export function CaptionOverlay({ style, fontSizePx, text }: Props) {
  return (
    <Overlay $bottomPct={style.pos}>
      <Caption
        $color={style.color}
        $bgAlpha={style.box / 100}
        $weight={style.weight}
        $outline={style.outline === 1}
        $fontSizePx={fontSizePx}
        $visible={Boolean(text)}
      >
        {text}
      </Caption>
    </Overlay>
  );
}
