import GuardianWebView from '@/components/GuardianWebView';

/** The whole Scam Guardian UI (home, keypad, calls, check, lab, history, settings) — the same screens as
 *  the web prototype, rendered from the files bundled in the APK. Native features live in the bridge. */
export default function Index() {
  return <GuardianWebView />;
}
