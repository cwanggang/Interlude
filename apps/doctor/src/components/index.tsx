// Shared components, styled from the Figma file "Interlude / Lagoon" (doctor website, 6.x). Screens
// build only from these and theme.ts, so a design change lands here.
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { theme, type Tone } from '../theme'

/** A Figma-exported SVG from /public/figma at its design size. */
export function Icon({ name, size, style }: { name: string; size: number; style?: CSSProperties }) {
  return <img src={`/figma/${name}.svg`} alt="" width={size} height={size} style={{ display: 'block', flexShrink: 0, ...style }} />
}

/** Page body: 48 px sides, 32–36 px top, 24 px gaps. `width` caps the content. */
export function Screen({ children, gap = 24 }: { children: ReactNode; gap?: number }) {
  return (
    <main style={{ padding: `32px ${theme.space.xxl}px 48px`, display: 'grid', gap, alignContent: 'start', maxWidth: 1440, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>
      {children}
    </main>
  )
}

/** White rounded card. `bordered` adds the hairline; `tone` tints it; `decor` sits behind the content. */
export function Card({ title, actions, tone = 'neutral', bordered = true, padding = 26, gap = 14, decor, style, children }: { title?: ReactNode; actions?: ReactNode; tone?: Tone | 'periwinkle' | 'coral'; bordered?: boolean; padding?: number; gap?: number; decor?: ReactNode; style?: CSSProperties; children: ReactNode }) {
  const bg = tone === 'danger' ? theme.color.dangerBg : tone === 'periwinkle' ? theme.color.periwinkleBg : tone === 'coral' ? '#fff1ec' : tone === 'primary' ? theme.color.primaryBg : theme.color.surface
  return (
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: bg,
        border: bordered && tone === 'neutral' ? `1px solid ${theme.color.border}` : tone === 'danger' ? `1px solid ${theme.color.dangerBorder}` : 'none',
        borderRadius: theme.radius.md,
        padding,
        display: 'grid',
        alignContent: 'start',
        gap,
        minWidth: 0,
        ...style,
      }}
    >
      {decor && <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{decor}</div>}
      {(title || actions) && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.md }}>
          {typeof title === 'string' ? <Text variant="heading">{title}</Text> : title}
          {actions}
        </div>
      )}
      <div style={{ position: 'relative', display: 'grid', gap, minWidth: 0 }}>{children}</div>
    </section>
  )
}

/** Blurred blend circle exported from Figma, placed by its box's top and right edge. */
export function Blend({ name, size, top, right }: { name: string; size: number; top: number; right: number }) {
  return <img src={`/figma/${name}.svg`} alt="" width={size} height={size} style={{ position: 'absolute', top, right, width: size, height: size, maxWidth: 'none' }} />
}

type ButtonVariant = 'primary' | 'secondary' | 'ink' | 'soft'

/** Pill button. primary: teal; secondary: white with a hairline; ink: navy; soft: teal tint. */
export function Button({ variant = 'primary', icon, iconAfter, size = 'md', style, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; icon?: string; iconAfter?: string; size?: 'md' | 'lg' }) {
  const colors: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: theme.color.primary, fg: theme.color.primaryText, border: theme.color.primary },
    secondary: { bg: theme.color.surface, fg: theme.color.text, border: theme.color.border },
    ink: { bg: theme.color.text, fg: theme.color.primaryText, border: theme.color.text },
    soft: { bg: theme.color.primaryBg, fg: theme.color.primary, border: theme.color.primaryBg },
  }
  const c = colors[variant]
  return (
    <button
      {...rest}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: size === 'lg' ? 52 : 44,
        padding: '0 20px',
        borderRadius: theme.radius.pill,
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: c.fg,
        font: `700 ${size === 'lg' ? 16 : 15}px ${theme.font.body}`,
        cursor: rest.disabled ? 'default' : 'pointer',
        opacity: rest.disabled ? 0.55 : 1,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
      {iconAfter && <Icon name={iconAfter} size={18} />}
    </button>
  )
}

