// Design tokens from the Figma file "Interlude / Lagoon" (doctor website, frames 6.x). Screens never
// use raw colors or sizes; a design change lands here.
export const theme = {
  color: {
    bg: '#f1f8fa', // Surface
    surface: '#ffffff',
    border: '#d5e3e8',
    text: '#0d2a3a', // Ink
    textMuted: '#506b78',
    placeholder: '#9ab0ba',
    primary: '#087d8d', // deep teal: actions
    primaryText: '#ffffff',
    primaryBg: '#e6f6f6',
    periwinkle: '#6c8cff',
    periwinkleBg: '#eef1ff',
    danger: '#e5484d',
    dangerText: '#b42318',
    dangerBg: '#fdecec',
    dangerBorder: 'rgba(229, 72, 77, 0.5)',
    success: '#22a06b',
    successBg: '#e7f6ef',
    neutralBg: '#f1f8fa',
  },
  /** Avatar circle: teal to blue. */
  avatarGradient: 'linear-gradient(135deg, #5ee3e3 0%, #7fa7ff 100%)',
  /** The patient's avatar on the live visit: lavender to blue. */
  patientGradient: 'linear-gradient(135deg, #c8b9ff 0%, #7fa7ff 100%)',
  /** Big call-to-action (Start recording, Upload visit, Read aloud). */
  ctaGradient: 'linear-gradient(90deg, #cbbdff 0%, #6c8cff 100%)',
  overlay: 'rgba(13,42,58,0.55)',
  // One color per symptom line, in order of first appearance.
  chart: ['#087d8d', '#6c8cff', '#ff8a73', '#14a3b8', '#b4462f', '#3e7fd6'],
  font: {
    heading: '"Outfit", system-ui, sans-serif',
    body: '"Figtree", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    family: '"Figtree", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    size: { xs: 12, sm: 14, md: 16, lg: 22, xl: 34, xxl: 36 },
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 48 },
  radius: { sm: 14, md: 20, lg: 24, pill: 999 },
} as const

export type Tone = 'neutral' | 'danger' | 'success' | 'primary'
