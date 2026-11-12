import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, MONO } from '../theme';
import { useCue, useScene } from '../timing';
import { Shot, sb, Sfx } from '../components/Shot';
import { Big, CheckBurst, Chip, Confetti, Keycap, Logo, Panel, Pop, ProgressRail, StepHeader, STEPS } from '../components/ui';
import { Certificate, DownloadCard, IdLookup, PathBar, RequestForm, RolesGrid, UserDetails } from '../components/Mock';
import { BookOpen, Camera, CircleCheck, ClipboardPaste, Clock, FolderCog, GraduationCap, Hash, KeyRound, LogIn, Mail, MonitorDown, Send, Target, Trash2, TriangleAlert, UserCheck, X } from 'lucide-react';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const TOP = 200; // debajo del encabezado

/** Encabezado + riel de progreso para las escenas de pasos. */
const Step: React.FC<{ n: number; title: string; sub?: string; children: React.ReactNode }> = ({ n, title, sub, children }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <StepHeader n={n} title={title} sub={sub} />
      <ProgressRail step={n} opacity={interpolate(f, [0, 15], [0, 1], clamp)} />
      {children}
    </AbsoluteFill>
  );
};

/** Centra verticalmente en el área de contenido. */
const Center: React.FC<{ children: React.ReactNode; top?: number; h?: number }> = ({ children, top = TOP, h = 760 }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
);

