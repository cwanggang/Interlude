// The six shared components (plus TextField). Screens build only from these, so the design pass
// restyles here.
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text as RNText, TextInput, View, type TextStyle } from 'react-native';

import { theme, type Tone } from '../theme';

export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: theme.space.lg, gap: theme.space.lg, paddingBottom: theme.space.xl * 2 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer && (
        <View
          style={{
            padding: theme.space.md,
            borderTopWidth: 1,
            borderTopColor: theme.color.border,
            backgroundColor: theme.color.surface,
          }}
        >
          {footer}
        </View>
      )}
    </View>
  );
}

export function Card({ title, tone = 'neutral', children }: { title?: string; tone?: Tone; children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: tone === 'danger' ? theme.color.dangerBg : theme.color.surface,
        borderWidth: 1,
        borderColor: tone === 'danger' ? theme.color.danger : theme.color.border,
        borderRadius: theme.radius.md,
        padding: theme.space.lg,
        gap: theme.space.md,
      }}
    >
      {title && <Text variant="heading">{title}</Text>}
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  big,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  big?: boolean;
}) {
  const bg = variant === 'primary' ? theme.color.primary : variant === 'danger' ? theme.color.danger : theme.color.surface;
  const fg = variant === 'secondary' ? theme.color.text : theme.color.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: big ? theme.minTap * 1.5 : theme.minTap,
        paddingHorizontal: theme.space.lg,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        borderColor: variant === 'secondary' ? theme.color.border : bg,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      <RNText style={{ color: fg, fontSize: big ? theme.font.size.lg : theme.font.size.md, fontWeight: '600', textAlign: 'center' }}>
        {label}
      </RNText>
    </Pressable>
  );
}

const textStyles: Record<'title' | 'heading' | 'body' | 'muted' | 'quote' | 'error', TextStyle> = {
  title: { fontSize: theme.font.size.xl, fontWeight: '700', color: theme.color.text },
  heading: { fontSize: theme.font.size.lg, fontWeight: '600', color: theme.color.text },
  body: { fontSize: theme.font.size.md, color: theme.color.text },
  muted: { fontSize: theme.font.size.sm, color: theme.color.textMuted },
  quote: { fontSize: theme.font.size.md, fontStyle: 'italic', color: theme.color.text },
  error: { fontSize: theme.font.size.sm, color: theme.color.danger },
};

export function Text({ variant = 'body', children }: { variant?: keyof typeof textStyles; children: ReactNode }) {
  return <RNText style={textStyles[variant]}>{children}</RNText>;
}

const badgeColors: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: theme.color.neutralBg, fg: theme.color.textMuted },
  danger: { bg: theme.color.danger, fg: theme.color.primaryText },
  success: { bg: theme.color.success, fg: theme.color.primaryText },
  primary: { bg: theme.color.primary, fg: theme.color.primaryText },
};

export function Badge({ tone = 'neutral', label }: { tone?: Tone; label: string }) {
  const c = badgeColors[tone];
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 999, paddingHorizontal: theme.space.sm, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <RNText style={{ color: c.fg, fontSize: theme.font.size.sm }}>{label}</RNText>
    </View>
  );
}

export function ListItem({
  title,
  subtitle,
  trailing,
  onPress,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
}) {
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.md,
        minHeight: theme.minTap,
        paddingVertical: theme.space.sm,
        borderBottomWidth: 1,
        borderBottomColor: theme.color.border,
      }}
    >
      <View style={{ flex: 1, gap: theme.space.xs }}>
        {typeof title === 'string' ? <Text>{title}</Text> : title}
        {typeof subtitle === 'string' ? <Text variant="muted">{subtitle}</Text> : subtitle}
      </View>
      {trailing}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  keyboardType,
  multiline,
}: {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  hint?: string;
  keyboardType?: 'default' | 'phone-pad' | 'numbers-and-punctuation';
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: theme.space.xs }}>
      {label && <Text variant="heading">{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.color.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
        accessibilityLabel={label ?? placeholder}
        style={{
          minHeight: theme.minTap,
          fontSize: theme.font.size.md,
          color: theme.color.text,
          backgroundColor: theme.color.surface,
          borderWidth: 1,
          borderColor: theme.color.border,
          borderRadius: theme.radius.sm,
          paddingHorizontal: theme.space.md,
          paddingVertical: theme.space.sm,
        }}
      />
      {hint && <Text variant="muted">{hint}</Text>}
    </View>
  );
}

/** Two or more mutually exclusive options as large buttons (language picker). */
export function Choice<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
      {options.map((o) => (
        <View key={o.value} style={{ flex: 1 }}>
          <Button label={o.label} variant={o.value === value ? 'primary' : 'secondary'} onPress={() => onChange(o.value)} />
        </View>
      ))}
    </View>
  );
}
