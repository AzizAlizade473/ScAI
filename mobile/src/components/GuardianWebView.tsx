import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { API_URL, uiSource } from '@/lib/config';

/** Messages the web UI sends to the app (see the "Native shell bridge" in index.html and lab.js). */
type BridgeMessage =
  | { type: 'vibrate'; pattern: number[] }
  | { type: 'theme'; dark: boolean; bg?: string }
  | { type: 'exit' }
  | { type: 'rec-start'; maxSec?: number }
  | { type: 'rec-stop' }
  | { type: 'rec-cancel' };

/** Judge-mode voice recording: AAC (ADTS) mono 16 kHz — accepted by the server's /api/transcribe. */
const RECORDING: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.aac',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
  android: { extension: '.aac', outputFormat: 'aac_adts', audioEncoder: 'aac', sampleRate: 16000 },
};

/** Runs before the page's own scripts: tells the UI it is inside the app and where the backend is. */
const BOOT = `window.SG_NATIVE=true;window.SG_API_BASE=${JSON.stringify(API_URL)};true;`;

export default function GuardianWebView() {
  const web = useRef<InstanceType<typeof WebView>>(null);   /* React 19 typing for the class component */
  const [dark, setDark] = useState(true);
  const [bg, setBg] = useState('#1B1C1F');
  const [failed, setFailed] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const recorder = useAudioRecorder(RECORDING);
  const recState = useAudioRecorderState(recorder, 120);
  const cancelled = useRef(false);
  const source = uiSource();

  const run = useCallback((js: string) => web.current?.injectJavaScript(`${js};true;`), []);

  /* Android back button: the page decides (close a sheet, go home, or ask us to leave). */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      run('window.SGNative&&window.SGNative.back&&window.SGNative.back()');
      return true;
    });
    return () => sub.remove();
  }, [run]);

  /* live microphone level for the recorder sheet */
  useEffect(() => {
    if (!recState.isRecording || typeof recState.metering !== 'number') return;
    const level = Math.round(((recState.metering + 60) / 60) * 100);
    run(`window.SGNative.onLevel&&window.SGNative.onLevel(${level})`);
  }, [recState.isRecording, recState.metering, run]);

  const reply = useCallback(
    (payload: { b64?: string; mime?: string; error?: string }) =>
      run(`window.SGNative.onRecording&&window.SGNative.onRecording(${JSON.stringify(payload)})`),
    [run],
  );

  const startRecording = useCallback(async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) return reply({ error: 'denied' });
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      cancelled.current = false;
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: 30 });
    } catch (e) {
      reply({ error: e instanceof Error ? e.message : String(e) });
    }
  }, [recorder, reply]);

  const stopRecording = useCallback(
    async (discard: boolean) => {
      cancelled.current = discard;
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (discard) return;
        const uri = recorder.uri;
        if (!uri) return reply({ error: 'no recording' });
        const file = new File(uri);
        const b64 = await file.base64();
        reply({ b64, mime: 'audio/aac' });
        try { file.delete(); } catch { /* the cache file is removed by the OS anyway */ }
      } catch (e) {
        if (!discard) reply({ error: e instanceof Error ? e.message : String(e) });
      }
    },
    [recorder, reply],
  );

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: BridgeMessage;
      try { msg = JSON.parse(e.nativeEvent.data) as BridgeMessage; } catch { return; }
      switch (msg.type) {
        case 'vibrate':
          Vibration.vibrate([0, ...msg.pattern.filter(n => Number.isFinite(n) && n >= 0).slice(0, 10)]);
          break;
        case 'theme':
          setDark(msg.dark);
          if (msg.bg) { setBg(msg.bg); SystemUI.setBackgroundColorAsync(msg.bg).catch(() => {}); }
          break;
        case 'exit':
          BackHandler.exitApp();
          break;
        case 'rec-start':
          startRecording();
          break;
        case 'rec-stop':
          stopRecording(false);
          break;
        case 'rec-cancel':
          stopRecording(true);
          break;
      }
    },
    [startRecording, stopRecording],
  );

  /* Links to other sites (news sources) open in the browser; the app UI and the backend stay inside. */
  const onShouldStart = useCallback((req: ShouldStartLoadRequest) => {
    const u = req.url;
    if (u.startsWith('file://') || u.startsWith('about:') || u.startsWith('blob:') || u.startsWith('data:')) return true;
    if (API_URL && u.startsWith(API_URL)) return true;
    if (/^https?:/i.test(u)) { Linking.openURL(u).catch(() => {}); return false; }
    return false;
  }, []);

  if (!source) {
    return (
      <SafeAreaView style={[styles.fill, styles.center, { backgroundColor: '#0B3D91' }]}>
        <StatusBar style="light" />
        <Text style={styles.title}>Scam Guardian</Text>
        <Text style={styles.body}>
          Expo Go needs the AI server address. Start the server on your computer (HOST=0.0.0.0 node server.js) and
          run Expo with EXPO_PUBLIC_API_URL=http://YOUR-PC-IP:8787 — or use a development build, which bundles the app.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: bg }]} edges={['top', 'bottom']}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {failed ? (
        <View style={[styles.fill, styles.center]}>
          <Text style={[styles.title, { color: dark ? '#E9EAEC' : '#10151F' }]}>Scam Guardian</Text>
          <Text style={[styles.body, { color: dark ? '#B9C2D2' : '#3D4656' }]}>{failed}</Text>
          <Pressable style={styles.btn} onPress={() => { setFailed(null); setKey(k => k + 1); }}>
            <Text style={styles.btnText}>Yenidən cəhd et</Text>
          </Pressable>
        </View>
      ) : (
        <WebView
          key={key}
          ref={web}
          source={source}
          style={[styles.fill, { backgroundColor: bg }]}
          originWhitelist={['*']}
          injectedJavaScriptBeforeContentLoaded={BOOT}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={onShouldStart}
          onLoadEnd={() => SplashScreen.hideAsync().catch(() => {})}
          onError={(e: { nativeEvent: { description?: string } }) => { setFailed(e.nativeEvent.description || 'The app page could not be loaded.'); SplashScreen.hideAsync().catch(() => {}); }}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          mediaPlaybackRequiresUserAction={false}
          mixedContentMode="always"
          setSupportMultipleWindows={false}
          overScrollMode="never"
          textZoom={100}
          webviewDebuggingEnabled={__DEV__}
          bounces={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '700', marginBottom: 12 },
  body: { color: '#DCE6FA', fontSize: 16, lineHeight: 23, textAlign: 'center' },
  btn: { marginTop: 20, backgroundColor: '#0B3D91', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24 },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
