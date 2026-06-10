import styled from 'styled-components';
import type { ReactNode } from 'react';

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1.15fr .85fr;
  gap: 22px;
  align-items: start;

  @media (max-width: ${({ theme }) => theme.layout.breakpointCollapse}) {
    grid-template-columns: 1fr;
  }
`;

const LeftCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 22px;
`;

type Props = {
  left: ReactNode;
  right: ReactNode;
};

export function Editor({ left, right }: Props) {
  return (
    <Grid>
      <LeftCol>{left}</LeftCol>
      <div>{right}</div>
    </Grid>
  );
}
