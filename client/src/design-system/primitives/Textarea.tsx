import styled from 'styled-components';

export const Textarea = styled.textarea`
  width: 100%;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.line};
  color: ${({ theme }) => theme.colors.text};
  border-radius: ${({ theme }) => theme.radius.sm};
  padding: 8px;
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 14px;
  resize: vertical;
  min-height: 42px;

  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accentDim}; }
`;