const textStyles = {
  display: { font: `600 34px/1.15 ${theme.font.heading}` },
  title: { font: `600 28px/1.15 ${theme.font.heading}` },
  heading: { font: `600 22px/1.15 ${theme.font.heading}` },
  subheading: { font: `600 19px/1.15 ${theme.font.heading}` },
  body: { font: `400 16px/1.45 ${theme.font.body}` },
  strong: { font: `600 15px/1.45 ${theme.font.body}` },
  small: { font: `400 14px/1.45 ${theme.font.body}` },
  muted: { font: `400 14px/1.45 ${theme.font.body}`, color: theme.color.textMuted },
  label: { font: `600 12px/1.45 ${theme.font.body}`, color: theme.color.textMuted, letterSpacing: 0.2, textTransform: 'uppercase' as const },
  link: { font: `600 14px/1.45 ${theme.font.body}`, color: theme.color.primary },
  quote: { font: `500 16px/1.45 ${theme.font.body}` },
} satisfies Record<string, CSSProperties>

export function Text({ variant = 'body', color, style, children }: { variant?: keyof typeof textStyles; color?: string; style?: CSSProperties; children: ReactNode }) {
  return <span style={{ display: 'block', margin: 0, color: theme.color.text, ...textStyles[variant], ...(color ? { color } : {}), ...style }}>{children}</span>
}

/** Teal text link with a chevron ("See all patients ›"). */
export function Link({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', ...textStyles.link, whiteSpace: 'pre' }}>
      {children}
      {'  ›'}
    </button>
  )
}

const chipColors = {
  neutral: { bg: theme.color.neutralBg, fg: theme.color.textMuted },
  primary: { bg: theme.color.primaryBg, fg: theme.color.primary },
  solid: { bg: theme.color.primary, fg: theme.color.primaryText },
  ink: { bg: theme.color.text, fg: theme.color.primaryText },
  periwinkle: { bg: theme.color.periwinkleBg, fg: theme.color.periwinkle },
  danger: { bg: theme.color.dangerBg, fg: theme.color.dangerText },
  coral: { bg: '#fff1ec', fg: '#b4462f' },
  success: { bg: theme.color.successBg, fg: theme.color.success },
  white: { bg: theme.color.surface, fg: theme.color.primary },
}

export type ChipTone = keyof typeof chipColors

/** Rounded chip with an optional 14 px icon. `dashed` is the "Not reported" outline style. */
export function Chip({ tone = 'neutral', icon, dashed, size = 13, onClick, children }: { tone?: ChipTone; icon?: string; dashed?: boolean; size?: number; onClick?: () => void; children: ReactNode }) {
  const c = chipColors[tone]
  return (
    <span
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 11px',
        borderRadius: theme.radius.pill,
        background: dashed ? theme.color.surface : c.bg,
        border: dashed ? '1px dashed #9ab0ba' : tone === 'white' ? `1px solid ${theme.color.border}` : 'none',
        color: dashed ? theme.color.textMuted : c.fg,
        font: `600 ${size}px/1.45 ${theme.font.body}`,
        whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
      }}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  )
}

/** Small round count badge (red alert count). */
export function CountBadge({ count, size = 22 }: { count: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: size / 2, background: theme.color.danger, color: theme.color.primaryText, font: `700 12px ${theme.font.body}`, flexShrink: 0 }}>
      {count}
    </span>
  )
}

/** Initials in a circle: teal tint (table rows) or the teal-to-blue gradient (header, nav). */
export function Avatar({ name, size = 36, gradient }: { name: string; size?: number; gradient?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: size / 2,
        background: gradient ? theme.avatarGradient : theme.color.primaryBg,
        color: gradient ? theme.color.text : theme.color.primary,
        font: size >= 56 ? `600 20px ${theme.font.heading}` : `700 13px ${theme.font.body}`,
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  )
}

/** Small filled circle ("new since last viewed"). */
export function Dot({ color = theme.color.primary, size = 10, title }: { color?: string; size?: number; title?: string }) {
  return <span title={title} style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0 }} />
}

export function Divider() {
  return <div style={{ height: 1, background: theme.color.border, width: '100%' }} />
}

/** Pill search field with the search icon. `active` gives it the teal border (6.3). */
export function SearchField({ value, onChange, onSubmit, placeholder, width, active, icon = 'search' }: { value: string; onChange: (value: string) => void; onSubmit?: () => void; placeholder: string; width?: number | string; active?: boolean; icon?: string }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.()
      }}
      style={{ display: 'flex', alignItems: 'center', gap: 10, height: 48, padding: '0 18px', borderRadius: theme.radius.pill, background: theme.color.surface, border: active ? `1.5px solid ${theme.color.primary}` : `1px solid ${theme.color.border}`, width, boxSizing: 'border-box' }}
    >
      <Icon name={icon} size={18} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: `400 15px/1.45 ${theme.font.body}`, color: theme.color.text }}
      />
    </form>
  )
}

