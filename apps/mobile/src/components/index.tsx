// Shared components, styled from the Figma file "Interlude / Lagoon". Screens build only from these
// and theme.ts, so a design change lands here.
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import { useLayoutEffect, type ReactNode } from 'react';
import { Pressable, ScrollView, Text as RNText, TextInput, View, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { icons, type IconName } from '../icons';
import { useTextScale } from '../textScale';
import { theme, type Tone } from '../theme';
import { usePatient } from '../usePatient';

// ---- Text ----

const textStyles = {
  hero: { fontFamily: theme.font.heading, fontSize: theme.font.size.hero, color: theme.color.text },
  title: { fontFamily: theme.font.heading, fontSize: theme.font.size.xxl, lineHeight: theme.font.size.xxl * 1.15, color: theme.color.text },
  pageTitle: { fontFamily: theme.font.heading, fontSize: theme.font.size.xl, lineHeight: theme.font.size.xl * 1.15, color: theme.color.text },
  heading: { fontFamily: theme.font.heading, fontSize: theme.font.size.lg, lineHeight: theme.font.size.lg * 1.15, color: theme.color.text },
  strong: { fontFamily: theme.font.bodyBold, fontSize: theme.font.size.md, lineHeight: theme.font.size.md * 1.4, color: theme.color.text },
  body: { fontFamily: theme.font.body, fontSize: theme.font.size.md, lineHeight: theme.font.size.md * 1.4, color: theme.color.text },
  muted: { fontFamily: theme.font.body, fontSize: theme.font.size.sm, lineHeight: theme.font.size.sm * 1.4, color: theme.color.textMuted },
  label: { fontFamily: theme.font.bodySemiBold, fontSize: 15, lineHeight: 15 * 1.4, color: theme.color.textMuted },
  link: { fontFamily: theme.font.bodySemiBold, fontSize: theme.font.size.sm, lineHeight: theme.font.size.sm * 1.4, color: theme.color.primary },
  quote: { fontFamily: theme.font.body, fontSize: theme.font.size.md, lineHeight: theme.font.size.md * 1.4, fontStyle: 'italic', color: theme.color.text },
  error: { fontFamily: theme.font.bodyMedium, fontSize: theme.font.size.sm, lineHeight: theme.font.size.sm * 1.4, color: theme.color.danger },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof textStyles;

export function Text({ variant = 'body', color, center, children }: { variant?: TextVariant; color?: string; center?: boolean; children: ReactNode }) {
  const scale = useTextScale();
  const style: TextStyle = textStyles[variant];
  return (
    <RNText
      style={{
        ...style,
        fontSize: (style.fontSize ?? theme.font.size.md) * scale,
        lineHeight: style.lineHeight ? style.lineHeight * scale : undefined,
        ...(color ? { color } : {}),
        ...(center ? { textAlign: 'center' } : {}),
      }}
    >
      {children}
    </RNText>
  );
}

// ---- Icons ----

/** A Figma-exported SVG at its design size. */
export function Icon({ name, size }: { name: IconName; size: number }) {
  return <Image source={icons[name]} style={{ width: size, height: size }} contentFit="contain" />;
}

/** Icon centred in a tinted circle (medication rows, notifications, tiles). */
export function IconCircle({ name, size = 44, iconSize = 22, bg = theme.color.primaryBg }: { name: IconName; size?: number; iconSize?: number; bg?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={iconSize} />
    </View>
  );
}

// ---- Layout ----

/** The two blurred teal and blue circles behind the top of every patient screen. */
function BackgroundBlend() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 900, overflow: 'hidden' }}>
      <Image source={icons['blend-1']} style={{ position: 'absolute', width: 1048, height: 1048, left: -450, top: -456 }} />
      <Image source={icons['blend-2']} style={{ position: 'absolute', width: 977, height: 977, left: -88, top: -425 }} />
    </View>
  );
}

/**
 * A patient screen: the background blend, safe-area padding, an optional header row, scrolling
 * content (24 px sides, 18 px gaps) and an optional pinned footer.
 */
export function Screen({ children, header, footer, scroll = true }: { children: ReactNode; header?: ReactNode; footer?: ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const content = { paddingHorizontal: theme.space.xl, paddingTop: theme.space.md, paddingBottom: theme.space.xl * 2, gap: 18 };
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top }}>
      <BackgroundBlend />
      {header && <View style={{ paddingHorizontal: theme.space.xl, paddingTop: theme.space.md }}>{header}</View>}
      {scroll ? (
        <ScrollView contentContainerStyle={content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[content, { flex: 1 }]}>{children}</View>
      )}
      {footer && <View style={{ paddingHorizontal: theme.space.xl, paddingBottom: theme.space.lg + insets.bottom, paddingTop: theme.space.sm }}>{footer}</View>}
    </View>
  );
}

