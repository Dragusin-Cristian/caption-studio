import styled from 'styled-components';

export const MiniButton = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.muted};
  border-radius: 5px;
  padding: 4px 7px;
  font-size: 11px;
  cursor: pointer;
  font-family: ${({ theme }) => theme.fonts.mono};

  &:hover {
    border-color: ${({ theme }) => theme.colors.accentDim};
    color: ${({ theme }) => theme.colors.text};
  }
`;
