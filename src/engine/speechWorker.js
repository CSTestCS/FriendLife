// Built-in speech synthesizer (eSpeak via meSpeak, GPL) running in a Web
// Worker so rendering never stalls the game. Bundled to dist/speech.js.
// Also works as a plain <script> (fallback when workers are unavailable):
// it then exposes self.FriendLifeSpeech.render(jobs).
import meSpeak from 'mespeak';
import config from 'mespeak/src/mespeak_config.json';
import en from 'mespeak/voices/en/en.json';
import enUs from 'mespeak/voices/en/en-us.json';
import enN from 'mespeak/voices/en/en-n.json';
import enRp from 'mespeak/voices/en/en-rp.json';
import enSc from 'mespeak/voices/en/en-sc.json';
import enWm from 'mespeak/voices/en/en-wm.json';

const ACCENTS = { 'en-us': enUs, en, 'en-n': enN, 'en-rp': enRp, 'en-sc': enSc, 'en-wm': enWm };
const loaded = new Set();
let ready = false;
let calls = 0;

function init() {
  if (ready) return;
  meSpeak.loadConfig(config);
  meSpeak.loadVoice(enUs);
  loaded.add('en-us');
  ready = true;
}

/** jobs: [{text, pitch(0-99), speed(80-450), variant, accent, amplitude}] → [{samples:Int16Array, sampleRate}] */
function render(jobs) {
  init();
  return jobs.map((j) => {
    const accent = ACCENTS[j.accent] ? j.accent : 'en-us';
    if (!loaded.has(accent)) { meSpeak.loadVoice(ACCENTS[accent]); loaded.add(accent); }
    let bytes = null;
    const say = () => meSpeak.speak(String(j.text || '').slice(0, 400), {
        rawdata: 'array',
        voice: ACCENTS[accent].voice_id,
        pitch: Math.round(Math.max(0, Math.min(99, j.pitch ?? 50))),
        speed: Math.round(Math.max(80, Math.min(450, j.speed ?? 175))),
        amplitude: Math.round(j.amplitude ?? 100),
        variant: j.variant || undefined,
        wordgap: j.wordgap || 0,
      });
    // the engine leaks internally and breaks after ~80 calls: restart it before that
    if (++calls % 50 === 0) meSpeak.reboot?.();
    try {
      bytes = say();
    } catch (e) {
      try { meSpeak.reboot?.(); bytes = say(); } catch { bytes = null; }
    }
    if (!bytes || bytes.length < 46) return { samples: new Int16Array(0), sampleRate: 22050 };
    const sampleRate = bytes[24] | (bytes[25] << 8) | (bytes[26] << 16);
    const n = (bytes.length - 44) >> 1;
    const samples = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const lo = bytes[44 + i * 2];
      const hi = bytes[45 + i * 2];
      samples[i] = (hi << 8) | lo;
    }
    return { samples, sampleRate: sampleRate || 22050 };
  });
}

const isWorker = typeof document === 'undefined' && typeof self !== 'undefined' && typeof self.postMessage === 'function';
if (isWorker) {
  self.onmessage = (e) => {
    const { id, jobs } = e.data || {};
    let out;
    try { out = render(jobs || []); } catch (err) { self.postMessage({ id, error: String(err?.message || err) }); return; }
    self.postMessage({ id, results: out }, out.map((r) => r.samples.buffer));
  };
} else if (typeof self !== 'undefined') {
  self.FriendLifeSpeech = { render };
}
