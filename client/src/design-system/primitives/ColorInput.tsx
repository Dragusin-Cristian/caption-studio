import styled from 'styled-components';

export const ColorSwatch = styled.input.attrs({ type: 'color' })`
  width: 42px;
  height: 30px;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.colors.surface2};
  cursor: pointer;
`;

export const ColorRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

export const ColorValue = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
`;
