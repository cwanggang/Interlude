import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { Stack } from 'expo-router';

import { theme } from '../theme';

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

export default function RootLayout() {
  return (
    <ConvexProvider client={convex}>
      <Stack
        screenOptions={{
          headerTitleStyle: { fontSize: theme.font.size.lg },
          headerTintColor: theme.color.primary,
          contentStyle: { backgroundColor: theme.color.bg },
        }}
      />
    </ConvexProvider>
  );
}
