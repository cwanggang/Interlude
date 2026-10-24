// Design tokens from the Figma file "Interlude / Lagoon" (high-fi wireframes). Screens never use raw
// colors or sizes. Older users: body text 18+, tap targets at least 44, deep teal for actions.
export const theme = {
  color: {
    bg: '#f1f8fa', // Surface
    surface: '#ffffff',
    border: '#d5e3e8',
    text: '#0d2a3a', // Ink
    textMuted: '#506b78',
    primary: '#087d8d', // deep teal: high-contrast actions
    primaryText: '#ffffff',
    primaryBg: '#e6f6f6', // teal tint: chips, icon circles, active tab
    lagoon: '#14a3b8',
    periwinkle: '#6c8cff',
    lavender: '#cbbdff', // call button gradient start
    coral: '#ff8a73',
    coralBg: '#fff1ec', // safety notice, missed call
    danger: '#b4462f',
    dangerBg: '#fff1ec',
    success: '#22a06b', // "Summary ready", "Answered"
    successBg: '#e7f6ef',
    periwinkleBg: '#eef1ff', // "Carried over"
    reviewBg: '#e4e9ff', // "Your doctor is reviewing"
    neutralBg: '#eef4f6',
    // The background blend behind each screen
    blendTeal: '#5ee3e3',
  },
  /** Call button: left to right. */
  gradient: ['#cbbdff', '#6c8cff'] as const,
  font: {
    heading: 'Outfit_600SemiBold',
    headingBold: 'Outfit_700Bold',
    body: 'Figtree_400Regular',
    bodyMedium: 'Figtree_500Medium',
    bodySemiBold: 'Figtree_600SemiBold',
    bodyBold: 'Figtree_700Bold',
    size: { xs: 13, sm: 16, md: 18, lg: 22, xl: 28, xxl: 32, hero: 38 },
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { sm: 12, md: 20, lg: 24, xl: 26, pill: 999 },
  minTap: 48,
  shadow: {
    card: { shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
    button: { shadowColor: '#0d2a3a', shadowOpacity: 0.2, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  },
} as const;

export type Tone = 'neutral' | 'danger' | 'success' | 'primary';
