// Renderiza cuadros sueltos para revisar: node scripts/stills.mjs <salida> <frame,frame,...>
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';

const [out, list] = process.argv.slice(2);
const frames = list.split(',').map(Number);
fs.mkdirSync(out, { recursive: true });
const shell = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const browserExecutable = fs.existsSync(shell) ? shell : null;
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const comp = await selectComposition({ serveUrl, id: 'BpcLogon', browserExecutable });
console.log('total frames', comp.durationInFrames);
for (const frame of frames) {
  await renderStill({ serveUrl, composition: comp, frame, output: path.join(out, `f${String(frame).padStart(5, '0')}.jpg`), imageFormat: 'jpeg', jpegQuality: 80, scale: 0.5, browserExecutable });
}
console.log('ok');
