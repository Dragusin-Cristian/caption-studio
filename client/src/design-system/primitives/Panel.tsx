import styled from 'styled-components';

export const Panel = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radius.panel};
`;

export const PanelHeader = styled.header`
  padding: 11px 15px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 12px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
`;

export const PanelBody = styled.div`
  padding: 15px;
`;
