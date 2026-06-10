export const theme = {
  colors: {
    bg: '#16130d',
    surface: '#211d15',
    surface2: '#2b261b',
    line: '#3a3327',
    text: '#ece6d8',
    muted: '#a39a86',
    accent: '#f4c95d',
    accentHover: '#f7d574',
    accentDim: '#c9a544',
    accentOn: '#1a160d',
    danger: '#e08a5a',
    dangerBorder: '#5a4030',
    good: '#86c08a',
  },
  fonts: {
    mono: 'ui-monospace,"SF Mono","Cascadia Code",Menlo,Consolas,monospace',
    sans: 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
  },
  radius: {
    panel: '10px',
    md: '8px',
    sm: '6px',
    pill: '50%',
  },
  size: {
    base: '15px',
    contentMaxWidth: '1180px',
  },
  layout: {
    breakpointCollapse: '860px',
  },
} as const;

export type AppTheme = typeof theme;
