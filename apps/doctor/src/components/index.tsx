// The six shared components. Screens build only from these, so the design pass restyles here.
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { theme, type Tone } from '../theme'

/** Page with a sticky header: title, actions on the right, and an optional banner row below. */
export function Screen({ title, subtitle, actions, banner, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; banner?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: theme.color.bg, color: theme.color.text, fontFamily: theme.font.family }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: theme.color.surface,
          borderBottom: `1px solid ${theme.color.border}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: theme.space.md,
            padding: `${theme.space.md}px ${theme.space.xl}px`,
          }}
        >
          <div style={{ display: 'grid', gap: theme.space.xs }}>
            <Text variant="title">{title}</Text>
            {subtitle && <Text variant="muted">{subtitle}</Text>}
          </div>
          <div style={{ display: 'flex', gap: theme.space.sm, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>
        </div>
        {banner}
      </header>
      <main style={{ padding: theme.space.xl, display: 'grid', gap: theme.space.lg, maxWidth: 1200, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  )
}

/** Full-width red row for the sticky header (red-flag banner). */
export function Banner({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.space.md,
        padding: `${theme.space.sm}px ${theme.space.xl}px`,
        background: theme.color.danger,
        color: theme.color.primaryText,
        fontSize: theme.font.size.md,
      }}
    >
      <div>{children}</div>
      {actions && <div style={{ display: 'flex', gap: theme.space.sm }}>{actions}</div>}
    </div>
  )
}

/** Panel that slides over the right edge of the page (timeline quotes). */
export function SidePanel({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
        width: 'min(440px, 100vw)',
        overflowY: 'auto',
        background: theme.color.surface,
        borderLeft: `1px solid ${theme.color.border}`,
        boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.12)',
        padding: theme.space.lg,
        display: 'grid',
        alignContent: 'start',
        gap: theme.space.md,
        fontFamily: theme.font.family,
        color: theme.color.text,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: theme.space.md }}>
        <Text variant="heading">{title}</Text>
        <Button variant="secondary" onClick={onClose} aria-label="Close">Close</Button>
      </div>
      {children}
    </aside>
  )
}

export function Card({ title, actions, tone = 'neutral', children }: { title?: ReactNode; actions?: ReactNode; tone?: Tone; children: ReactNode }) {
  return (
    <section
      style={{
        background: tone === 'danger' ? theme.color.dangerBg : theme.color.surface,
        border: `1px solid ${tone === 'danger' ? theme.color.danger : theme.color.border}`,
        borderRadius: theme.radius.md,
        padding: theme.space.lg,
        display: 'grid',
        alignContent: 'start',
        gap: theme.space.md,
      }}
    >
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.md }}>
          <Text variant="heading">{title}</Text>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }

export function Button({ variant = 'primary', style, ...rest }: ButtonProps) {
  const primary = variant === 'primary'
  return (
    <button
      {...rest}
      style={{
        font: 'inherit',
        fontSize: theme.font.size.md,
        padding: `${theme.space.sm}px ${theme.space.md}px`,
        borderRadius: theme.radius.sm,
        border: `1px solid ${primary ? theme.color.primary : theme.color.border}`,
        background: primary ? theme.color.primary : theme.color.surface,
        color: primary ? theme.color.primaryText : theme.color.text,
        cursor: rest.disabled ? 'default' : 'pointer',
        opacity: rest.disabled ? 0.6 : 1,
        ...style,
      }}
    />
  )
}

const textStyles: Record<'title' | 'heading' | 'body' | 'muted' | 'quote', CSSProperties> = {
  title: { fontSize: theme.font.size.xl, fontWeight: 600 },
  heading: { fontSize: theme.font.size.lg, fontWeight: 600 },
  body: { fontSize: theme.font.size.md },
  muted: { fontSize: theme.font.size.sm, color: theme.color.textMuted },
  quote: { fontSize: theme.font.size.md, fontStyle: 'italic' },
}

export function Text({ variant = 'body', children }: { variant?: keyof typeof textStyles; children: ReactNode }) {
  return <span style={{ display: 'block', margin: 0, ...textStyles[variant] }}>{children}</span>
}

const badgeColors: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: theme.color.neutralBg, fg: theme.color.textMuted },
  danger: { bg: theme.color.danger, fg: theme.color.primaryText },
  success: { bg: theme.color.success, fg: theme.color.primaryText },
  primary: { bg: theme.color.primary, fg: theme.color.primaryText },
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const c = badgeColors[tone]
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: theme.font.size.sm,
        padding: `2px ${theme.space.sm}px`,
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

/** Text input + submit button on one row (search, ask the record). */
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
        style={{
          flex: 1,
          font: 'inherit',
          fontSize: theme.font.size.md,
          padding: `${theme.space.sm}px ${theme.space.md}px`,
          border: `1px solid ${theme.color.border}`,
          borderRadius: theme.radius.sm,
          background: theme.color.surface,
          color: theme.color.text,
        }}
      />
      <Button type="submit" disabled={busy || !value.trim()}>
        {busy ? '…' : submitLabel}
      </Button>
    </form>
  )
}

export function ListItem({ title, subtitle, trailing, onClick }: { title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.space.md,
        padding: `${theme.space.md}px 0`,
        borderBottom: `1px solid ${theme.color.border}`,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'grid', gap: theme.space.xs }}>
        <Text>{title}</Text>
        {subtitle && <Text variant="muted">{subtitle}</Text>}
      </div>
      {trailing && <div style={{ display: 'flex', gap: theme.space.sm, alignItems: 'center' }}>{trailing}</div>}
    </div>
  )
}

/** Top-level tabs (Home, Patients). `badge` shows a count on a tab, e.g. open alerts. */
export function NavBar<T extends string>({ tabs, active, onSelect }: { tabs: { id: T; label: string; badge?: number }[]; active: T; onSelect: (id: T) => void }) {
  return (
    <nav
      style={{
        display: 'flex',
        gap: theme.space.xs,
        padding: `0 ${theme.space.xl}px`,
        background: theme.color.surface,
        borderBottom: `1px solid ${theme.color.border}`,
        fontFamily: theme.font.family,
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          style={{
            font: 'inherit',
            fontSize: theme.font.size.md,
            fontWeight: tab.id === active ? 600 : 400,
            padding: `${theme.space.md}px ${theme.space.md}px`,
            border: 'none',
            borderBottom: `2px solid ${tab.id === active ? theme.color.primary : 'transparent'}`,
            background: 'none',
            color: tab.id === active ? theme.color.primary : theme.color.text,
            cursor: 'pointer',
            display: 'flex',
            gap: theme.space.sm,
            alignItems: 'center',
          }}
        >
          {tab.label}
          {!!tab.badge && <Badge tone="danger">{tab.badge}</Badge>}
        </button>
      ))}
    </nav>
  )
}

/** Small filled circle, e.g. "new since last viewed". */
export function Dot({ tone = 'primary', title }: { tone?: Tone; title?: string }) {
  return <span title={title} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: badgeColors[tone].bg }} />
}
