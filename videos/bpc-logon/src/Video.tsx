import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { Background } from './components/Background';
import { Captions } from './components/ui';
import { OVERLAP, SceneCtx, TIMELINE } from './timing';
import { SceneId } from './script';
import * as S from './scenes/Scenes';
import { loadFonts } from './theme';

loadFonts();

export type VideoProps = { contact: string; captions: boolean };

const view = (id: SceneId, p: VideoProps): React.ReactNode => {
  switch (id) {
    case 'intro': return <S.Intro />;
    case 'roadmap': return <S.Roadmap />;
    case 'course': return <S.Course />;
    case 'check': return <S.Check />;
    case 'request': return <S.Request />;
    case 'sysrole': return <S.SysRole />;
    case 'details': return <S.Details />;
    case 'install': return <S.Install />;
    case 'connections': return <S.Connections />;
    case 'launch': return <S.Launch />;
    case 'logon': return <S.Logon />;
    case 'evidence': return <S.Evidence contact={p.contact} />;
    case 'outro': return <S.Outro />;
  }
};

const TRANSITIONS = [
  () => slide({ direction: 'from-right' }),
  () => fade(),
  () => wipe({ direction: 'from-left' }),
  () => slide({ direction: 'from-bottom' }),
];

// Subtítulos y momentos con voz en tiempo absoluto
const ALL_SEGS = TIMELINE.flatMap((t) => t.segs.map((s) => ({ t: s.t, start: t.from + s.start, end: t.from + s.end })));

// Música: un solo nivel parejo debajo de toda la narración. Solo sube (suave) en la
// entrada del logo y en la despedida. Sin "ducking" frase por frase y sin loop.
const MUSIC_UNDER = 0.08, MUSIC_OPEN = 0.26;
const smooth = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const FIRST_VOICE = TIMELINE[0].from + TIMELINE[0].cues.voiceStart;
const LAST = TIMELINE[TIMELINE.length - 1];
const LAST_VOICE = LAST.from + LAST.cues.voiceEnd;
const END = LAST.from + LAST.frames;
export const musicVolume = (f: number) => {
  const down = smooth((f - (FIRST_VOICE - 50)) / 45);      // baja antes de la primera frase
  const up = smooth((f - (LAST_VOICE + 6)) / 45);          // sube al terminar la última
  const level = MUSIC_OPEN + (MUSIC_UNDER - MUSIC_OPEN) * down + (MUSIC_OPEN - MUSIC_UNDER) * up;
  return level * smooth(f / 30) * smooth((END - f) / 75);  // entrada y salida
};
const Music: React.FC = () => <Audio src={staticFile('sfx/music.wav')} volume={musicVolume} />;

export const Video: React.FC<VideoProps> = (props) => {
  const children: React.ReactNode[] = [];
  TIMELINE.forEach((t, i) => {
    if (i > 0) {
      children.push(<TransitionSeries.Transition key={'t' + i} presentation={TRANSITIONS[i % TRANSITIONS.length]() as any} timing={linearTiming({ durationInFrames: OVERLAP })} />);
    }
    children.push(
      <TransitionSeries.Sequence key={t.id} durationInFrames={t.frames}>
        <SceneCtx.Provider value={t}>
          <AbsoluteFill>{view(t.id, props)}</AbsoluteFill>
        </SceneCtx.Provider>
      </TransitionSeries.Sequence>,
    );
  });
  return (
    <AbsoluteFill style={{ background: '#06122E' }}>
      <Background />
      <TransitionSeries>{children}</TransitionSeries>
      {/* Voz: fuera de las transiciones para que nunca se recorte */}
      {TIMELINE.map((t) => (
        <Sequence key={'v' + t.id} from={t.from + t.cues.voiceStart} layout="none">
          <Audio src={staticFile(`voice/en-paced/${t.id}.mp3`)} />
        </Sequence>
      ))}
      <Music />
      {props.captions && <Captions segs={ALL_SEGS} />}
    </AbsoluteFill>
  );
};
