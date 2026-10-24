import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { Stack } from 'expo-router';

import { TextScaleProvider } from '../textScale';
import { theme } from '../theme';

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

export default function RootLayout() {
  return (
    <ConvexProvider client={convex}>
      <TextScaleProvider>
        <Stack
          screenOptions={{
            // Each screen sets its translated title; blank (not the route name) while it loads.
            title: '',
            headerTitleStyle: { fontSize: theme.font.size.lg },
            headerTintColor: theme.color.primary,
            contentStyle: { backgroundColor: theme.color.bg },
          }}
        >
          {/* The tabs have their own headers; history, prep, summaries and notifications open on top. */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </TextScaleProvider>
    </ConvexProvider>
  );
}
