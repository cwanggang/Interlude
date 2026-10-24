// The six shared components. Screens build only from these, so the design pass restyles here.
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { theme, type Tone } from '../theme'

export function Screen({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: theme.color.bg, color: theme.color.text, fontFamily: theme.font.family }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.space.md,
          padding: `${theme.space.md}px ${theme.space.xl}px`,
          background: theme.color.surface,
          borderBottom: `1px solid ${theme.color.border}`,
        }}
      >
        <Text variant="title">{title}</Text>
        <div style={{ display: 'flex', gap: theme.space.sm }}>{actions}</div>
      </header>
      <main style={{ padding: theme.space.xl, display: 'grid', gap: theme.space.lg, maxWidth: 1200, margin: '0 auto' }}>
        {children}
      </main>
    </div>
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
