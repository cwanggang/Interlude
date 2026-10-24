// G17: full-screen "Call 911 now", opened when a chat reply is a red flag. Track A has already
// created the doctor's alert. No chat button here.
import { router } from 'expo-router';
import { Linking, Text, View } from 'react-native';

import { Button } from '../components';
import { useTextScale } from '../textScale';
import { theme } from '../theme';
import { usePatient } from '../usePatient';

export default function Emergency() {
  const { s } = usePatient();
  const scale = useTextScale();
  const white = { color: theme.color.primaryText, fontWeight: '700' as const };
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.danger, padding: theme.space.xl, justifyContent: 'center', gap: theme.space.xl }}>
      <Text accessibilityRole="header" style={{ ...white, fontSize: theme.font.size.xl * 1.4 * scale }}>
        {s.emergencyTitle}
      </Text>
      <Text style={{ ...white, fontSize: theme.font.size.lg * scale }}>{s.emergencyBody}</Text>
      <Button big label={`📞 ${s.call911}`} variant="secondary" onPress={() => void Linking.openURL('tel:911')} />
      <Button label={s.backToChat} variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </View>
  );
}
