import { createGlobalStyle } from 'styled-components';

export const GlobalStyle = createGlobalStyle`
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    background: ${({ theme }) => theme.colors.bg};
    color: ${({ theme }) => theme.colors.text};
    font-family: ${({ theme }) => theme.fonts.sans};
    font-size: ${({ theme }) => theme.size.base};
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  button { font-family: inherit; }
  ::selection {
    background: ${({ theme }) => theme.colors.accent};
    color: ${({ theme }) => theme.colors.accentOn};
  }
  a { color: ${({ theme }) => theme.colors.accentDim}; }

  @keyframes captionPulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: .25; }
  }
`;
