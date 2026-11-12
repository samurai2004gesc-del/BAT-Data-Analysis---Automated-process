import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, MONO } from '../theme';
import { ChevronDown, CircleCheck, Download, FolderOpen } from 'lucide-react';
import { Sfx } from './Shot';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const SAP = 'Arial, Helvetica, sans-serif';

/** Ventana flotante para las recreaciones (mismo estilo que las capturas). */
export const MockWindow: React.FC<{ w: number; h: number; title?: string; children: React.ReactNode; bg?: string }> = ({ w, h, title, children, bg = '#fff' }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame: f, fps, config: { damping: 18, mass: 0.8 } });
  return (
    <div style={{ perspective: 2200, display: 'flex', justifyContent: 'center' }}>
      <div style={{ transform: `translateY(${(1 - e) * 120}px) rotateX(${(1 - e) * 24 + Math.sin(f / 40) * 1.2}deg) rotateY(${(1 - e) * -14 + Math.cos(f / 50) * 1.6}deg)`, opacity: e, borderRadius: 18, background: 'rgba(255,255,255,0.08)', padding: 10, paddingTop: 0, boxShadow: '0 40px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.18), 0 0 80px rgba(0,177,235,0.25)' }}>
        <div style={{ height: 34, display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px' }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <div key={c} style={{ width: 11, height: 11, borderRadius: 6, background: c, opacity: 0.85 }} />)}
          {title && <div style={{ marginLeft: 12, color: C.soft, fontFamily: FONT, fontSize: 15, fontWeight: 600 }}>{title}</div>}
        </div>
        <div style={{ position: 'relative', width: w, height: h, overflow: 'hidden', borderRadius: 10, background: bg }}>{children}</div>
      </div>
    </div>
  );
};

/** Texto que se escribe letra por letra. */
export const TypeText: React.FC<{ text: string; at: number; speed?: number; caret?: boolean; sound?: boolean }> = ({ text, at, speed = 1, caret = true, sound = true }) => {
  const f = useCurrentFrame();
  const n = Math.max(0, Math.min(text.length, Math.floor((f - at) * speed)));
  const typing = f >= at && n < text.length;
  return (
    <>
      {text.slice(0, n)}
      {caret && f >= at && (typing || Math.floor(f / 10) % 2 === 0) && n < text.length + 1 && <span style={{ color: C.blue, fontWeight: 400 }}>|</span>}
      {sound && Array.from({ length: Math.ceil(text.length / speed / 3) }).map((_, i) => <Sfx key={i} at={at + i * 3} src="key" volume={0.18} />)}
    </>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode; hi?: number; w?: number }> = ({ label, children, hi = 0, w = 300 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '10px 0' }}>
    <div style={{ width: 210, textAlign: 'right', fontFamily: SAP, fontSize: 22, color: '#32363a' }}><span style={{ color: '#bb0000' }}>* </span>{label}:</div>
    <div style={{ width: w, height: 40, border: `2px solid ${hi > 0 ? C.cyan : '#89919a'}`, boxShadow: hi > 0 ? `0 0 0 ${4 * hi}px rgba(0,177,235,0.3)` : 'none', borderRadius: 4, display: 'flex', alignItems: 'center', padding: '0 10px', fontFamily: SAP, fontSize: 21, color: '#111', background: '#fff' }}>{children}</div>
  </div>
);

/** IDLookup de NEO con datos ficticios. */
export const IdLookup: React.FC<{ type: number; search: number; p52: number }> = ({ type, search, p52 }) => {
  const f = useCurrentFrame();
  const press = interpolate(f - search, [0, 3, 7], [0, 1, 0], clamp);
  const rows = interpolate(f - search, [8, 20], [0, 1], clamp);
  const hl = interpolate(f - p52, [0, 12], [0, 1], clamp);
  const cell: React.CSSProperties = { border: '1px solid #9aa', padding: '8px 12px', fontFamily: SAP, fontSize: 20 };
  return (
    <MockWindow w={1300} h={640} title="NEO · OneID Lookup">
      <div style={{ background: 'linear-gradient(180deg,#9cc4e4,#6fa3d1)', color: '#fff', fontFamily: SAP, fontWeight: 700, fontSize: 28, padding: '10px 18px' }}>OneID Lookup</div>
      <div style={{ padding: '14px 22px', fontFamily: SAP, fontSize: 20, color: '#222' }}>This application is used to check OneID details</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '6px 22px' }}>
        <div style={{ fontFamily: SAP, fontSize: 20, paddingTop: 8 }}>Enter the search details</div>
        <div style={{ width: 300, height: 90, border: `2px solid ${f >= type ? C.cyan : '#888'}`, fontFamily: SAP, fontSize: 22, padding: 8 }}><TypeText text="Your Name" at={type + 6} speed={0.6} /></div>
        <div style={{ padding: '8px 16px', border: '1px solid #6a8db5', borderRadius: 4, background: press ? '#cfe3f7' : '#eaf3fc', fontFamily: SAP, fontSize: 20, color: '#16365c', transform: `scale(${1 - press * 0.06})`, boxShadow: f >= search - 10 && f < search + 10 ? `0 0 0 4px ${C.cyan}` : 'none' }}>Bulk Search</div>
      </div>
      <table style={{ margin: '18px 22px', borderCollapse: 'collapse', opacity: rows, transform: `translateY(${(1 - rows) * 20}px)` }}>
        <thead><tr style={{ background: '#d8d8d8' }}>{['cn', 'mail', 'displayName', 'msDS-userAccountDisabled', 'bat-sapRoles-P52'].map((h) => <th key={h} style={{ ...cell, fontWeight: 700, background: h === 'bat-sapRoles-P52' && hl ? `rgba(61,220,151,${0.6 * hl})` : undefined }}>{h}</th>)}</tr></thead>
        <tbody><tr style={{ background: '#eee' }}>
          <td style={{ ...cell, color: C.blue, textDecoration: 'underline' }}>12345678</td>
          <td style={cell}>your_name@bat.com</td>
          <td style={cell}>Your Name</td>
          <td style={cell}>FALSE</td>
          <td style={{ ...cell, fontSize: 17, lineHeight: 1.5, background: hl ? `rgba(61,220,151,${0.25 * hl})` : undefined }}>ZBPC_HDCT_HR_BP_MA_C00MMX_W<br />ZBPC_HDCT_HR_BP_MA_C00MCO_W<br />ZGLOBGALLADS_STANDARD_USER_A</td>
        </tr></tbody>
      </table>
      <Sfx at={search + 3} src="click" volume={0.45} />
    </MockWindow>
  );
};

