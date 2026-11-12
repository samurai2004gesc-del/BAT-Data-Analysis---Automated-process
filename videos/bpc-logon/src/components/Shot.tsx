import React from 'react';
import { Audio, Easing, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import shots from '../shots.json';
import { C, FONT } from '../theme';

type ShotName = keyof typeof shots;
export type Box = [number, number, number, number];

/** Convierte coordenadas de la diapositiva original (x1,y1,x2,y2) a píxeles de la captura recortada. */
export const sb = (name: ShotName, x1: number, y1: number, x2: number, y2: number): Box => {
  const m = shots[name];
  return [(x1 - m.ox) * m.scale, (y1 - m.oy) * m.scale, (x2 - x1) * m.scale, (y2 - y1) * m.scale];
};

export type Focus = {
  at: number;          // cuadro (relativo al Shot) en que se enfoca
  box?: Box;           // zona a resaltar (px de la imagen); sin box = vista completa
  zoom?: number;       // forzar zoom
  click?: boolean;     // mueve el cursor y hace clic
  label?: string;      // etiqueta junto a la zona
  labelSide?: 'top' | 'bottom' | 'left' | 'right';
  spot?: boolean;      // oscurecer el resto (por defecto sí)
  type?: string;       // texto que se "escribe" dentro de la zona
};

export const Sfx: React.FC<{ at: number; src: string; volume?: number }> = ({ at, src, volume = 0.5 }) => (
  <Sequence from={Math.max(0, Math.round(at))} durationInFrames={60} layout="none">
    <Audio src={staticFile(`sfx/${src}.wav`)} volume={volume} />
  </Sequence>
);

/**
 * Captura de pantalla en una ventana flotante con "cámara virtual":
 * acerca la vista a cada zona, la resalta, mueve el cursor y hace clic.
 */
export const Shot: React.FC<{
  name: ShotName; focus?: Focus[]; maxW?: number; maxH?: number; title?: string; tilt?: number; children?: React.ReactNode;
}> = ({ name, focus = [], maxW = 1420, maxH = 700, title, tilt = 1, children }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const m = shots[name];
  const scale = Math.min(maxW / m.w, maxH / m.h);
  const W = m.w * scale, H = m.h * scale;

  // Cámara: transforma para que la zona enfocada quede al centro y más grande
  const cam = (fo?: Focus) => {
    if (!fo || !fo.box) return { s: 1, x: 0, y: 0 };
    const [bx, by, bw, bh] = fo.box.map((v) => v * scale);
    const auto = Math.min((W * 0.42) / bw, (H * 0.5) / bh);
    // Nunca acercar tanto que la zona se salga de la ventana
    const s = Math.max(1, Math.min(fo.zoom ?? auto, 2.3, (W * 0.94) / bw, (H * 0.9) / bh));
    const cx = bx + bw / 2, cy = by + bh / 2;
    const x = Math.min(0, Math.max(W - W * s, W / 2 - cx * s));
    const y = Math.min(0, Math.max(H - H * s, H / 2 - cy * s));
    return { s, x, y };
  };
  const idx = focus.reduce((acc, fo, i) => (fo.at <= f ? i : acc), -1);
  const cur = idx >= 0 ? focus[idx] : undefined;
  const prev = idx > 0 ? focus[idx - 1] : undefined;
  const p = cur ? spring({ frame: f - cur.at, fps, config: { damping: 200 }, durationInFrames: 26 }) : 0;
  const a = cam(prev), b = cam(cur);
  const s = a.s + (b.s - a.s) * p, x = a.x + (b.x - a.x) * p, y = a.y + (b.y - a.y) * p;

  // Posición de una zona en pantalla (después de la cámara final de ese foco)
  const onScreen = (fo: Focus) => {
    const c = cam(fo);
    const [bx, by, bw, bh] = fo.box!.map((v) => v * scale);
    return { x: c.x + bx * c.s, y: c.y + by * c.s, w: bw * c.s, h: bh * c.s };
  };

  // Entrada 3D
  const enter = spring({ frame: f, fps, config: { damping: 18, mass: 0.8 } });
  const rotX = interpolate(enter, [0, 1], [24, 0]) + Math.sin(f / 40) * 1.2 * tilt;
  const rotY = interpolate(enter, [0, 1], [-14, 0]) + Math.cos(f / 50) * 1.6 * tilt;
  const lift = interpolate(enter, [0, 1], [120, 0]);

  // Cursor: viaja entre zonas con clic
  const clicks = focus.filter((fo) => fo.click && fo.box);
  let cursor: { x: number; y: number; o: number; press: number } | null = null;
  if (clicks.length) {
    const ci = clicks.reduce((acc, fo, i) => (fo.at <= f ? i : acc), -1);
    const target = clicks[Math.max(0, ci)];
    const from = ci > 0 ? clicks[ci - 1] : null;
    const r1 = onScreen(target);
    const t1 = { x: r1.x + r1.w * 0.55, y: r1.y + r1.h * 0.6 };
    const t0 = from ? (() => { const r0 = onScreen(from); return { x: r0.x + r0.w * 0.55, y: r0.y + r0.h * 0.6 }; })() : { x: W * 0.8, y: H * 1.05 };
    const travel = interpolate(f, [target.at, target.at + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.6, 0, 0.2, 1) });
    const ci0 = ci < 0 ? 0 : 1;
    const cx = t0.x + (t1.x - t0.x) * travel * ci0, cy = t0.y + (t1.y - t0.y) * travel * ci0;
    const press = interpolate(f - target.at, [16, 19, 23], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    cursor = { x: ci < 0 ? t0.x : cx, y: ci < 0 ? t0.y : cy, o: interpolate(f, [clicks[0].at - 10, clicks[0].at], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), press };
  }

  return (
    <div style={{ perspective: 2200, display: 'flex', justifyContent: 'center' }}>
      <div style={{
        transform: `translateY(${lift}px) rotateX(${rotX}deg) rotateY(${rotY}deg)`, opacity: enter,
        borderRadius: 18, background: 'rgba(255,255,255,0.08)', padding: 10, paddingTop: 0,
        boxShadow: '0 40px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.18), 0 0 80px rgba(0,177,235,0.25)',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ height: 34, display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px' }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <div key={c} style={{ width: 11, height: 11, borderRadius: 6, background: c, opacity: 0.85 }} />)}
          {title && <div style={{ marginLeft: 12, color: C.soft, fontFamily: FONT, fontSize: 15, fontWeight: 600, letterSpacing: 0.3 }}>{title}</div>}
        </div>
        <div style={{ position: 'relative', width: W, height: H, overflow: 'hidden', borderRadius: 10, background: '#fff' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', transform: `translate(${x}px, ${y}px) scale(${s})` }}>
            <Img src={staticFile(`shots/${name}.png`)} style={{ width: W, height: H, display: 'block' }} />
          </div>
          {/* Spotlight + anillo */}
          {cur && cur.box && cur.spot !== false && (() => {
            const r = onScreen(cur);
            const o = interpolate(f - cur.at, [8, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const pulse = (f - cur.at - 22) % 40;
            const pr = interpolate(pulse, [0, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const pad = 8;
            return (
              <>
                <div style={{ position: 'absolute', left: r.x - pad, top: r.y - pad, width: r.w + pad * 2, height: r.h + pad * 2, borderRadius: 12, boxShadow: `0 0 0 4000px rgba(4,14,40,${0.5 * o})`, border: `3px solid rgba(0,177,235,${o})`, filter: `drop-shadow(0 0 14px rgba(0,177,235,${0.9 * o}))` }} />
                {f - cur.at > 22 && <div style={{ position: 'absolute', left: r.x - pad - pr * 18, top: r.y - pad - pr * 18, width: r.w + pad * 2 + pr * 36, height: r.h + pad * 2 + pr * 36, borderRadius: 14 + pr * 10, border: `2px solid rgba(127,216,247,${(1 - pr) * 0.8})` }} />}
                {cur.type && <Typing text={cur.type} start={cur.at + 18} r={r} />}
                {cur.label && <Label text={cur.label} r={r} side={cur.labelSide || 'bottom'} o={o} W={W} H={H} />}
              </>
            );
          })()}
          {cursor && (
            <div style={{ position: 'absolute', left: cursor.x, top: cursor.y, opacity: cursor.o, transform: `scale(${1 - cursor.press * 0.15})`, transformOrigin: '0 0' }}>
              {cursor.press > 0 && <div style={{ position: 'absolute', left: -30 * (1 + cursor.press), top: -30 * (1 + cursor.press), width: 60 * (1 + cursor.press), height: 60 * (1 + cursor.press), borderRadius: '50%', background: `rgba(0,177,235,${0.35 * cursor.press})` }} />}
              <svg width="34" height="40" viewBox="0 0 24 28" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.45))' }}>
                <path d="M2 2 L2 22 L7.5 17 L11 25 L14.5 23.5 L11 15.8 L18.5 15.8 Z" fill="#fff" stroke="#0B1F4D" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </div>
          )}
          {children}
        </div>
      </div>
      {clicks.map((fo, i) => <Sfx key={i} at={fo.at + 18} src="click" volume={0.45} />)}
    </div>
  );
};

const Typing: React.FC<{ text: string; start: number; r: { x: number; y: number; w: number; h: number } }> = ({ text, start, r }) => {
  const f = useCurrentFrame();
  const n = Math.max(0, Math.min(text.length, Math.floor((f - start) * 0.9)));
  if (f < start) return null;
  const caret = Math.floor(f / 8) % 2 === 0 ? '|' : '';
  return (
    <div style={{ position: 'absolute', left: r.x + 4, top: r.y + 2, width: r.w - 8, height: r.h - 4, background: '#fff', display: 'flex', alignItems: 'center', paddingLeft: 8, fontFamily: 'Arial', fontSize: Math.min(r.h * 0.55, 26), color: '#111', overflow: 'hidden', whiteSpace: 'nowrap' }}>
      {text.slice(0, n)}<span style={{ color: C.blue }}>{caret}</span>
    </div>
  );
};

const Label: React.FC<{ text: string; r: { x: number; y: number; w: number; h: number }; side: string; o: number; W: number; H: number }> = ({ text, r, side, o, W, H }) => {
  const style: React.CSSProperties = { position: 'absolute', opacity: o, whiteSpace: 'nowrap', background: `linear-gradient(135deg, ${C.cyan}, ${C.blue})`, color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 24, padding: '10px 18px', borderRadius: 999, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' };
  const gap = 22;
  if (side === 'bottom') Object.assign(style, { left: Math.min(Math.max(10, r.x), W - 420), top: Math.min(r.y + r.h + gap, H - 60) });
  if (side === 'top') Object.assign(style, { left: Math.min(Math.max(10, r.x), W - 420), top: Math.max(10, r.y - gap - 50) });
  if (side === 'right') Object.assign(style, { left: Math.min(r.x + r.w + gap, W - 380), top: r.y + r.h / 2 - 25 });
  if (side === 'left') Object.assign(style, { right: W - r.x + gap, top: r.y + r.h / 2 - 25 });
  return <div style={style}>{text}</div>;
};
