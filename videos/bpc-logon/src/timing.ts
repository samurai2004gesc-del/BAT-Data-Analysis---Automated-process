import { createContext, useContext } from 'react';
import { SCENES, SceneId } from './script';
import voice from './voice/en.json';
import { FPS } from './theme';

export const LEAD = 14;      // cuadros antes de que empiece la voz
export const TAIL = 26;      // cuadros después de que termina
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
};

const sec = (s: number) => Math.round(s * FPS);

export const EXTRA: Partial<Record<SceneId, number>> = { intro: 40, evidence: 20, outro: 75 };

export const TIMELINE: SceneTiming[] = (() => {
  let from = 0;
  return SCENES.map((id) => {
    const v = V[id];
    const frames = LEAD + sec(v.duration) + TAIL + (EXTRA[id] || 0);
    const pre = id === 'intro' ? 40 : 0; // el logo entra antes de la voz
    const cues: Record<string, number> = { start: 0 };
    const segs = v.segs.map((s) => {
      const a = pre + LEAD + sec(s.start), b = pre + LEAD + sec(s.end);
      if (s.cue) cues[s.cue] = a;
      return { t: s.t, start: a, end: b };
    });
    cues.voiceStart = pre + LEAD;
    cues.voiceEnd = pre + LEAD + sec(v.duration);
    cues.end = frames;
    const t: SceneTiming = { id, from, frames, cues, segs };
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