/** Formulario "Access Request Creation" con datos ficticios. */
export const RequestForm: React.FC<{ desc: number; fields: number; area: number }> = ({ desc, fields, area }) => {
  const f = useCurrentFrame();
  const hi = (a: number, b: number) => interpolate(f, [a, a + 6, b, b + 6], [0, 1, 1, 0], clamp);
  const pick = (at: number, v: string) => (f >= at + 10 ? v : '');
  return (
    <MockWindow w={1500} h={430} title="NEO · Access Request Creation">
      <div style={{ display: 'flex', fontFamily: SAP, color: '#32363a' }}>
        <div style={{ flex: 1.1, padding: 26 }}>
          <div style={{ fontSize: 24, fontWeight: 700, borderBottom: '2px solid #ccc', paddingBottom: 8 }}>Reason for Request</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 20 }}>
            <div style={{ fontSize: 22, width: 140, textAlign: 'right' }}><span style={{ color: '#bb0000' }}>* </span>Description:</div>
            <div style={{ width: 520, height: 240, border: `2px solid ${f >= desc ? C.cyan : '#89919a'}`, boxShadow: f >= desc && f < fields ? '0 0 0 4px rgba(0,177,235,0.3)' : 'none', borderRadius: 4, padding: 12, fontSize: 23, lineHeight: 1.4, color: '#111' }}>
              <TypeText text="Your Name – Line Manager, BAT [Market] – Need access to work with Headcount in BPC" at={desc + 10} speed={1.6} />
            </div>
          </div>
        </div>
        <div style={{ flex: 1, padding: 26 }}>
          <div style={{ fontSize: 24, fontWeight: 700, borderBottom: '2px solid #ccc', paddingBottom: 8 }}>Request Details</div>
          <div style={{ marginTop: 14 }}>
            <Field label="Request Type" hi={hi(fields, fields + 30)}>{pick(fields, 'New Account')} <Chev /></Field>
            <Field label="Request For" hi={hi(fields + 30, area)}>{pick(fields + 30, 'Self')} <Chev /></Field>
            <Field label="User" hi={0}><span style={{ color: '#666' }}>12345678</span></Field>
            <Field label="Functional Area" hi={hi(area, area + 60)}>{pick(area, 'Human Resources')} <Chev /></Field>
          </div>
        </div>
      </div>
      {[fields, fields + 30, area].map((a, i) => <Sfx key={i} at={a + 10} src="pop" volume={0.3} />)}
    </MockWindow>
  );
};

