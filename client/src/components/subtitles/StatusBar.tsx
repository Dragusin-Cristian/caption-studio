import styled from 'styled-components';
import { StatusDot } from '@/design-system/primitives/StatusDot';
import { ProgressBar } from '@/design-system/primitives/ProgressBar';
import type { Status } from '@/types';

const Line = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 12.5px;
  color: ${({ theme }) => theme.colors.muted};
  min-height: 18px;
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

type Props = {
  status: Status;
  progress: number | null;
};

export function StatusBar({ status, progress }: Props) {
  return (
    <>
      <Line>
        <StatusDot $kind={status.kind} />
        <span>{status.message}</span>
      </Line>
      <ProgressBar value={progress} />
    </>
  );
}