// ===================================================================== INTRO
export const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = useCue();
  const t = c('title');
  const logoIn = spring({ frame: f - 4, fps, config: { damping: 14, mass: 1.2 } });
  const move = interpolate(f, [t - 12, t + 14], [0, 1], { ...clamp, easing: Easing.bezier(0.7, 0, 0.2, 1) });
  const sweep = interpolate(f, [10, 45], [-0.3, 1.3], clamp);
  const ask = c('ask'), shot = c('shot');
  const shift = interpolate(f, [ask - 8, ask + 12], [0, 1], { ...clamp, easing: Easing.bezier(0.7, 0, 0.2, 1) });
  const letters = 'Log on to SAP BPC'.split('');
  return (
    <AbsoluteFill>
      <Sfx at={4} src="impact" volume={0.6} />
      <div style={{ position: 'absolute', left: '50%', top: interpolate(move, [0, 1], [430, 170]) - shift * 40, transform: `translateX(-50%) scale(${interpolate(move, [0, 1], [1, 0.5]) * (0.7 + 0.3 * logoIn)})`, opacity: logoIn, filter: `blur(${(1 - logoIn) * 12}px)` }}>
        <div style={{ position: 'relative' }}>
          <Logo width={620} />
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(105deg, transparent ${sweep * 100 - 12}%, rgba(255,255,255,0.85) ${sweep * 100}%, transparent ${sweep * 100 + 12}%)`, mixBlendMode: 'overlay', WebkitMaskImage: `url(${staticFile('bat-logo-white.png')})`, WebkitMaskSize: '100% 100%' }} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 470 - shift * 120, width: '100%', textAlign: 'center' }}>
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 120, color: '#fff', letterSpacing: -2 }}>
          {letters.map((ch, i) => {
            const p = spring({ frame: f - t - i * 1.5, fps, config: { damping: 12 } });
            return <span key={i} style={{ display: 'inline-block', opacity: p, transform: `translateY(${(1 - p) * 60}px) rotate(${(1 - p) * 12}deg)`, color: i >= 13 ? C.cyan : '#fff', whiteSpace: 'pre' }}>{ch}</span>;
          })}
        </div>
        <Pop at={t + 26}><div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 38, color: C.soft, marginTop: 6 }}>Setup guide for Line Managers · 5 steps</div></Pop>
      </div>
      <div style={{ position: 'absolute', top: 760, width: '100%', display: 'flex', justifyContent: 'center', gap: 30 }}>
        <Pop at={ask + 4} from="scale" sound><Chip icon={Target} text="Your goal" color={C.yellow} /></Pop>
        <Pop at={shot} from="scale" sound><Chip icon={Camera} text="1 screenshot of your BPC log on" color={C.green} /></Pop>
      </div>
    </AbsoluteFill>
  );
};

// ===================================================================== ROADMAP
const NODES = [
  { x: 270, y: 760, icon: GraduationCap, label: 'BPC course', sub: 'SuccessFactors' },
  { x: 640, y: 560, icon: KeyRound, label: 'SAP access', sub: 'NEO request' },
  { x: 1000, y: 650, icon: MonitorDown, label: 'Analysis app', sub: 'Company Portal' },
  { x: 1340, y: 430, icon: FolderCog, label: 'Connections', sub: 'EPMOfficeClient' },
  { x: 1660, y: 290, icon: LogIn, label: 'Log On', sub: 'EPM · P52 HCT' },
];
export const Roadmap: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = useCue();
  const d = 'M 60 900 C 200 820, 160 760, 270 760 S 520 560, 640 560 S 880 660, 1000 650 S 1220 430, 1340 430 S 1560 300, 1660 290 S 1840 200, 1900 160';
  const LEN = 2300;
  const draw = interpolate(f, [8, c('r5') + 10], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const go = c('go');
  const zoom = interpolate(f, [go + 4, go + 40], [0, 1], { ...clamp, easing: Easing.bezier(0.7, 0, 0.3, 1) });
  const cues = ['r1', 'r2', 'r3', 'r4', 'r5'].map((k) => c(k));
  const active = cues.reduce((acc, at, i) => (f >= at ? i : acc), -1);
  return (
    <AbsoluteFill style={{ transform: `scale(${1 + zoom * 0.9})`, transformOrigin: `${NODES[0].x}px ${NODES[0].y}px`, opacity: 1 - zoom * 0.6 }}>
      <Pop at={0}><Big size={64} style={{ position: 'absolute', left: 110, top: 90 }}>Your path to <span style={{ color: C.cyan }}>BPC</span></Big></Pop>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <path d={d} stroke="rgba(0,0,0,0.35)" strokeWidth={70} fill="none" strokeLinecap="round" strokeDasharray={LEN} strokeDashoffset={LEN * (1 - draw)} transform="translate(0,10)" />
        <path d={d} stroke="#123A7A" strokeWidth={64} fill="none" strokeLinecap="round" strokeDasharray={LEN} strokeDashoffset={LEN * (1 - draw)} />
        <path d={d} stroke="#fff" strokeWidth={5} fill="none" strokeDasharray={`30 26`} strokeDashoffset={-f * 2} opacity={0.8} style={{ clipPath: 'none' }} mask="url(#m)" />
        <defs><mask id="m"><path d={d} stroke="#fff" strokeWidth={10} fill="none" strokeDasharray={LEN} strokeDashoffset={LEN * (1 - draw)} /></mask></defs>
      </svg>
      {NODES.map((n, i) => {
        const p = spring({ frame: f - cues[i], fps, config: { damping: 11 } });
        const on = i === active;
        const up = i % 2 === 0;
        return (
          <div key={i} style={{ position: 'absolute', left: n.x, top: n.y, opacity: Math.min(1, p * 1.5) }}>
            <div style={{ position: 'absolute', left: -62, top: -62, width: 124, height: 124, borderRadius: '50%', background: on ? `linear-gradient(135deg, ${C.cyan}, ${C.blue})` : 'rgba(255,255,255,0.14)', border: '4px solid #fff', display: 'grid', placeItems: 'center', transform: `scale(${p * (on ? 1.12 : 1)})`, boxShadow: on ? `0 0 ${40 + Math.sin(f / 5) * 10}px ${C.cyan}` : '0 10px 30px rgba(0,0,0,0.4)' }}>
              <n.icon size={56} color="#fff" strokeWidth={2} />
            </div>
            <div style={{ position: 'absolute', left: -150, width: 300, top: up ? -200 : 80, textAlign: 'center', transform: `translateY(${(1 - p) * (up ? 30 : -30)}px)` }}>
              <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 22, color: C.cyan, letterSpacing: 3 }}>STEP {i + 1}</div>
              <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 36, color: '#fff' }}>{n.label}</div>
              <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 22, color: C.muted }}>{n.sub}</div>
            </div>
            <Sfx at={cues[i]} src="pop" volume={0.4} />
          </div>
        );
      })}
      <Sfx at={go + 4} src="whoosh" volume={0.4} />
    </AbsoluteFill>
  );
};

// ===================================================================== STEP 1: COURSE
export const Course: React.FC = () => {
  const c = useCue();
  const s = useScene();
  const q = c('quick'), se = c('search'), co = c('course'), ce = c('cert');
  return (
    <Step n={1} title="Complete the BPC course" sub="SuccessFactors">
      <Panel from={0} to={se}>
        <Center><Shot name="sf_quick" maxW={1650} title="SuccessFactors" focus={[{ at: q, box: sb('sf_quick', 640, 512, 750, 582), click: true, label: 'View My Learning', labelSide: 'top', zoom: 2.1 }]} /></Center>
      </Panel>
      <Panel from={se} to={co}>
        <Center><Shot name="sf_search" maxH={720} title="SuccessFactors · Learning" focus={[
          { at: 8, box: sb('sf_search', 130, 262, 566, 294), type: 'BPC HR Online Learning', label: 'Search the course', labelSide: 'bottom' },
          { at: Math.min(80, co - se - 30), box: sb('sf_search', 138, 552, 335, 592), click: true, label: 'BPC HR Online Learning', labelSide: 'right' },
        ]} /></Center>
      </Panel>
      <Panel from={co} to={ce}>
        <div style={{ position: 'absolute', left: 90, top: TOP + 90 }}>
          <Shot name="sf_course" maxW={1050} maxH={420} title="BPC HR Online Learning" focus={[{ at: 10, box: sb('sf_course', 618, 136, 713, 167), click: true, label: 'Start / Continue Course', labelSide: 'bottom', zoom: 1.6 }]} />
        </div>
        <div style={{ position: 'absolute', left: 1260, top: TOP + 110, display: 'flex', flexDirection: 'column', gap: 26 }}>
          <Pop at={6} from="right" sound><Chip icon={BookOpen} text="4 modules" /></Pop>
          <Pop at={26} from="right" sound><Chip icon={Clock} text="Up to 3 hours" color={C.yellow} /></Pop>
          <Pop at={c('quiz') - co} from="right" sound><Chip icon={CircleCheck} text="Quiz: modules 1 & 4" color={C.green} /></Pop>
        </div>
      </Panel>
      <Panel from={ce} to={s.frames} kind="zoom">
        <CertShot sendAt={c('send') - ce} />
      </Panel>
    </Step>
  );
};
const CertShot: React.FC<{ sendAt: number }> = ({ sendAt }) => {
  const f = useCurrentFrame();
  const flash = interpolate(f, [18, 20, 30], [0, 1, 0], clamp);
  const frame = interpolate(f, [8, 18], [0, 1], clamp);
  return (
    <>
      <Center>
        <div style={{ position: 'relative', transform: `rotate(${-2 + frame * 2}deg)` }}>
          <Pop at={0} from="scale"><Certificate /></Pop>
          <div style={{ position: 'absolute', inset: -24 * frame, border: `4px dashed rgba(255,255,255,${frame})`, borderRadius: 20 }} />
        </div>
        <div style={{ marginLeft: 70 }}>
          <Pop at={sendAt} from="right" sound><Chip icon={Mail} text="Send it to HRSS" color={C.green} size={36} /></Pop>
        </div>
      </Center>
      <AbsoluteFill style={{ background: '#fff', opacity: flash * 0.8 }} />
      <Sfx at={18} src="shutter" volume={0.5} />
    </>
  );
};

// ===================================================================== STEP 2a: CHECK
export const Check: React.FC = () => {
  const c = useCue();
  const s = useScene();
  const su = c('support'), lo = c('lookup'), p52 = c('p52');
  return (
    <Step n={2} title="Do you already have access?" sub="SAP access">
      <Panel from={0} to={lo}>
        <Center><Shot name="acc_support" maxW={1400} maxH={640} title="NEO portal" focus={[
          { at: su - 0, box: sb('acc_support', 116, 394, 194, 420), click: true, label: '1 · Support', labelSide: 'right', zoom: 1.6 },
          { at: su + 26, box: sb('acc_support', 110, 218, 268, 244), click: true, label: '2 · Access Management', labelSide: 'bottom', zoom: 1.6 },
          { at: su + 52, box: sb('acc_support', 503, 273, 588, 298), click: true, label: '3 · IDLookup', labelSide: 'bottom', zoom: 1.6 },
        ]} /></Center>
      </Panel>
      <Panel from={lo} to={p52}>
        <Center><IdLookup type={6} search={c('bulk') - lo + 6} p52={99999} /></Center>
      </Panel>
      <Panel from={p52} to={s.frames}>
        <div style={{ position: 'absolute', left: 100, top: TOP + 60 }}>
          <Shot name="acc_roles" maxW={1000} maxH={600} title="Your SAP systems & roles" focus={[{ at: 8, box: sb('acc_roles', 110, 440, 300, 500), label: 'bat-sapRoles-P52', labelSide: 'right', zoom: 1.5 }]} />
        </div>
        <div style={{ position: 'absolute', left: 1220, top: TOP + 150, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 30 }}>
          <CheckBurst at={c('skip') - p52} size={150} />
          <Pop at={c('skip') - p52 + 6} from="right"><Big size={44}>Already there?</Big><Big size={40} color={C.green}>Skip to Step 3 →</Big></Pop>
          <Sfx at={c('skip') - p52} src="success" volume={0.35} />
        </div>
      </Panel>
    </Step>
  );
};

// ===================================================================== STEP 2b: REQUEST
export const Request: React.FC = () => {
  const c = useCue();
  const s = useScene();
  const q = c('quick'), arc = c('arc'), fo = c('form'), fi = c('fields');
  const ty = s.cues.type ?? fi + 60, ar = c('area');
  return (
    <Step n={2} title="Request access in NEO" sub="SAP access">
      <Panel from={0} to={q}>
        <div style={{ position: 'absolute', left: 120, top: TOP + 40 }}>
          <Shot name="acc_neo" maxW={900} maxH={640} title="Employee Central" focus={[{ at: c('neo') + 6, box: sb('acc_neo', 100, 572, 194, 633), click: true, label: 'NEO', labelSide: 'right', zoom: 1.5 }]} />
        </div>
        <div style={{ position: 'absolute', left: 1150, top: TOP + 200 }}>
          <Pop at={c('neo') + 10} from="right"><Big size={40} color={C.soft} weight={600}>or type</Big><div style={{ fontFamily: MONO, fontSize: 54, color: '#fff', marginTop: 10 }}>neo/</div><div style={{ fontFamily: MONO, fontSize: 26, color: C.sky, marginTop: 8 }}>neo.batgen.com/irj/portal</div></Pop>
        </div>
      </Panel>
      <Panel from={q} to={arc}>
        <Center><Shot name="acc_quick" maxW={900} maxH={560} title="NEO · Quick Links" focus={[{ at: 4, box: sb('acc_quick', 962, 375, 1072, 399), click: true, label: 'Access Requests', labelSide: 'right', zoom: 1.4 }]} /></Center>
      </Panel>
      <Panel from={arc} to={fo}>
        <Center><Shot name="acc_arc" maxW={1100} maxH={560} title="NEO · My Profile" focus={[{ at: 4, box: sb('acc_arc', 143, 260, 282, 279), click: true, label: 'Access Request Creation', labelSide: 'right', zoom: 1.6 }]} /></Center>
      </Panel>
      <Panel from={fo} to={fi}>
        <Center><RequestForm desc={0} fields={99999} area={199999} /></Center>
      </Panel>
      <Panel from={fi} to={s.frames}>
        <div style={{ position: 'absolute', left: 140, top: TOP + 40 }}>
          <Shot name="acc_reqdetails" maxW={900} maxH={620} title="Request Details · example" focus={[
            { at: ty - fi, box: [272, 76, 262, 46], label: 'New Account', labelSide: 'bottom', zoom: 1.3 },
            { at: ty - fi + 40, box: [272, 133, 262, 46], label: 'Self', labelSide: 'bottom', zoom: 1.3 },
            { at: ar - fi, box: [272, 245, 262, 46], label: 'Your own area', labelSide: 'bottom', zoom: 1.3 },
          ]} />
        </div>
        <div style={{ position: 'absolute', left: 1140, top: TOP + 170, display: 'flex', flexDirection: 'column', gap: 26 }}>
          <Pop at={10} from="right"><Big size={50}>Enter the details<br />that <span style={{ color: C.cyan }}>apply to you</span></Big></Pop>
          <Pop at={ar - fi + 10} from="right" sound><Chip icon={UserCheck} text="Example: Human Resources" color={C.yellow} size={28} /></Pop>
        </div>
      </Panel>
    </Step>
  );
};

// ===================================================================== STEP 2c: SYSTEM + ROLE
export const SysRole: React.FC = () => {
  const c = useCue();
  const s = useScene();
  const ad = c('addsys'), p52 = c('p52'), ok = c('ok'), ar = c('addrole'), ro = c('roles'), se = c('search'), av = c('avail');
  return (
    <Step n={2} title="Add the system and your role" sub="SAP access">
      <Panel from={0} to={p52}>
        <Center><Shot name="acc_addsys" maxW={1500} maxH={620} title="Access Request · User Access" focus={[
          { at: ad + 4, box: sb('acc_addsys', 122, 221, 177, 250), click: true, label: 'Add', labelSide: 'right', zoom: 1.6 },
          { at: ad + 34, box: sb('acc_addsys', 123, 286, 202, 312), click: true, label: 'System', labelSide: 'right', zoom: 1.6 },
        ]} /></Center>
      </Panel>
      <Panel from={p52} to={ar}>
        <div style={{ position: 'absolute', left: 150, top: TOP + 30 }}>
          <Shot name="acc_p52" maxW={760} maxH={680} title="Available" focus={[
            { at: 6, box: sb('acc_p52', 114, 339, 448, 361), click: true, label: 'P52 Client 100', labelSide: 'bottom', zoom: 1.3 },
            { at: 46, box: sb('acc_p52', 493, 352, 523, 377), click: true, label: 'Move ›', labelSide: 'left', zoom: 1.3 },
          ]} />
        </div>
        <div style={{ position: 'absolute', left: 1080, top: TOP + 30 }}>
          <Panel from={ok - p52 - 14} to={ar} sfx={false} x={0} w={760}>
            <Shot name="acc_p52sel" maxW={700} maxH={680} title="Selected" focus={[
              { at: 4, box: sb('acc_p52sel', 718, 264, 1072, 286), label: 'Selected', labelSide: 'bottom', zoom: 1.2 },
              { at: 22, box: sb('acc_p52sel', 1012, 655, 1048, 680), click: true, label: 'OK', labelSide: 'top', zoom: 1.3 },
            ]} />
          </Panel>
        </div>
      </Panel>
      <Panel from={ar} to={ro}>
        <Center><Shot name="acc_addrole" maxW={1400} maxH={420} title="Access Request · User Access" focus={[
          { at: 4, box: sb('acc_addrole', 128, 227, 174, 252), click: true, label: 'Add', labelSide: 'right', zoom: 1.5 },
          { at: 30, box: sb('acc_addrole', 129, 254, 172, 276), click: true, label: 'Role', labelSide: 'right', zoom: 1.5 },
        ]} /></Center>
      </Panel>
      <Panel from={ro} to={se}>
        <div style={{ position: 'absolute', top: TOP + 10, width: '100%', textAlign: 'center' }}>
          <Pop at={0}><Big size={40}>Copy the <span style={{ color: C.cyan }}>role for your market</span></Big></Pop>
        </div>
        <div style={{ position: 'absolute', top: TOP + 90, width: '100%' }}><RolesGrid at={6} /></div>
      </Panel>
      <Panel from={se} to={av}>
        <Center><Shot name="acc_rolesearch" maxW={1400} maxH={560} title="Search Criteria" focus={[
          { at: 4, box: sb('acc_rolesearch', 630, 291, 769, 317), type: 'ZBPC_HDCT_HR_BP_MA_…', label: 'Role / Profile Name', labelSide: 'bottom', zoom: 1.6 },
          { at: Math.max(40, av - se - 40), box: sb('acc_rolesearch', 118, 380, 170, 406), click: true, label: 'Search', labelSide: 'right', zoom: 1.6 },
        ]} /></Center>
      </Panel>
      <Panel from={av} to={s.frames}>
        <Center><Shot name="acc_roleavail" maxW={1400} maxH={560} title="Available roles" focus={[
          { at: 6, box: sb('acc_roleavail', 108, 543, 782, 565), click: true, label: 'System Description: P52 Client 100', labelSide: 'bottom', zoom: 1.2 },
          { at: 56, box: sb('acc_roleavail', 113, 648, 137, 670), click: true, label: 'Move down', labelSide: 'right', zoom: 1.5 },
        ]} /></Center>
      </Panel>
    </Step>
  );
};

// ===================================================================== STEP 2d: DETAILS + SUBMIT
export const Details: React.FC = () => {
  const c = useCue();
  const s = useScene();
  const us = c('usersys'), gr = c('group'), sub = c('submit');
  return (
    <Step n={2} title="Your details, then Submit" sub="SAP access">
      <Panel from={0} to={us}>
        <Center h={600}><UserDetails company={c('details') + 8} fn={c('function')} /></Center>
        <div style={{ position: 'absolute', left: 0, right: 0, top: TOP + 600, display: 'flex', justifyContent: 'center' }}>
          <Pop at={c('function') + 6} from="up" sound><Chip icon={UserCheck} text="Use your own company and function" color={C.yellow} size={28} /></Pop>
        </div>
      </Panel>
      <Panel from={us} to={gr}>
        <Center><Shot name="acc_usersys" maxW={1400} maxH={420} title="Access Request · User System Details" focus={[
          { at: 4, box: sb('acc_usersys', 375, 358, 478, 382), click: true, label: 'User System Details', labelSide: 'bottom', zoom: 1.5 },
          { at: 40, box: sb('acc_usersys', 284, 446, 308, 469), click: true, label: 'User Group picker', labelSide: 'right', zoom: 1.6 },
        ]} /></Center>
      </Panel>
      <Panel from={gr} to={sub}>
        <div style={{ position: 'absolute', left: 260, top: TOP + 10 }}>
          <Shot name="acc_group" maxW={700} maxH={700} title="User Group" focus={[
            { at: 4, box: sb('acc_group', 790, 238, 982, 277), label: '*Your country*', labelSide: 'bottom', zoom: 1.4 },
            { at: c('hr') - gr, box: sb('acc_group', 638, 426, 992, 450), click: true, label: 'Group for your area', labelSide: 'bottom', zoom: 1.3 },
            { at: c('hr') - gr + 34, box: sb('acc_group', 922, 673, 953, 697), click: true, label: 'OK', labelSide: 'top', zoom: 1.4 },
          ]} />
        </div>
        <div style={{ position: 'absolute', left: 1120, top: TOP + 180 }}>
          <Pop at={10} from="right"><div style={{ fontFamily: MONO, fontSize: 64, color: '#fff' }}>*Mexico*</div></Pop>
          <Pop at={22} from="right"><div style={{ fontFamily: FONT, fontSize: 28, color: C.muted, marginTop: 10 }}>e.g. *Colombia*, *Jamaica*…</div></Pop>
        </div>
      </Panel>
      <Panel from={sub} to={s.frames}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: TOP + 60, display: 'flex', justifyContent: 'center' }}>
          <Shot name="acc_submit" maxW={1600} maxH={380} title="Access Request" focus={[{ at: 6, box: sb('acc_submit', 1203, 648, 1252, 674), click: true, label: 'Submit', labelSide: 'top', zoom: 2 }]} />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: TOP + 520, display: 'flex', justifyContent: 'center' }}>
          <Pop at={c('sent') - sub} from="scale" sound><Chip icon={Send} text="Request sent for approval" color={C.green} size={36} /></Pop>
        </div>
      </Panel>
    </Step>
  );
};

// ===================================================================== STEP 3: INSTALL
export const Install: React.FC = () => {
  const c = useCue();
  const s = useScene();
  const st = c('start'), po = c('popup'), pt = c('portal'), re = c('results'), ab = c('about'), rs = c('restart');
  return (
    <Step n={3} title="Install SAP Analysis for Office" sub="Company Portal">
      <Panel from={0} to={po}>
        <Center><Shot name="an_start" maxH={720} title="Windows" focus={[
          { at: st, box: sb('an_start', 653, 703, 692, 742), click: true, label: 'Start', labelSide: 'right', zoom: 1.4 },
          { at: st + 26, box: sb('an_start', 558, 160, 1225, 188), type: 'BAT Company Portal', label: 'Type: BAT Company Portal', labelSide: 'bottom', zoom: 1.2 },
          { at: st + 70, box: sb('an_start', 562, 286, 860, 340), click: true, label: 'Open', labelSide: 'right', zoom: 1.5 },
        ]} /></Center>
      </Panel>
      <Panel from={po} to={pt}>
        <Center><Shot name="an_popup" maxW={1300} maxH={620} title="Software Request Guidelines" focus={[{ at: 6, box: sb('an_popup', 846, 546, 1110, 582), click: true, label: 'BAT Company Portal', labelSide: 'top', zoom: 1.5 }]} /></Center>
      </Panel>
      <Panel from={pt} to={re}>
        <Center><Shot name="an_portal" maxW={1500} maxH={620} title="BAT Company Portal" focus={[{ at: 6, box: sb('an_portal', 630, 246, 970, 284), type: 'Analysis', label: 'Search: Analysis', labelSide: 'bottom', zoom: 1.6 }]} /></Center>
      </Panel>
      <Panel from={re} to={ab}>
        <div style={{ position: 'absolute', left: 140, top: TOP + 20 }}>
          <Shot name="an_results" maxW={900} maxH={700} title="Company Portal · Apps" focus={[
            { at: 6, box: sb('an_results', 300, 395, 456, 575), label: '64-bit', labelSide: 'bottom', zoom: 1.2 },
            { at: 40, box: sb('an_results', 467, 398, 617, 572), label: '32-bit', labelSide: 'bottom', zoom: 1.2 },
          ]} />
        </div>
        <div style={{ position: 'absolute', left: 1120, top: TOP + 200 }}>
          <Pop at={20} from="right"><Big size={52}>Match your <span style={{ color: C.cyan }}>Excel</span></Big></Pop>
          <Pop at={34} from="right"><div style={{ display: 'flex', gap: 20, marginTop: 24 }}><Chip text="64-bit" /><Chip text="32-bit" color={C.yellow} /></div></Pop>
        </div>
      </Panel>
      <Panel from={ab} to={ab + 36}>
        <Center><Shot name="an_file" maxW={1500} maxH={420} title="Excel" focus={[{ at: 4, box: sb('an_file', 44, 322, 102, 354), click: true, label: 'File', labelSide: 'right', zoom: 1.8 }]} /></Center>
      </Panel>
      <Panel from={ab + 36} to={rs}>
        <Center><Shot name="an_about" maxW={1300} maxH={700} title="Excel · Account" focus={[
          { at: 4, box: sb('an_about', 138, 668, 202, 692), click: true, label: 'Account', labelSide: 'right', zoom: 1.6 },
          { at: 20, box: sb('an_about', 692, 574, 762, 642), click: true, label: 'About Excel', labelSide: 'left', zoom: 1.6 },
          { at: 44, box: sb('an_about', 255, 246, 700, 272), label: '… 64-bit', labelSide: 'bottom', zoom: 1.5 },
        ]} /></Center>
      </Panel>
      <Panel from={rs} to={s.frames} kind="zoom">
        <Restart />
      </Panel>
    </Step>
  );
};
const Restart: React.FC = () => {
  const f = useCurrentFrame();
  const spin = interpolate(f, [20, 70], [0, 360], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  return (
    <Center>
      <Pop at={0} from="scale">
        <div style={{ width: 420, height: 270, borderRadius: 24, border: '14px solid #fff', display: 'grid', placeItems: 'center', background: 'rgba(0,177,235,0.12)', boxShadow: `0 0 80px ${C.cyan}66` }}>
          <svg width="130" height="130" viewBox="0 0 100 100" style={{ transform: `rotate(${spin}deg)` }}>
            <path d="M 30 25 A 35 35 0 1 0 70 25" stroke="#fff" strokeWidth="10" fill="none" strokeLinecap="round" />
            <path d="M50 8 L50 50" stroke={C.cyan} strokeWidth="10" strokeLinecap="round" />
          </svg>
        </div>
        <div style={{ width: 520, height: 26, margin: '0 auto', borderRadius: '0 0 18px 18px', background: '#fff', marginLeft: -50 }} />
      </Pop>
      <div style={{ marginLeft: 90 }}>
        <Pop at={8} from="right"><Big size={64}>Install, then<br /><span style={{ color: C.cyan }}>restart</span> your PC</Big></Pop>
        <Pop at={40} from="right" sound><div style={{ marginTop: 28 }}><Chip icon={TriangleAlert} text="Don't skip this step" color={C.orange} /></div></Pop>
      </div>
    </Center>
  );
};

// ===================================================================== STEP 4: CONNECTIONS
export const Connections: React.FC = () => {
  const c = useCue();
  const s = useScene();
  const cl = c('close'), dl = c('download'), pa = c('path'), rp = c('replace');
  return (
    <Step n={4} title="Update the connections file" sub="EPMOfficeClient">
      <Panel from={0} to={dl}>
        <CloseExcel at={cl} />
      </Panel>
      <Panel from={dl} to={pa}>
        <Center><Pop at={0} from="scale"><DownloadCard at={4} /></Pop></Center>
      </Panel>
      <Panel from={pa} to={rp}>
        <div style={{ position: 'absolute', top: TOP + 120, width: '100%', textAlign: 'center' }}>
          <Pop at={0}><Big size={40}>File Explorer → address bar</Big></Pop>
        </div>
        <div style={{ position: 'absolute', top: TOP + 260, width: '100%', display: 'flex', justifyContent: 'center' }}><PathBar at={10} oneid={c('oneid') - pa} /></div>
        <div style={{ position: 'absolute', top: TOP + 420, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <Pop at={c('oneid') - pa + 8} from="up" sound><Chip icon={Hash} text="OneID = your employee number" color={C.yellow} /></Pop>
        </div>
      </Panel>
      <Panel from={rp} to={s.frames}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: TOP + 60, display: 'flex', justifyContent: 'center' }}>
          <Shot name="con_folder" maxW={1450} maxH={420} title="EPMOfficeClient" focus={[{ at: 6, box: sb('con_folder', 412, 671, 760, 695), label: 'Connections.xml', labelSide: 'bottom', zoom: 1.4 }]} />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: TOP + 560, display: 'flex', justifyContent: 'center', gap: 40 }}>
          <Pop at={30} from="scale" sound><Chip icon={Trash2} text="Delete the old one" color={C.magenta} /></Pop>
          <Pop at={60} from="scale" sound><Chip icon={ClipboardPaste} text="Paste the new one" color={C.green} /></Pop>
        </div>
      </Panel>
    </Step>
  );
};
const CloseExcel: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Center>
      {[0, 1, 2].map((i) => {
        const inn = spring({ frame: f - i * 5, fps, config: { damping: 14 } });
        const out = spring({ frame: f - at - 10 - i * 9, fps, config: { damping: 14 } });
        return (
          <div key={i} style={{ width: 380, height: 260, margin: '0 -30px', borderRadius: 16, background: '#fff', boxShadow: '0 30px 80px rgba(0,0,0,0.45)', transform: `translateY(${(1 - inn) * 80 + i * 30 - 30}px) rotate(${(i - 1) * 6}deg) scale(${1 - out})`, opacity: inn * (1 - out), overflow: 'hidden' }}>
            <div style={{ height: 50, background: '#107C41', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 20 }}>
              <span>Book{i + 1}.xlsx</span><X size={26} color="#fff" strokeWidth={2.6} />
            </div>
            <div style={{ backgroundImage: 'linear-gradient(#ddd 1px, transparent 1px), linear-gradient(90deg, #ddd 1px, transparent 1px)', backgroundSize: '60px 26px', height: 210 }} />
            <Sfx at={at + 10 + i * 9} src="pop" volume={0.3} />
          </div>
        );
      })}
      <div style={{ position: 'absolute', bottom: 60 }}><Pop at={at + 30}><Chip icon={X} text="Close every Excel window" /></Pop></div>
    </Center>
  );
};

// ===================================================================== STEP 5a: LAUNCH
export const Launch: React.FC = () => {
  const c = useCue();
  const s = useScene();
  const an = c('analysis'), ep = c('epm'), ri = c('ribbon');
  return (
    <Step n={5} title="Launch the add-ins" sub="Log On">
      <Panel from={0} to={ep}>
        <Center><Shot name="epm_analysis" maxH={720} title="Windows" focus={[
          { at: an, box: sb('epm_analysis', 738, 693, 777, 727), click: true, label: 'Start', labelSide: 'right', zoom: 1.4 },
          { at: an + 24, box: sb('epm_analysis', 625, 214, 1210, 241), type: 'Analysis', label: 'Type: Analysis', labelSide: 'bottom', zoom: 1.2 },
          { at: an + 60, box: sb('epm_analysis', 628, 324, 888, 376), click: true, label: 'Analysis for Microsoft Excel', labelSide: 'right', zoom: 1.4 },
        ]} /></Center>
      </Panel>
      <Panel from={ep} to={ri}>
        <Center><Shot name="epm_epm" maxH={720} title="Windows" focus={[
          { at: 4, box: sb('epm_epm', 557, 231, 1150, 258), type: 'EPM', label: 'Type: EPM', labelSide: 'bottom', zoom: 1.2 },
          { at: 34, box: sb('epm_epm', 560, 342, 828, 394), click: true, label: 'EPM add-in for Excel', labelSide: 'right', zoom: 1.4 },
        ]} /></Center>
      </Panel>
      <Panel from={ri} to={s.frames}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: TOP + 40, display: 'flex', justifyContent: 'center' }}>
          <Shot name="epm_ribbon" maxW={1650} maxH={520} title="Excel" focus={[
            { at: 6, box: sb('epm_ribbon', 874, 260, 916, 287), label: 'EPM', labelSide: 'bottom', zoom: 1.8 },
            { at: 34, box: sb('epm_ribbon', 1152, 260, 1215, 287), label: 'Analysis', labelSide: 'bottom', zoom: 1.8 },
            { at: 62, box: sb('epm_ribbon', 1232, 260, 1345, 287), label: 'Analysis Design', labelSide: 'bottom', zoom: 1.8 },
            { at: 100, box: sb('epm_ribbon', 860, 255, 1350, 292), label: 'All three tabs', labelSide: 'bottom', zoom: 1.2 },
          ]} />
        </div>
      </Panel>
    </Step>
  );
};

// ===================================================================== STEP 5b: LOGON
export const Logon: React.FC = () => {
  const c = useCue();
  const s = useScene();
  const lo = c('logon'), dots = c('dots'), ma = c('manager'), de = c('default'), fi = c('final');
  return (
    <Step n={5} title="Log on to BPC" sub="P52 · BAT_HCT">
      <Panel from={0} to={ma}>
        <Center><Shot name="con_logon" maxW={1500} maxH={700} title="Excel · EPM" focus={[
          { at: lo + 4, box: sb('con_logon', 913, 226, 957, 262), click: true, label: 'EPM tab', labelSide: 'bottom', zoom: 1.8 },
          { at: lo + 34, box: sb('con_logon', 140, 250, 197, 346), click: true, label: 'Log On', labelSide: 'right', zoom: 1.7 },
          { at: dots + 4, box: sb('con_logon', 973, 516, 1012, 557), click: true, label: '…', labelSide: 'right', zoom: 2 },
        ]} /></Center>
      </Panel>
      <Panel from={ma} to={fi}>
        <Center><Shot name="con_manager" maxW={1200} maxH={720} title="Connection Manager" focus={[
          { at: 6, box: sb('con_manager', 158, 404, 562, 446), click: true, label: 'P52 - BAT_HCT - HCT (SSO)', labelSide: 'bottom', zoom: 1.5 },
          { at: de - ma + 4, box: sb('con_manager', 682, 414, 806, 441), click: true, label: 'Set as Default', labelSide: 'bottom', zoom: 1.6 },
          { at: de - ma + 40, box: sb('con_manager', 679, 651, 766, 686), click: true, label: 'OK', labelSide: 'top', zoom: 1.6 },
        ]} /></Center>
      </Panel>
      <Panel from={fi} to={s.frames} kind="zoom">
        <Center><Shot name="epm_logon_dialog" maxW={1500} maxH={560} title="SAP EPM Solutions · Logon" focus={[
          { at: 4, box: [612, 243, 410, 32], label: 'P52 - BAT_HCT - HCT (SSO)', labelSide: 'bottom', zoom: 1.3 },
          { at: 30, box: [650, 434, 100, 46], click: true, label: 'Log On', labelSide: 'right', zoom: 1.6 },
        ]} /></Center>
      </Panel>
    </Step>
  );
};

// ===================================================================== EVIDENCE
export const Evidence: React.FC<{ contact: string }> = ({ contact }) => {
  const c = useCue();
  const s = useScene();
  const f = useCurrentFrame();
  const done = c('done'), sn = c('snip'), ke = c('keys'), se = c('send');
  const press = (at: number) => interpolate(f, [at, at + 4, at + 14, at + 20], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill>
      <Panel from={0} to={sn}>
        <Center top={120} h={800}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
            <CheckBurst at={done + 2} size={230} />
            <Pop at={done + 10} from="up"><Big size={96}>You're in <span style={{ color: C.cyan }}>BPC!</span></Big></Pop>
          </div>
        </Center>
        <Confetti at={done + 4} x={960} y={420} />
        <Sfx at={done + 2} src="success" volume={0.5} />
      </Panel>
      <Panel from={sn} to={se}>
        <SnipFrame keysAt={ke - sn} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 760, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 26 }}>
          {['Win', 'Shift', 'S'].map((k, i) => (
            <React.Fragment key={k}>
              {i > 0 && <span style={{ fontFamily: FONT, fontSize: 60, color: '#fff', fontWeight: 800 }}>+</span>}
              <Pop at={ke - sn + i * 6} from="up"><Keycap k={k} down={press(ke - sn + 20 + i * 4)} /></Pop>
            </React.Fragment>
          ))}
        </div>
      </Panel>
      <Panel from={se} to={s.frames} kind="zoom">
        <SendCard contact={contact} />
      </Panel>
    </AbsoluteFill>
  );
};
const SnipFrame: React.FC<{ keysAt: number }> = ({ keysAt }) => {
  const f = useCurrentFrame();
  const sel = interpolate(f, [keysAt + 34, keysAt + 56], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const flash = interpolate(f, [keysAt + 60, keysAt + 62, keysAt + 72], [0, 1, 0], clamp);
  return (
    <>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 120, display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Shot name="epm_logon_dialog" maxW={1300} maxH={460} tilt={0.3} />
          <div style={{ position: 'absolute', left: 10, top: 34, width: 1300 * sel, height: 440 * sel, border: '4px dashed #fff', background: 'rgba(0,177,235,0.12)', boxShadow: sel > 0 ? '0 0 0 4000px rgba(0,0,0,0.35)' : 'none' }} />
        </div>
      </div>
      <AbsoluteFill style={{ background: '#fff', opacity: flash * 0.85 }} />
      <Sfx at={keysAt + 60} src="shutter" volume={0.55} />
    </>
  );
};
const SendCard: React.FC<{ contact: string }> = ({ contact }) => {
  const f = useCurrentFrame();
  const fly = interpolate(f, [30, 60], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  return (
    <Center top={100} h={860}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 }}>
        <div style={{ transform: `translate(${fly * 900}px, ${-fly * 400}px) rotate(${fly * 25}deg) scale(${1 - fly * 0.5})`, opacity: 1 - fly * 0.9 }}><Camera size={150} color="#fff" strokeWidth={1.6} /></div>
        <Pop at={4}><Big size={72} style={{ textAlign: 'center' }}>Send your screenshot to</Big></Pop>
        <Pop at={16} from="scale" sound><div style={{ padding: '22px 48px', borderRadius: 999, background: `linear-gradient(135deg, ${C.cyan}, ${C.blue})`, fontFamily: FONT, fontWeight: 800, fontSize: 56, color: '#fff', boxShadow: `0 0 60px ${C.cyan}88`, display: 'flex', alignItems: 'center', gap: 20 }}><Mail size={56} color="#fff" strokeWidth={2.2} />{contact}</div></Pop>
        <Pop at={30}><div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 30, color: C.soft }}>That's how we confirm your BPC access.</div></Pop>
      </div>
      <Sfx at={30} src="whoosh" volume={0.4} />
    </Center>
  );
};

// ===================================================================== OUTRO
export const Outro: React.FC = () => {
  const c = useCue();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const re = c('recap'), th = c('thanks');
  const lp = spring({ frame: f - th, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 200, width: '100%', display: 'flex', justifyContent: 'center', gap: 34, opacity: interpolate(f, [th + 10, th + 24], [1, 0], clamp) }}>
        {STEPS.map((st, i) => (
          <Pop key={st} at={re + i * 9} from="scale" sound>
            <div style={{ width: 300, padding: '30px 10px', borderRadius: 24, background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.15)', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}><CheckBurst at={re + i * 9 + 4} size={90} /></div>
              <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 28, color: '#fff', marginTop: 16 }}>{st}</div>
            </div>
          </Pop>
        ))}
      </div>
      <div style={{ position: 'absolute', top: 360, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: lp, transform: `scale(${0.8 + 0.2 * lp})` }}>
        <Logo width={440} />
        <Big size={70} style={{ marginTop: 40 }}>Thank you!</Big>
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 30, color: C.soft, marginTop: 14 }}>Questions? Reach out to the HRSS team.</div>
      </div>
      <div style={{ position: 'absolute', bottom: 34, right: 60, fontFamily: FONT, fontSize: 18, color: C.muted, opacity: lp }}>Narration voice: ElevenLabs</div>
      <Sfx at={th} src="impact" volume={0.45} />
    </AbsoluteFill>
  );
};
