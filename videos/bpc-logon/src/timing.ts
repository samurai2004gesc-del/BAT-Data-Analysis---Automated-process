import { createContext, useContext } from 'react';
import { SCENES, SceneId } from './script';
import voice from './voice/en.json';
import { FPS } from './theme';

export const LEAD = 20;      // cuadros antes de que empiece la voz
export const TAIL = 45;      // cuadros después de que termina
export const OVERLAP = 18;   // duración de la transición entre escenas

type VSeg = { t: string; cue: string | null; start: number; end: number };
type VScene = { duration: number; segs: VSeg[] };
const V = voice as unknown as Record<SceneId, VScene>;

export type SceneTiming = {
  id: SceneId;
  from: number;        // cuadro absoluto donde empieza la escena
  frames: number;      // duración de la escena
  cues: Record<string, number>; // cuadro (relativo a la escena) de cada cue
  segs: { t: string; start: number; end: number }[]; // relativos a la escena, en cuadros
  pieces: VoicePiece[]; // pedazos de la voz con su posición en la escena
};

const sec = (s: number) => Math.round(s * FPS);

export const EXTRA: Partial<Record<SceneId, number>> = { intro: 40, evidence: 20, outro: 75 };

// Pausas extra entre frases (en cuadros) para que el video vaya más tranquilo.
// La voz se corta en el silencio entre segmentos y cada pedazo se recorre.
export const GAP_SENTENCE = 16;
export const GAP_COMMA = 7;

export type VoicePiece = { from: number; trimBefore: number; trimAfter: number };

export const TIMELINE: SceneTiming[] = (() => {
  let from = 0;
  return SCENES.map((id) => {
    const v = V[id];
    const pre = id === 'intro' ? 40 : 0; // el logo entra antes de la voz
    // Puntos de corte: a la mitad del silencio entre un segmento y el siguiente
    const cuts = v.segs.map((s, i) => (i === 0 ? 0 : (v.segs[i - 1].end + s.start) / 2));
    let extra = 0;
    const shift: number[] = [];
    const pieces: VoicePiece[] = [];
    v.segs.forEach((s, i) => {
      if (i > 0) extra += /[,:]$/.test(v.segs[i - 1].t.trim()) ? GAP_COMMA : GAP_SENTENCE;
      shift.push(extra);
      const a = sec(cuts[i]), b = i < v.segs.length - 1 ? sec(cuts[i + 1]) : sec(v.duration) + 6;
      pieces.push({ from: pre + LEAD + a + extra, trimBefore: a, trimAfter: b });
    });
    const voiceLen = sec(v.duration) + extra;
    const frames = LEAD + voiceLen + TAIL + (EXTRA[id] || 0);
    const cues: Record<string, number> = { start: 0 };
    const segs = v.segs.map((s, i) => {
      const a = pre + LEAD + sec(s.start) + shift[i], b = pre + LEAD + sec(s.end) + shift[i];
      if (s.cue) cues[s.cue] = a;
      return { t: s.t, start: a, end: b };
    });
    cues.voiceStart = pre + LEAD;
    cues.voiceEnd = pre + LEAD + voiceLen;
    cues.end = frames;
    const t: SceneTiming = { id, from, frames, cues, segs, pieces };
    from += frames - OVERLAP;
    return t;
  });
})();

export const TOTAL = (() => { const l = TIMELINE[TIMELINE.length - 1]; return l.from + l.frames; })();

export const SceneCtx = createContext<SceneTiming>(TIMELINE[0]);
export const useScene = () => useContext(SceneCtx);
/** Cuadro (relativo a la escena) de un cue. */
export const useCue = () => {
  const s = useScene();
  return (name: string, offset = 0) => {
    if (!(name in s.cues)) throw new Error(`Cue "${name}" no existe en ${s.id}`);
    return s.cues[name] + offset;
  };
};
export const voiceOffset = (id: SceneId) => (id === 'intro' ? 40 : 0) + LEAD;
