// Patient tabs: Home, My Visit, Questions, My Health, Settings. Labels follow the patient's language.
import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { ChatButton } from '../../ChatButton';
import { theme } from '../../theme';
import { usePatient } from '../../usePatient';

const icon = (glyph: string) =>
  function TabIcon() {
    return <Text style={{ fontSize: theme.font.size.lg }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const { s } = usePatient();
  return (
    <Tabs
      screenOptions={{
        title: '',
        headerTitleStyle: { fontSize: theme.font.size.lg },
        headerTintColor: theme.color.primary,
        tabBarActiveTintColor: theme.color.primary,
        tabBarInactiveTintColor: theme.color.textMuted,
        tabBarLabelStyle: { fontSize: theme.font.size.sm },
        tabBarStyle: { minHeight: theme.minTap + theme.space.lg },
        sceneStyle: { backgroundColor: theme.color.bg },
        headerRight: () => <ChatButton />,
      }}
    >
      <Tabs.Screen name="index" options={{ tabBarLabel: s.tabHome, tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="visit" options={{ tabBarLabel: s.tabVisit, tabBarIcon: icon('📋') }} />
      <Tabs.Screen name="questions" options={{ tabBarLabel: s.tabQuestions, tabBarIcon: icon('❓') }} />
      <Tabs.Screen name="health" options={{ tabBarLabel: s.tabHealth, tabBarIcon: icon('📈') }} />
      <Tabs.Screen name="settings" options={{ tabBarLabel: s.tabSettings, tabBarIcon: icon('⚙️') }} />
    </Tabs>
  );
}
