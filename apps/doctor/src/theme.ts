// Design tokens. Screens never use raw colors or sizes; the Figma pass replaces these values.
export const theme = {
  color: {
    bg: '#f6f7f9',
    surface: '#ffffff',
    border: '#d9dde3',
    text: '#1b1f24',
    textMuted: '#5c6670',
    primary: '#2457c5',
    primaryText: '#ffffff',
    danger: '#c62828',
    dangerBg: '#fdecea',
    success: '#2e7d32',
    neutralBg: '#eef1f4',
  },
  // One color per symptom line, in order of first appearance.
  chart: ['#2457c5', '#d9480f', '#2b8a3e', '#862e9c', '#c2255c', '#0b7285'],
  font: {
    family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    size: { sm: 13, md: 15, lg: 18, xl: 24 },
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { sm: 4, md: 8 },
} as const

export type Tone = 'neutral' | 'danger' | 'success' | 'primary'
