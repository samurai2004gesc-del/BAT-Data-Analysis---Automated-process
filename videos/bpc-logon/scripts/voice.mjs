// Genera la narración con ElevenLabs (text-to-speech con marcas de tiempo).
// Uso: node --experimental-strip-types scripts/voice.mjs [es|en] [escena...]
// La API key la pone el proxy de la sesión (o define ELEVENLABS_API_KEY en tu equipo).
// Salida: public/voice/<lang>/<escena>.mp3 y src/voice/<lang>.json (duración y tiempo de cada segmento).
// Solo vuelve a pedir el audio si cambió el texto (cache por hash) para no gastar créditos.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SCRIPT, SCENES, VOICES, speak } from '../src/script.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const KEY = process.env.ELEVENLABS_API_KEY || 'proxy-injected';
const MODEL = 'eleven_multilingual_v2';
const langs = process.argv[2] ? [process.argv[2]] : ['en'];
const only = process.argv.slice(3);

const settings = { stability: 0.5, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 0.9 };

async function tts(lang, text, prev, next) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICES[lang].id}/with-timestamps?output_format=mp3_44100_128`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: settings, previous_text: prev, next_text: next }),
    });
    if (r.ok) return r.json();
    const body = await r.text();
    if (r.status >= 500 || r.status === 429) { await new Promise((s) => setTimeout(s, 2000 * attempt)); continue; }
    throw new Error(`ElevenLabs ${r.status}: ${body.slice(0, 300)}`);
  }
  throw new Error('ElevenLabs: demasiados reintentos');
}

for (const lang of langs) {
  const jsonPath = path.join(ROOT, 'src', 'voice', lang + '.json');
  const data = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')) : {};
  fs.mkdirSync(path.join(ROOT, 'public', 'voice', lang), { recursive: true });
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  const said = (s) => speak(s.say || s.t);
  const spoken = (id) => SCRIPT[lang][id].map(said).join(' ');
  for (let i = 0; i < SCENES.length; i++) {
    const id = SCENES[i];
    if (only.length && !only.includes(id)) continue;
    const segs = SCRIPT[lang][id];
    const text = spoken(id);
    const hash = crypto.createHash('sha1').update(VOICES[lang].id + MODEL + JSON.stringify(settings) + text).digest('hex').slice(0, 12);
    const mp3 = path.join(ROOT, 'public', 'voice', lang, id + '.mp3');
    if (data[id] && data[id].hash === hash && fs.existsSync(mp3)) { console.log(lang, id, 'sin cambios'); continue; }
    const res = await tts(lang, text, i > 0 ? spoken(SCENES[i - 1]) : undefined, i < SCENES.length - 1 ? spoken(SCENES[i + 1]) : undefined);
    fs.writeFileSync(mp3, Buffer.from(res.audio_base64, 'base64'));
    const al = res.alignment;
    const starts = al.character_start_times_seconds, ends = al.character_end_times_seconds;
    // Inicio de cada segmento: posición de su primer carácter en el texto hablado
    let pos = 0;
    const out = segs.map((s) => {
      const sp = said(s);
      const a = pos, b = pos + sp.length - 1;
      pos += sp.length + 1;
      return { t: s.t, cue: s.cue || null, start: +starts[Math.min(a, starts.length - 1)].toFixed(3), end: +ends[Math.min(b, ends.length - 1)].toFixed(3) };
    });
    const duration = ends[ends.length - 1];
    data[id] = { hash, duration: +duration.toFixed(3), segs: out };
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    console.log(lang, id, duration.toFixed(1) + ' s', text.length, 'caracteres');
  }
}
