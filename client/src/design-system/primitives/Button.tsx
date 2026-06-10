import styled, { css } from 'styled-components';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';

const variantStyles = {
  default: css`
    background: ${({ theme }) => theme.colors.surface};
    border-color: ${({ theme }) => theme.colors.line};
    color: ${({ theme }) => theme.colors.text};
    &:hover { border-color: ${({ theme }) => theme.colors.accentDim}; }
  `,
  primary: css`
    background: ${({ theme }) => theme.colors.accent};
    border-color: ${({ theme }) => theme.colors.accent};
    color: ${({ theme }) => theme.colors.accentOn};
    font-weight: 600;
    &:hover { background: ${({ theme }) => theme.colors.accentHover}; }
  `,
  ghost: css`
    background: transparent;
    border-color: ${({ theme }) => theme.colors.line};
    color: ${({ theme }) => theme.colors.text};
    &:hover { border-color: ${({ theme }) => theme.colors.accentDim}; }
  `,
  danger: css`
    background: transparent;
    border-color: ${({ theme }) => theme.colors.dangerBorder};
    color: ${({ theme }) => theme.colors.danger};
    &:hover { border-color: ${({ theme }) => theme.colors.danger}; }
  `,
};

export const Button = styled.button<{ $variant?: ButtonVariant }>`
  border: 1px solid;
  padding: 9px 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  cursor: pointer;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: border-color .12s, background .12s;
  ${({ $variant = 'default' }) => variantStyles[$variant]};

  &:disabled {
    opacity: .45;
    cursor: not-allowed;
  }
`;
