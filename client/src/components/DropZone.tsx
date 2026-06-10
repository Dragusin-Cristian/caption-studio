import styled, { css } from 'styled-components';
import { useRef } from 'react';
import { useDropTarget } from '@/hooks/useDropTarget';

const hoverState = css`
  border-color: ${({ theme }) => theme.colors.accent};
  background: rgba(244, 201, 93, .05);
`;

const Zone = styled.div<{ $over: boolean }>`
  border: 1.5px dashed ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radius.panel};
  padding: 46px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color .15s, background .15s;
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 12px,
    rgba(244, 201, 93, .018) 12px,
    rgba(244, 201, 93, .018) 24px
  );
  &:hover { ${hoverState} }
  ${({ $over }) => $over && hoverState}
`;

const Big = styled.p`
  font-size: 17px;
  margin: 0 0 6px;
`;

const Small = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 13px;
  margin: 0;
`;

const HiddenInput = styled.input`
  display: none;
`;

type Props = { onFile: (file: File) => void };

export function DropZone({ onFile }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { isOver, bind } = useDropTarget(onFile);

  return (
    <Zone $over={isOver} onClick={() => fileRef.current?.click()} {...bind}>
      <Big>Drop a video here, or click to choose one</Big>
      <Small>
        Processed by the subtitle service running on your own machine — nothing leaves your network.
      </Small>
      <HiddenInput
        ref={fileRef}
        type="file"
        accept="video/*,audio/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </Zone>
  );
}
