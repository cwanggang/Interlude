// Patient tabs from the Figma "HF · Tab bar": Home, My Visit, My Health, Settings. The Questions
// screen is kept as a route (opened from My Visit) but has no tab in the design.
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../../BiText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components';
import type { IconName } from '../../icons';
import { theme } from '../../theme';
import { usePatient } from '../../usePatient';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: { name: string; icon: IconName; activeIcon: IconName; label: 'tabHome' | 'tabVisit' | 'tabHealth' | 'tabSettings' }[] = [
  { name: 'index', icon: 'tab-home', activeIcon: 'tab-home-active', label: 'tabHome' },
  { name: 'visit', icon: 'tab-visit', activeIcon: 'tab-visit-active', label: 'tabVisit' },
  { name: 'health', icon: 'tab-health', activeIcon: 'tab-health-active', label: 'tabHealth' },
  { name: 'settings', icon: 'tab-settings', activeIcon: 'tab-settings-active', label: 'tabSettings' },
];

function TabBar({ state, navigateToTab }: TabBarProps) {
  const { s } = usePatient();
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name;
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.color.surface,
        borderTopWidth: 1,
        borderTopColor: theme.color.border,
        paddingTop: 16,
        paddingBottom: 14 + insets.bottom,
        paddingHorizontal: theme.space.sm,
      }}
    >
      {TABS.map((tab) => {
        const route = state.routes.find((r) => r.name === tab.name);
        const active = tab.name === activeName;
        return (
          <Pressable
            key={tab.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={s[tab.label]}
            onPress={() => route && navigateToTab(route.key)}
            style={{ flex: 1, alignItems: 'center', gap: 6, minHeight: theme.minTap }}
          >
            <View style={{ width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? theme.color.primaryBg : 'transparent' }}>
              <Icon name={active ? tab.activeIcon : tab.icon} size={24} />
            </View>
            <Text
              style={{
                fontFamily: active ? theme.font.bodySemiBold : theme.font.body,
                fontSize: theme.font.size.xs,
                color: active ? theme.color.primary : theme.color.textMuted,
              }}
            >
              {s[tab.label]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.color.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="visit" />
      <Tabs.Screen name="health" />
      <Tabs.Screen name="settings" />
      <Tabs.Screen name="questions" options={{ href: null }} />
    </Tabs>
  );
}
