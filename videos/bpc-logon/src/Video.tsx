import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { Background } from './components/Background';
import { Captions } from './components/ui';
import { OVERLAP, SceneCtx, TIMELINE, voiceOffset } from './timing';
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

const Music: React.FC = () => {
  return (
    <Audio
      src={staticFile('sfx/music.wav')}
      loop
      volume={(f) => {
        const speaking = ALL_SEGS.some((s) => f >= s.start - 8 && f <= s.end + 8);
        const fadeIn = Math.min(1, f / 45);
        const last = TIMELINE[TIMELINE.length - 1];
        const fadeOut = Math.min(1, Math.max(0, (last.from + last.frames - f) / 60));
        return (speaking ? 0.07 : 0.16) * fadeIn * fadeOut;
      }}
    />
  );
};

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
        <Sequence key={'v' + t.id} from={t.from + voiceOffset(t.id)} layout="none">
          <Audio src={staticFile(`voice/en/${t.id}.mp3`)} />
        </Sequence>
      ))}
      <Music />
      {props.captions && <Captions segs={ALL_SEGS} />}
    </AbsoluteFill>
  );
};