/** Pestaña User Details con datos ficticios. */
export const UserDetails: React.FC<{ company: number; fn: number }> = ({ company, fn }) => {
  const f = useCurrentFrame();
  const open = interpolate(f, [company + 4, company + 12, company + 34, company + 40], [0, 1, 1, 0], clamp);
  const chosen = f >= company + 34;
  const tabs = ['User Access', 'Risk Violation', 'Attachments', 'User Details', 'User System Details', 'Custom Data'];
  return (
    <MockWindow w={1500} h={460} title="NEO · Access Request Creation">
      <div style={{ display: 'flex', gap: 34, padding: '16px 26px', borderBottom: '1px solid #ddd', fontFamily: SAP, fontSize: 21, color: '#32363a' }}>
        {tabs.map((t) => <div key={t} style={{ color: t === 'User Details' ? C.blue : undefined, borderBottom: t === 'User Details' ? `3px solid ${C.blue}` : 'none', paddingBottom: 6 }}>{t}</div>)}
      </div>
      <div style={{ display: 'flex', padding: '18px 26px', fontFamily: SAP, color: '#32363a', gap: 40 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, borderBottom: '2px solid #ccc', paddingBottom: 6 }}>Personal</div>
          <Field label="First Name" w={220}><span style={{ color: '#666' }}>Your</span></Field>
          <Field label="Last Name" w={220}><span style={{ color: '#666' }}>Name</span></Field>
        </div>
        <div style={{ flex: 1.2, position: 'relative' }}>
          <div style={{ fontSize: 22, fontWeight: 700, borderBottom: '2px solid #ccc', paddingBottom: 6 }}>Company</div>
          <Field label="Company" w={300} hi={f >= company && f < fn ? 1 : 0}>{chosen ? 'BAT [Your market]' : ''}<Chev /></Field>
          <Field label="Function" w={300} hi={f >= fn ? 1 : 0}><TypeText text="HR" at={fn + 10} speed={0.3} /></Field>
          {open > 0 && (
            <div style={{ position: 'absolute', left: 224, top: 108, width: 300, background: '#fff', border: '1px solid #999', boxShadow: '0 10px 30px rgba(0,0,0,0.25)', opacity: open, transform: `scaleY(${open})`, transformOrigin: 'top', fontSize: 20 }}>
              {['BAT Mexico', 'BAT Colombia', 'BAT Caribbean', 'BAT Central America'].map((c, i) => <div key={c} style={{ padding: '8px 12px', background: i === 0 && f > company + 22 ? '#d6ecfa' : '#fff' }}>{c}</div>)}
            </div>
          )}
        </div>
      </div>
    </MockWindow>
  );
};

/** Lista de roles por mercado (de la guía de SAP Access Request). */
export const ROLES: [string, string, string][] = [
  ['🇲🇽', 'Mexico', 'ZBPC_HDCT_HR_BP_MA_C00MMX_W'],
  ['🇨🇴', 'Colombia', 'ZBPC_HDCT_HR_BP_MA_C00MCO_W'],
  ['🇻🇪', 'Venezuela', 'ZBPC_HDCT_HR_BP_MA_C00MVE_W'],
  ['🇹🇹', 'Trinidad & Tobago', 'ZBPC_HDCT_HR_BP_MA_C00MTT_W'],
  ['🇯🇲', 'Jamaica', 'ZBPC_HDCT_HR_BP_MA_C00MJM_W'],
  ['🇬🇾', 'Guyana', 'ZBPC_HDCT_HR_BP_MA_C00MGY_W'],
  ['🇵🇦', 'Panama', 'ZBPC_HDCT_HR_BP_MA_C00MPA_W'],
  ['🇬🇹', 'Guatemala', 'ZBPC_HDCT_HR_BP_MA_C00MGT_W'],
  ['🇭🇳', 'Honduras', 'ZBPC_HDCT_HR_BP_MA_C00MHN_W'],
  ['🇨🇷', 'Costa Rica', 'ZBPC_HDCT_HR_BP_MA_C00MCR_W'],
  ['🇳🇮', 'Nicaragua', 'ZBPC_HDCT_HR_BP_MA_C00MNI_W'],
];
const Chev: React.FC = () => <ChevronDown size={20} color="#5b6b7d" style={{ marginLeft: 'auto' }} />;

