// Drop-in for React Native's Text. When a string carries the "Show English" markers (see
// i18n.bilingual), it shows the Spanish and, on the next line, the English in smaller type.
// Strings without markers render exactly as before.
import type { ReactNode } from 'react';
import { StyleSheet, Text as RNText, type TextProps } from 'react-native';

import { splitBilingual } from './i18n';
import { theme } from './theme';

function asString(children: ReactNode): string | null {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children) && children.every((c) => typeof c === 'string' || typeof c === 'number')) return children.join('');
  return null;
}

export function Text({ children, style, numberOfLines, ...rest }: TextProps) {
  const text = asString(children);
  const parts = text === null ? null : splitBilingual(text);
  if (!parts?.english) {
    return (
      <RNText style={style} numberOfLines={numberOfLines} {...rest}>
        {children}
      </RNText>
    );
  }
  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = Math.min(15, Math.max(11, Math.round((flat.fontSize ?? 16) * 0.72)));
  return (
    <RNText style={style} numberOfLines={numberOfLines ? numberOfLines + 1 : undefined} {...rest}>
      {parts.main}
      {'\n'}
      <RNText style={{ fontSize, lineHeight: Math.round(fontSize * 1.35), fontFamily: theme.font.bodyMedium, letterSpacing: 0 }}>{parts.english}</RNText>
    </RNText>
  );
}
