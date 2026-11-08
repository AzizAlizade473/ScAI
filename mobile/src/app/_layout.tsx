import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/* Keep the splash screen until the Scam Guardian UI has loaded (hidden in GuardianWebView). */
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </SafeAreaProvider>
  );
}
