import styled from 'styled-components';

export const Select = styled.select`
  background: ${({ theme }) => theme.colors.surface2};
  border: 1px solid ${({ theme }) => theme.colors.line};
  color: ${({ theme }) => theme.colors.text};
  border-radius: ${({ theme }) => theme.radius.sm};
  padding: 7px 9px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 13px;

  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accentDim}; }
`;
