// Design tokens. Screens never use raw colors or sizes; the Figma pass replaces these values.
// Older users: body text at least 18, tap targets at least 44, high contrast.
export const theme = {
  color: {
    bg: '#f6f7f9',
    surface: '#ffffff',
    border: '#cfd5dc',
    text: '#14181d',
    textMuted: '#4f5963',
    primary: '#1f4fb8',
    primaryText: '#ffffff',
    primaryBg: '#e8eefb',
    danger: '#b3261e',
    dangerBg: '#fdecea',
    success: '#2e7d32',
    neutralBg: '#e9edf1',
  },
  font: { size: { sm: 16, md: 18, lg: 22, xl: 28 } },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { sm: 6, md: 12 },
  minTap: 48,
} as const;

export type Tone = 'neutral' | 'danger' | 'success' | 'primary';
