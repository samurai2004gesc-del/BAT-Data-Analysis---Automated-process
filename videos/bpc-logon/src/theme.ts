import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

export const C = {
  navy: '#0B1F4D',
  deep: '#06122E',
  ink: '#0E2A62',
  blue: '#0057B8',
  cyan: '#00B1EB',
  sky: '#7FD8F7',
  white: '#FFFFFF',
  soft: '#C9D6EE',
  muted: '#8EA3C8',
  green: '#3DDC97',
  yellow: '#FDB913',
  orange: '#F08100',
  magenta: '#E6007E',
  purple: '#6B3FA0',
  lime: '#A4C639',
  bar: ['#0057B8', '#00B1EB', '#F08100', '#FDB913', '#50B848', '#A4C639', '#5C2D91', '#E6007E'],
};

export const FONT = 'Montserrat, Arial, sans-serif';
export const MONO = '"JetBrains Mono", Consolas, monospace';

let loaded = false;
export function loadFonts() {
  if (loaded) return;
  loaded = true;
  for (const w of ['400', '500', '600', '700', '800', '900']) {
    loadFont({ family: 'Montserrat', url: staticFile(`fonts/montserrat-latin-${w}-normal.woff2`), weight: w });
  }
  loadFont({ family: 'JetBrains Mono', url: staticFile('fonts/jetbrains-mono-latin-500-normal.woff2'), weight: '500' });
}

export const FPS = 30;
export const W = 1920;
export const H = 1080;
