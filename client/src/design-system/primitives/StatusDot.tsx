import styled, { css } from 'styled-components';
import type { StatusKind } from '@/types';

const kindStyles = {
  '': css`background: ${({ theme }) => theme.colors.muted};`,
  work: css`
    background: ${({ theme }) => theme.colors.accent};
    animation: captionPulse 1s infinite;
  `,
  err: css`background: ${({ theme }) => theme.colors.danger};`,
  ok: css`background: ${({ theme }) => theme.colors.good};`,
} satisfies Record<StatusKind, ReturnType<typeof css>>;

export const StatusDot = styled.span<{ $kind: StatusKind }>`
  width: 8px;
  height: 8px;
  border-radius: ${({ theme }) => theme.radius.pill};
  flex: none;
  ${({ $kind }) => kindStyles[$kind]};
`;
