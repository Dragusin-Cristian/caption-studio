import styled from 'styled-components';
import { useRef } from 'react';
import { Button } from '@/design-system/primitives/Button';

const Bar = styled.header`
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 8px 0 20px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  margin-bottom: 22px;
`;

const Brand = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-right: auto;
`;

const Mark = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-weight: 600;
  letter-spacing: .02em;
  font-size: 20px;
  color: ${({ theme }) => theme.colors.bg};
  background: ${({ theme }) => theme.colors.accent};
  padding: 4px 9px;
  border-radius: ${({ theme }) => theme.radius.sm};
`;

const BrandTitle = styled.div`
  font-weight: 600;
`;

const BrandSub = styled.div`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 13px;
  font-family: ${({ theme }) => theme.fonts.mono};
`;

const HiddenInput = styled.input`
  display: none;
`;

type Props = { onPickFile: (file: File) => void };

export function Header({ onPickFile }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Bar>
      <Brand>
        <Mark>CC</Mark>
        <div>
          <BrandTitle>Caption</BrandTitle>
          <BrandSub>subtitle a video, in your browser</BrandSub>
        </div>
      </Brand>
      <Button type="button" onClick={() => fileRef.current?.click()}>
        Load video…
      </Button>
      <HiddenInput
        ref={fileRef}
        type="file"
        accept="video/*,audio/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickFile(f);
          e.target.value = '';
        }}
      />
    </Bar>
  );
}
