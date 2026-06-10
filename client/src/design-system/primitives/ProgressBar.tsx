import styled from 'styled-components';

const Track = styled.div`
  height: 4px;
  background: ${({ theme }) => theme.colors.surface2};
  border-radius: 3px;
  overflow: hidden;
  margin-top: 8px;
`;

const Fill = styled.i<{ $pct: number }>`
  display: block;
  height: 100%;
  width: ${({ $pct }) => Math.max(0, Math.min(100, $pct))}%;
  background: ${({ theme }) => theme.colors.accent};
  transition: width .2s;
`;

type Props = { value: number | null };

export function ProgressBar({ value }: Props) {
  if (value == null) return null;
  return (
    <Track>
      <Fill $pct={value * 100} />
    </Track>
  );
}
