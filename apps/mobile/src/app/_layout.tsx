import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';

import { TextScaleProvider } from '../textScale';
import { theme } from '../theme';

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

export default function RootLayout() {
  // Outfit for headings, Figtree for body text (Figma "Type pairing").
  const [fontsLoaded] = useFonts({
    Outfit_600SemiBold,
    Outfit_700Bold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });
  if (!fontsLoaded) return null;

  return (
    <ConvexProvider client={convex}>
      <TextScaleProvider>
        {/* Every screen draws its own header from the design (PageHeader), so none here. */}
        <Stack screenOptions={{ headerShown: false, title: '', contentStyle: { backgroundColor: theme.color.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat" options={{ presentation: 'modal' }} />
          <Stack.Screen name="emergency" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        </Stack>
      </TextScaleProvider>
    </ConvexProvider>
  );
}
