import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/** AI backend baked in at build time (EXPO_PUBLIC_API_URL). Users can change it later in the app's
 *  Settings → Server address, which is stored on the device and takes precedence. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');

/** Expo Go cannot carry the bundled web UI (it is copied into the APK by plugins/withWebAssets.js),
 *  so in Expo Go the UI is loaded from the backend, which serves the same files. */
export const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const BUNDLED_UI = 'file:///android_asset/web/index.html';

export function uiSource(): { uri: string } | null {
  if (Platform.OS === 'android' && !IS_EXPO_GO) return { uri: BUNDLED_UI };
  return API_URL ? { uri: `${API_URL}/` } : null;
}
