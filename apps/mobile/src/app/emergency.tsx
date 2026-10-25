// "Call 911 now" (Figma 5.4, G17), opened when a chat reply is a red flag. Track A has already
// created the doctor's alert. No Ask button here.
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';
import { Text } from '../BiText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, ScreenTitle } from '../components';
import { useTextScale } from '../textScale';
import { theme } from '../theme';
import { usePatient } from '../usePatient';

const RED = '#e5484d';

export default function Emergency() {
  const { s } = usePatient();
  const scale = useTextScale();
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={['#5a1219', '#2a0f14']} style={{ flex: 1, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, paddingHorizontal: 28, gap: 20 }}>
      <ScreenTitle title={s.emergencyTitle} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <View style={{ width: 132, height: 132, borderRadius: 66, backgroundColor: 'rgba(229,72,77,0.25)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="alert-50" size={50} />
        </View>
        <Text accessibilityRole="header" style={{ fontFamily: theme.font.heading, fontSize: 38 * scale, color: theme.color.primaryText, textAlign: 'center' }}>
          {s.emergencyTitle}
        </Text>
        <Text style={{ fontFamily: theme.font.body, fontSize: 20 * scale, lineHeight: 28 * scale, color: 'rgba(255,255,255,0.9)', textAlign: 'center' }}>{s.emergencyBodyShort}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.color.surface, borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Icon name="check-ink-14" size={14} />
          <Text style={{ fontFamily: theme.font.bodySemiBold, fontSize: 15, color: theme.color.text }}>{s.alertedDoctor}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => void Linking.openURL('tel:911')}
        style={{ height: 72, borderRadius: theme.radius.pill, backgroundColor: theme.color.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
      >
        <Icon name="phone-red-26" size={26} />
        <Text style={{ fontFamily: theme.font.bodyBold, fontSize: 22 * scale, color: RED }}>{s.call911}</Text>
      </Pressable>
      <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 16, gap: 4 }}>
        <Text style={{ fontFamily: theme.font.bodyBold, fontSize: 17 * scale, color: theme.color.primaryText }}>{s.crisisTitle}</Text>
        <Text style={{ fontFamily: theme.font.body, fontSize: 17 * scale, color: 'rgba(255,255,255,0.9)' }}>{s.crisisBody}</Text>
      </View>
      {/* Not in the design: a way back for a false alarm. */}
      <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} style={{ alignSelf: 'center' }}>
        <Text style={{ fontFamily: theme.font.bodySemiBold, fontSize: 15, color: 'rgba(255,255,255,0.7)' }}>{s.backToChat}</Text>
      </Pressable>
    </LinearGradient>
  );
}
