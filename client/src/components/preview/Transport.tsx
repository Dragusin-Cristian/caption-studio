import styled from 'styled-components';
import { fmtClock } from '@/lib/time';

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;
`;

const TC = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};

  b {
    color: ${({ theme }) => theme.colors.text};
    font-weight: 500;
  }
`;

type Props = { current: number; duration: number };

export function Transport({ current, duration }: Props) {
  return (
    <Bar>
      <TC>
        <b>{fmtClock(current)}</b> / <span>{fmtClock(duration)}</span>
      </TC>
    </Bar>
  );
}