/** White rounded card. `elevated` adds the appointment tile's shadow; `tone` tints it. */
export function Card({ title, tone = 'neutral', elevated, bordered = true, gap = 14, children }: { title?: string; tone?: Tone; elevated?: boolean; bordered?: boolean; gap?: number; children: ReactNode }) {
  const bg = tone === 'danger' ? theme.color.coralBg : tone === 'primary' ? theme.color.primaryBg : theme.color.surface;
  const border = tone === 'danger' ? theme.color.coral : theme.color.border;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderWidth: bordered && tone !== 'primary' ? 1 : 0,
        borderColor: border,
        borderRadius: theme.radius.lg,
        padding: 20,
        gap,
        ...(elevated ? theme.shadow.card : {}),
      }}
    >
      {title && <Text variant="heading">{title}</Text>}
      {children}
    </View>
  );
}

/** Section heading with an optional "See all" link on the right. */
export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
      <View style={{ flex: 1 }}>
        <Text variant="heading">{title}</Text>
      </View>
      {action && onAction && (
        <Pressable accessibilityRole="link" onPress={onAction} hitSlop={12}>
          <Text variant="link">{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Teal text link ("See all medications ›"). */
export function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={12} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
      <Text variant="link">{`${label}  ›`}</Text>
    </Pressable>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: theme.color.border }} />;
}

// ---- Buttons ----

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline';

/**
 * Pill button. primary: deep teal; outline: white with a teal border; secondary: white with a grey
 * border; danger: coral-red. `big` is the tall 76 px call button with the lavender→periwinkle blend.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  big,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  big?: boolean;
  icon?: IconName;
}) {
  const scale = useTextScale();
  if (big) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.85 : 1, borderRadius: theme.radius.xl, ...theme.shadow.button })}>
        <LinearGradient
          colors={theme.gradient}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ minHeight: 76, borderRadius: theme.radius.xl, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
        >
          {icon && <Icon name={icon} size={24} />}
          <RNText style={{ fontFamily: theme.font.heading, fontSize: theme.font.size.lg * scale, letterSpacing: -0.44, color: theme.color.primaryText, textAlign: 'center' }}>{label}</RNText>
        </LinearGradient>
      </Pressable>
    );
  }
  const bg = variant === 'primary' ? theme.color.primary : variant === 'danger' ? theme.color.danger : theme.color.surface;
  const fg = variant === 'primary' || variant === 'danger' ? theme.color.primaryText : variant === 'outline' ? theme.color.primary : theme.color.text;
  const border = variant === 'outline' ? theme.color.primary : variant === 'secondary' ? theme.color.border : bg;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: theme.minTap,
        paddingHorizontal: 18,
        borderRadius: theme.radius.pill,
        borderWidth: variant === 'outline' ? 1.5 : 1,
        borderColor: border,
        backgroundColor: bg,
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {icon && <Icon name={icon} size={18} />}
      <RNText style={{ color: fg, fontFamily: theme.font.bodyBold, fontSize: theme.font.size.sm * scale, textAlign: 'center' }}>{label}</RNText>
    </Pressable>
  );
}

/** "Ask" chat button: white pill with the chat icon. Hidden during onboarding (no patient yet). */
export function AskButton() {
  const { patient, s } = usePatient();
  if (!patient) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={s.askLabel}
      onPress={() => router.push('/chat')}
      style={({ pressed }) => ({
        height: theme.minTap,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.sm,
        paddingLeft: 14,
        paddingRight: 18,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: theme.color.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon name="chat" size={20} />
      <RNText style={{ fontFamily: theme.font.bodyMedium, fontSize: theme.font.size.sm, color: theme.color.text }}>{s.ask}</RNText>
    </Pressable>
  );
}

/** Back chevron in a white circle, the page title, and the Ask button (stack screens). */
export function PageHeader({ title, back = true, right }: { title: string; back?: boolean; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {back && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="chevron-left" size={22} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text variant="pageTitle">{title}</Text>
      </View>
      {right ?? <AskButton />}
    </View>
  );
}

/** "Not for emergencies. Call 911." (F3), required on Home and the visit summary. */
export function SafetyNotice() {
  const { s } = usePatient();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, padding: theme.space.lg, borderRadius: theme.radius.sm, backgroundColor: theme.color.coralBg }}>
      <Icon name="alert" size={20} />
      <View style={{ flex: 1 }}>
        <RNText style={{ fontFamily: theme.font.bodyMedium, fontSize: theme.font.size.sm, lineHeight: theme.font.size.sm * 1.4, color: theme.color.text }}>{s.disclaimer}</RNText>
      </View>
    </View>
  );
}

// ---- Small pieces ----

