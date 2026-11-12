import React from 'react';
import { Composition } from 'remotion';
import { Video, VideoProps } from './Video';
import { TOTAL } from './timing';
import { FPS, H, W } from './theme';

// Cambia "contact" por tu nombre o correo para que aparezca en la escena final.
const defaults: VideoProps = { contact: 'HRSS Team - samuel_gonzalez_external@bat.com', captions: true };

export const Root: React.FC = () => (
  <>
    <Composition id="BpcLogon" component={Video} durationInFrames={TOTAL} fps={FPS} width={W} height={H} defaultProps={defaults} />
  </>
);
