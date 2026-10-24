// G16: the "Pregunte" (Ask) button in every tab's header, rather than floating, so it never
// covers content or the Home bell. Hidden during onboarding (no patient yet).
import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { Text } from './components';
import { theme } from './theme';
import { usePatient } from './usePatient';

export function ChatButton() {
  const { patient, s } = usePatient();
  if (!patient) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={s.askLabel}
      onPress={() => router.push('/chat')}
      style={({ pressed }) => ({
        minHeight: theme.minTap,
        minWidth: theme.minTap,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.xs,
        paddingHorizontal: theme.space.md,
        marginRight: theme.space.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.color.primaryBg,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text variant="heading">💬</Text>
      <Text variant="heading">{s.ask}</Text>
    </Pressable>
  );
}