export const RolesGrid: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sel = Math.floor(Math.max(0, f - at - 40) / 9) % ROLES.length;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 28px', width: 1500, margin: '0 auto' }}>
      {ROLES.map(([flag, name, role], i) => {
        const p = spring({ frame: f - at - i * 3, fps, config: { damping: 15 } });
        const on = f > at + 40 && i === sel;
        return (
          <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '12px 20px', borderRadius: 14, background: on ? 'rgba(0,177,235,0.22)' : 'rgba(255,255,255,0.07)', border: `2px solid ${on ? C.cyan : 'rgba(255,255,255,0.12)'}`, opacity: p, transform: `translateY(${(1 - p) * 30}px) scale(${on ? 1.03 : 1})` }}>
            <span style={{ fontSize: 38 }}>{flag}</span>
            <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, color: '#fff', width: 240 }}>{name}</span>
            <span style={{ fontFamily: MONO, fontSize: 23, color: on ? '#fff' : C.sky }}>{role}</span>
          </div>
        );
      })}
    </div>
  );
};

/** Certificado del curso (recreación genérica). */
export const Certificate: React.FC = () => (
  <div style={{ width: 760, padding: '44px 54px', background: '#fff', borderRadius: 16, boxShadow: '0 30px 90px rgba(0,0,0,0.5)', textAlign: 'center', fontFamily: 'Arial', color: '#222', border: `10px solid ${C.cyan}` }}>
    <div style={{ fontSize: 46, marginBottom: 22 }}>Certificate</div>
    <div style={{ fontSize: 22, lineHeight: 1.6 }}>This is to certify that <b>Your Name</b>,<br />has successfully completed the course:</div>
    <div style={{ fontSize: 24, fontWeight: 700, margin: '18px 0', color: '#333' }}><span style={{ color: C.yellow }}>BPC HR</span> : Headcount and Employment Cost Planning</div>
    <div style={{ fontSize: 22, fontWeight: 700 }}>Module 4</div>
  </div>
);

/** Barra de direcciones del explorador con la ruta escrita. */
export const PathBar: React.FC<{ at: number; oneid: number }> = ({ at, oneid }) => {
  const f = useCurrentFrame();
  const before = 'C:\\Users\\', id = 'OneID', after = '\\AppData\\Local\\EPMOfficeClient';
  const full = before + id + after;
  const n = Math.max(0, Math.min(full.length, Math.floor((f - at) * 1.3)));
  const glow = interpolate(f - oneid, [0, 10], [0, 1], clamp);
  const swap = f >= oneid + 30;
  const shown = full.slice(0, n);
  const a = shown.slice(0, before.length), b = shown.slice(before.length, before.length + id.length), c = shown.slice(before.length + id.length);
  return (
    <div style={{ width: 1500, display: 'flex', alignItems: 'center', gap: 16, padding: '18px 22px', background: '#fff', borderRadius: 14, boxShadow: '0 30px 90px rgba(0,0,0,0.5)', fontFamily: MONO }}>
      <FolderOpen size={36} color={C.blue} />
      <div style={{ flex: 1, border: `2px solid ${C.cyan}`, borderRadius: 8, padding: '12px 16px', fontSize: 34, color: '#1b1b1b', whiteSpace: 'nowrap' }}>
        {a}
        <span style={{ background: `rgba(253,185,19,${0.55 * glow})`, borderRadius: 6, padding: glow ? '0 6px' : 0, outline: glow ? `3px solid rgba(240,129,0,${glow})` : 'none' }}>{swap && b ? '12345678' : b}</span>
        {c}
        {n < full.length && f >= at && <span style={{ color: C.blue }}>|</span>}
      </div>
      {Array.from({ length: Math.ceil(full.length / 1.3 / 3) }).map((_, i) => <Sfx key={i} at={at + i * 3} src="key" volume={0.16} />)}
    </div>
  );
};

/** Archivo descargándose desde SharePoint. */
export const DownloadCard: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const p = interpolate(f - at, [10, 50], [0, 1], clamp);
  return (
    <div style={{ width: 760, padding: 30, borderRadius: 20, background: 'rgba(255,255,255,0.96)', boxShadow: '0 30px 90px rgba(0,0,0,0.5)', fontFamily: FONT }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.blue, letterSpacing: 2 }}>SHAREPOINT · LIBRARY RESOURCES</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 20 }}>
        <div style={{ width: 70, height: 84, borderRadius: 10, background: `linear-gradient(135deg, ${C.cyan}, ${C.blue})`, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 900, fontSize: 20 }}>XML</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: C.navy }}>Connections.xml</div>
          <div style={{ height: 12, borderRadius: 6, background: '#e2e8f2', marginTop: 12, overflow: 'hidden' }}>
            <div style={{ width: `${p * 100}%`, height: '100%', background: `linear-gradient(90deg, ${C.cyan}, ${C.green})` }} />
          </div>
        </div>
        {p >= 1 ? <CircleCheck size={44} color={C.green} strokeWidth={2.4} /> : <Download size={44} color={C.blue} strokeWidth={2.4} />}
      </div>
    </div>
  );
};
