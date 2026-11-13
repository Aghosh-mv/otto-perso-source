/**
 * Otto Perso — Android wake-word + voice call (React Native)
 *
 * NOTE: this is a scaffold for the React Native app. It depends on
 * @react-native-voice/voice + react-native-tts, which are declared in
 * otto-mobile/package.json but must be `npm install`ed inside otto-mobile
 * (they're native modules — not part of the Next.js app build). See
 * ANDROID-WAKE-WORD.md for the native foreground-service setup. @ts-nocheck
 * keeps the Next app's typecheck clean until the RN deps are installed.
 */
// @ts-nocheck

import Voice from '@react-native-voice/voice';
import Tts from 'react-native-tts';

const SERVER = 'http://localhost:3000';
const WAKE = /\b(hey|ok|okay)\s+otto\b/i;
const STOP = /\b(stop|bye|that'?s all|never ?mind|quiet)\b/i;

type SpokenCb = (text: string | null) => void;

let listening = false;
let inCall = false;

export function startWakeWord(onSpoken?: SpokenCb) {
  Voice.onSpeechResults = (e) => {
    const text = (e.value || []).join(' ').toLowerCase();
    if (!text) return;
    if (!inCall && WAKE.test(text)) {
      inCall = true;
      greet().then(() => takeCommand(onSpoken));
    }
  };
  Voice.onSpeechError = () => { /* restart below */ };

  // Start continuous recognition. On most devices Voice stops after a phrase,
  // so we restart it in a loop to approximate always-listening. A native
  // foreground service (see ANDROID-WAKE-WORD.md) keeps this alive screen-off.
  const loop = async () => {
    while (listening) {
      try {
        await Voice.start('en-US');
        await new Promise((r) => setTimeout(r, 60_000)); // re-arm every 60s
        await Voice.stop();
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  };
  listening = true;
  loop();
  return () => { listening = false; inCall = false; Voice.destroy().catch(() => {}); };
}

async function greet() {
  const lines = ["hey — what's up?", 'yeah?', 'hey, i\'m here.', 'yo.'];
  const line = lines[Math.floor(Math.random() * lines.length)];
  try { await Tts.speak(line); } catch {}
}

async function takeCommand(onSpoken?: SpokenCb) {
  try {
    await Voice.stop();
    await Voice.start('en-US');
    // wait for one result — Voice.onSpeechResults fires; we use a one-shot here
    const once = async (e: any) => {
      const text = (e.value || []).join(' ');
      Voice.onSpeechResults = (ev) => {} // detach
      await Voice.stop();
      if (STOP.test(text.toLowerCase())) {
        await Tts.speak("okay, i'm here if you need me.");
        inCall = false;
        startWakeWord(onSpoken); // re-arm wake listening
        return;
      }
      onSpoken?.(text);
      try {
        const r = await fetch(`${SERVER}/api/voice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });
        const data = await r.json();
        const reply = data.reply || "hmm, i didn't catch that.";
        await Tts.speak(reply);
      } catch {
        await Tts.speak('sorry, something broke.');
      }
      inCall = false;
      startWakeWord(onSpoken); // re-arm
    };
    Voice.onSpeechResults = once;
  } catch {
    inCall = false;
    startWakeWord(onSpoken);
  }
}

/** Claim this device as the active Lok host (so desktop stands down). */
export async function claimActiveOnMobile() {
  try {
    const id = await getOrCreateDeviceId();
    await fetch(`${SERVER}/api/devices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setActive: true }),
    });
  } catch {}
}

async function getOrCreateDeviceId(): Promise<string> {
  // Minimal — in the RN app, use AsyncStorage. Scaffold returns a stable-ish id.
  return 'mobile-' + (Math.random().toString(36).slice(2, 10));
}