/** Top navigation: the interlude wordmark, Home / Patients tabs (alert count), and the doctor. */
export function NavBar<T extends string>({ tabs, active, onSelect, doctorName }: { tabs: { id: T; label: string; badge?: number }[]; active: T; onSelect: (id: T) => void; doctorName: string | null }) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 48, height: 72, padding: `0 ${theme.space.xxl}px`, background: theme.color.surface, borderBottom: `1px solid ${theme.color.border}`, fontFamily: theme.font.body }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <Wordmark />
        <span style={{ font: `500 14px/1.4 ${theme.font.body}`, color: theme.color.textMuted, paddingBottom: 8 }}>for clinicians</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {tabs.map((tab) => {
          const on = tab.id === active
          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', borderRadius: theme.radius.pill, border: 'none', background: on ? theme.color.primaryBg : 'transparent', color: on ? theme.color.primary : theme.color.textMuted, font: `${on ? 600 : 500} 15px ${theme.font.body}`, cursor: 'pointer' }}
            >
              {tab.label}
              {!!tab.badge && <CountBadge count={tab.badge} size={20} />}
            </button>
          )
        })}
      </div>
      <div style={{ flex: 1 }} />
      {doctorName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={doctorName.replace(/^Dr\.?\s*/, 'D ')} gradient />
          <span style={{ font: `500 15px ${theme.font.body}`, color: theme.color.text }}>{doctorName}</span>
        </div>
      )}
    </nav>
  )
}

/** "interlude" with the mascot as the dot on the i (Figma wordmark). */
function Wordmark() {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 120, height: 52 }} aria-label="interlude">
      <span style={{ position: 'absolute', left: 9.8, top: 13.8, font: `700 30px ${theme.font.heading}`, letterSpacing: -0.9, color: theme.color.text, lineHeight: 'normal' }}>nterlude</span>
      <span style={{ position: 'absolute', left: 5.2, top: 28.9, width: 4.6, height: 14.9, borderRadius: 0.9, background: theme.color.text }} />
      <Icon name="mascot-hello-15" size={15} style={{ position: 'absolute', left: 0, top: 12.4 }} />
    </span>
  )
}

/** Panel that slides over the right edge of the page. */
export function SidePanel({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 20, width: 'min(440px, 100vw)', overflowY: 'auto', background: theme.color.surface, borderLeft: `1px solid ${theme.color.border}`, boxShadow: '-4px 0 16px rgba(0,0,0,0.12)', padding: 24, display: 'grid', alignContent: 'start', gap: 14, fontFamily: theme.font.body }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        {title}
        <CloseButton onClick={onClose} />
      </div>
      {children}
    </aside>
  )
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button aria-label="Close" onClick={onClick} style={{ width: 36, height: 36, borderRadius: 18, border: 'none', background: theme.color.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
      <Icon name="close-x-18" size={18} />
    </button>
  )
}

/** Centered modal over a dimmed page (6.8 release confirm). */
export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(13,42,58,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(580px, 100%)', background: theme.color.surface, borderRadius: 28, padding: 32, boxShadow: '0 24px 60px rgba(13,42,58,0.2)', display: 'grid', gap: 20 }}>
        {children}
      </div>
    </div>
  )
}

/** Text input + submit button on one row (ask the record). */
export function TextField({ value, onChange, onSubmit, placeholder, submitLabel, busy }: { value: string; onChange: (value: string) => void; onSubmit: () => void; placeholder?: string; submitLabel: string; busy?: boolean }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim() && !busy) onSubmit()
      }}
      style={{ display: 'flex', gap: theme.space.sm }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, height: 48, padding: '0 18px', borderRadius: theme.radius.pill, border: `1px solid ${theme.color.border}`, font: `400 15px ${theme.font.body}`, color: theme.color.text, outline: 'none' }}
      />
      <Button type="submit" disabled={busy || !value.trim()}>{busy ? '…' : submitLabel}</Button>
    </form>
  )
}
