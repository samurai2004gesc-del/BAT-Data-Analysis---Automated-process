// Guion del video. Cada escena es una lista de segmentos:
//   t   = texto que se ve en subtítulos
//   say = cómo se pronuncia (si es distinto), solo para la voz
//   cue = nombre del momento; las animaciones se sincronizan con él
// scripts/voice.mjs genera el audio con ElevenLabs y los tiempos de cada segmento.

export type Seg = { t: string; say?: string; cue?: string };
export type Lang = 'en';
export type SceneId =
  | 'intro' | 'roadmap' | 'course' | 'check' | 'request' | 'sysrole'
  | 'details' | 'install' | 'connections' | 'launch' | 'logon' | 'hrinput' | 'selections' | 'evidence' | 'outro';

export const SCENES: SceneId[] = [
  'intro', 'roadmap', 'course', 'check', 'request', 'sysrole', 'details',
  'install', 'connections', 'launch', 'logon', 'hrinput', 'selections', 'evidence', 'outro',
];

export const SCRIPT: Record<Lang, Record<SceneId, Seg[]>> = {
  en: {
    intro: [
      { t: 'Hi. In this video you will set up your access to SAP BPC', cue: 'title' },
      { t: 'in five simple steps.' },
      { t: 'At the end, we only need one thing from you:', cue: 'ask' },
      { t: 'a screenshot that shows you were able to log in.', cue: 'shot' },
    ],
    roadmap: [
      { t: 'Here is the path.' },
      { t: 'One: the BPC course in SuccessFactors.', cue: 'r1' },
      { t: 'Two: the SAP access request.', cue: 'r2' },
      { t: 'Three: install SAP Analysis for Office.', cue: 'r3' },
      { t: 'Four: the connections file.', cue: 'r4' },
      { t: 'And five: log on to BPC.', cue: 'r5' },
      { t: "Let's go step by step.", cue: 'go' },
    ],
    course: [
      { t: 'Step one: the course.' },
      { t: 'In SuccessFactors, open the Home menu and choose Training Catalogue.', cue: 'menu' },
      { t: 'In Search for Learning, type Business Planning Consolidation.', cue: 'search' },
      { t: 'Open the course Solid Training – Global – Human Resources – Business Planning Consolidation (BPC).', say: 'Open the course: Solid Training, Global, Human Resources, Business Planning Consolidation.', cue: 'course' },
      { t: "Click Start Course. It's an online course of about one hour.", cue: 'start' },
      { t: 'Complete it before you request access.', cue: 'done' },
    ],
    check: [
      { t: 'Step two: SAP access.' },
      { t: 'First, check whether you already have it.' },
      { t: 'In the NEO portal, go to Support, Access Management, IDLookup.', cue: 'support' },
      { t: 'Type your name exactly as it appears in Teams,', cue: 'lookup' },
      { t: 'click Bulk Search, and then click your ID.', cue: 'bulk' },
      { t: 'If you see bat-sapRoles-P52 with your market role,', say: 'If you see bat sap Roles P fifty-two, with your market role,', cue: 'p52' },
      { t: 'you already have access: skip to step three.', cue: 'skip' },
    ],
    request: [
      { t: "If you don't, open NEO.", cue: 'neo' },
      { t: 'Under Quick Links, open Access Requests', cue: 'quick' },
      { t: 'and then Access Request Creation.', cue: 'arc' },
      { t: 'In Description, write your name, your role and why you need access.', cue: 'form' },
      { t: 'Then fill in the request details that apply to you.', cue: 'fields' },
      { t: 'Request Type: New Account. Request For: Self.', cue: 'type' },
      { t: 'And your own Functional Area. In this example, Human Resources.', cue: 'area' },
    ],
    sysrole: [
      { t: 'In the User Access tab, click Add and choose System.', cue: 'addsys' },
      { t: 'Find P52 Client 100 and move it to Selected with the arrow.', say: 'Find P fifty-two Client one hundred, and move it to Selected with the arrow.', cue: 'p52' },
      { t: 'Click OK.', cue: 'ok' },
      { t: 'Now Add again, and this time choose Role.', cue: 'addrole' },
      { t: 'Copy the role for your market from this list.', cue: 'roles' },
      { t: 'Paste it in Role / Profile Name and click Search.', say: 'Paste it in Role Profile Name and click Search.', cue: 'search' },
      { t: 'Select the one that says P52 Client 100 and move it down with the arrow.', say: 'Select the one that says P fifty-two Client one hundred, and move it down with the arrow.', cue: 'avail' },
    ],
    details: [
      { t: 'In User Details, choose the company for your market', cue: 'details' },
      { t: 'and type your function, for example HR.', cue: 'function' },
      { t: 'In User System Details, open the User Group picker.', cue: 'usersys' },
      { t: 'Search for your country between asterisks, for example *Mexico*,', say: 'Search for your country between asterisks, for example: asterisk Mexico asterisk,', cue: 'group' },
      { t: 'choose the group for your area, for example Mexico - HR, and click OK.', say: 'choose the group for your area, for example, Mexico H R, and click OK.', cue: 'hr' },
      { t: 'Finally, click Submit.', cue: 'submit' },
      { t: 'Your request goes out for approval.', cue: 'sent' },
    ],
    install: [
      { t: 'Step three: install SAP Analysis for Office.' },
      { t: 'Open the Windows menu, type BAT Company Portal and open it.', cue: 'start' },
      { t: 'If this window pops up, choose BAT Company Portal.', cue: 'popup' },
      { t: 'In the portal search box, type Analysis and press Enter.', cue: 'portal' },
      { t: 'Choose the 64 or 32-bit version: the same one as your Excel.', cue: 'results' },
      { t: 'To check, in Excel go to File, Account, About Excel.', cue: 'about' },
      { t: "Install the app and restart your computer. Don't skip this step.", cue: 'restart' },
    ],
    connections: [
      { t: 'Step four: the connections file.' },
      { t: 'Close every Excel window.', cue: 'close' },
      { t: 'Download the Connections file from the Library Resources module on SharePoint.', cue: 'download' },
      { t: 'Open File Explorer and paste this path into the address bar.', cue: 'path' },
      { t: 'Replace OneID with your employee number.', say: 'Replace One I D with your employee number.', cue: 'oneid' },
      { t: 'Delete the existing Connections file and paste the new one.', cue: 'replace' },
    ],
    launch: [
      { t: 'Step five: log on.' },
      { t: 'From the Windows menu, open Analysis for Microsoft Excel and wait for it to load.', cue: 'analysis' },
      { t: 'Then open EPM add-in for Excel.', cue: 'epm' },
      { t: 'Excel should now show the EPM, Analysis and Analysis Design tabs.', cue: 'ribbon' },
    ],
    logon: [
      { t: 'Go to the EPM tab and click Log On.', cue: 'logon' },
      { t: 'Click the three-dots button.', cue: 'dots' },
      { t: 'Find P52 - BAT_HCT - HCT (SSO),', say: 'Find the connection P fifty-two, BAT H C T, H C T, S S O,', cue: 'manager' },
      { t: 'set it as default and click OK.', cue: 'default' },
      { t: 'And now: Log On.', cue: 'final' },
    ],
    hrinput: [
      { t: 'Now confirm your access by opening the HR Input report.', cue: 'intro' },
      { t: 'In the EPM tab, click Open, then Open Server Input Form Folder.', cue: 'open' },
      { t: 'Select 1. Headcount Tracker and click Open.', say: 'Select: one, Headcount Tracker, and click Open.', cue: 'tracker' },
      { t: "If Excel shows a security warning, click Enable Content. Without it, BPC won't work.", cue: 'enable' },
    ],
    selections: [
      { t: 'Now fill in the selections.', cue: 'fields' },
      { t: 'Category: BHI.', say: 'Category: B H I.', cue: 'cat' },
      { t: 'Entity: your market code, from this list.', cue: 'entity' },
      { t: 'Function: POS_TOTAL.', say: 'Function: P O S, total.', cue: 'fn' },
      { t: 'Cost Centre Function group: All Functions.', cue: 'ccfg' },
      { t: 'Then click Select, and your HR Input opens.', cue: 'select' },
    ],
    evidence: [
      { t: "That's it! You're in BPC.", cue: 'done' },
      { t: 'Take a screenshot of the HR Input view, with the EPM Context bar visible at the top.', cue: 'snip' },
      { t: 'Windows + Shift + S makes it quick.', say: 'Windows, Shift, S, makes it quick.', cue: 'keys' },
      { t: 'Send it to HRSS to confirm your access.', cue: 'send' },
    ],
    outro: [
      { t: 'Course, access, Analysis, connections and Log On.', cue: 'recap' },
      { t: 'If anything goes wrong along the way, reach out. Thank you!', cue: 'thanks' },
    ],
  },
};

export const VOICES: Record<Lang, { id: string; name: string }> = {
  en: { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian' },
};

/** Pronunciación: NEO, SAP y BAT se dicen como palabra; BPC, HR, EPM… se deletrean. Solo afecta la voz. */
export const speak = (text: string) => text
  .replace(/\bIDLookup\b/g, 'I D Lookup')
  .replace(/\bBAT_HCT\b/g, 'Bat H C T')
  .replace(/\bSAP\b/g, 'Sap').replace(/\bNEO\b/g, 'Neo').replace(/\bBAT\b/g, 'Bat')
  .replace(/\bBPC\b/g, 'B P C').replace(/\bHRSS\b/g, 'H R S S').replace(/\bHR\b/g, 'H R')
  .replace(/\bEPM\b/g, 'E P M').replace(/\bSSO\b/g, 'S S O').replace(/\bHCT\b/g, 'H C T');