const badgeColors: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: theme.color.neutralBg, fg: theme.color.textMuted },
  danger: { bg: theme.color.coralBg, fg: theme.color.danger },
  success: { bg: theme.color.primaryBg, fg: theme.color.primary },
  primary: { bg: theme.color.primaryBg, fg: theme.color.primary },
};

/** Rounded chip ("Before visit", "From a call"). */
export function Badge({ tone = 'neutral', label }: { tone?: Tone; label: string }) {
  const c = badgeColors[tone];
  const scale = useTextScale();
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: theme.radius.pill, paddingHorizontal: theme.space.md, paddingVertical: 6, alignSelf: 'flex-start' }}>
      <RNText style={{ color: c.fg, fontFamily: theme.font.bodySemiBold, fontSize: 14 * scale }}>{label}</RNText>
    </View>
  );
}

export function ListItem({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  divider = true,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  divider?: boolean;
}) {
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.md,
        minHeight: theme.minTap,
        paddingVertical: 14,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: theme.color.border,
      }}
    >
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
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
    <View style={{ gap: theme.space.sm }}>
      {label && <Text variant="label">{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.color.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
        accessibilityLabel={label ?? placeholder}
        style={{
          minHeight: 56,
          fontFamily: theme.font.body,
          fontSize: theme.font.size.md,
          color: theme.color.text,
          backgroundColor: theme.color.surface,
          borderWidth: 1,
          borderColor: theme.color.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.space.lg,
          paddingVertical: 14,
        }}
      />
      {hint && <Text variant="muted">{hint}</Text>}
    </View>
  );
}

/** Two or more mutually exclusive options as large pills (language, text size, range). */
export function Choice<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: theme.minTap,
              borderRadius: theme.radius.pill,
              borderWidth: active ? 0 : 1,
              borderColor: theme.color.border,
              backgroundColor: active ? theme.color.primary : theme.color.surface,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: theme.space.sm,
            }}
          >
            <Text variant="body" color={active ? theme.color.primaryText : theme.color.text} center>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 28 px rounded checkbox: teal with a white check when done, grey outline otherwise (3.1, 3.3). */
export function Checkbox({ checked }: { checked: boolean }) {
  return checked ? (
    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: theme.color.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="check-white-18" size={18} />
    </View>
  ) : (
    <View style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: '#9ab0ba', backgroundColor: theme.color.surface }} />
  );
}

/** A tappable checklist row: checkbox and label; done rows turn muted. */
export function CheckRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}>
      <Checkbox checked={checked} />
      <View style={{ flex: 1 }}>
        <Text color={checked ? theme.color.textMuted : theme.color.text}>{label}</Text>
      </View>
    </Pressable>
  );
}

/** Small status chip with an icon ("Summary ready", "Answered", "Carried over"). */
export function StatusChip({ label, icon, color, bg }: { label: string; icon?: IconName; color: string; bg: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: bg }}>
      {icon && <Icon name={icon} size={14} />}
      <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: 14, color }}>{label}</RNText>
    </View>
  );
}

/** Pill-shaped segmented control in a white track (My Health time range). */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface }}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{ flex: i === 0 ? 1 : undefined, height: 44, paddingHorizontal: 14, borderRadius: theme.radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? theme.color.primary : 'transparent' }}
          >
            <RNText style={{ fontFamily: active ? theme.font.bodyBold : theme.font.bodyMedium, fontSize: 15, color: active ? theme.color.primaryText : theme.color.textMuted }}>{o.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small uppercase section label with an icon ("LANGUAGE", "CALLS"). */
export function SectionLabel({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name={icon} size={16} />
      <RNText style={{ fontFamily: theme.font.bodySemiBold, fontSize: theme.font.size.xs, color: theme.color.textMuted }}>{label}</RNText>
    </View>
  );
}

/** 52 × 32 switch: the design's teal "on" toggle, and a grey track when off. */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} onPress={() => onChange(!value)} hitSlop={8}>
      {value ? (
        <Image source={icons['toggle-on']} style={{ width: 52, height: 32 }} />
      ) : (
        <View style={{ width: 52, height: 32, borderRadius: 16, backgroundColor: theme.color.border, justifyContent: 'center', paddingLeft: 3 }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: theme.color.surface }} />
        </View>
      )}
    </Pressable>
  );
}

/** Row style for a medication or task: tinted icon circle, two lines, trailing action. */
export const rowCard: ViewStyle = {
  backgroundColor: theme.color.surface,
  borderRadius: theme.radius.md,
  paddingHorizontal: theme.space.lg,
  paddingVertical: 14,
  flexDirection: 'row',
  alignItems: 'center',
  gap: theme.space.md,
};

/** Sets the browser tab / screen-reader title. Headers are drawn by each screen (PageHeader). */
export function ScreenTitle({ title }: { title: string }) {
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);
  return null;
}
