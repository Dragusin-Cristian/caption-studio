import styled from 'styled-components';

export const Slider = styled.input.attrs({ type: 'range' })`
  width: 100%;
  accent-color: ${({ theme }) => theme.colors.accent};
`;
