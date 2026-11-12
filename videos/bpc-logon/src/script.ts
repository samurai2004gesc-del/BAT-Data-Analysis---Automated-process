// Guion del video. Cada escena es una lista de segmentos:
//   t   = texto que se ve en subtítulos
//   say = cómo se pronuncia (si es distinto), solo para la voz
//   cue = nombre del momento; las animaciones se sincronizan con él
// scripts/voice.mjs genera el audio con ElevenLabs y los tiempos de cada segmento.

export type Seg = { t: string; say?: string; cue?: string };
export type Lang = 'es' | 'en';
export type SceneId =
  | 'intro' | 'roadmap' | 'course' | 'check' | 'request' | 'sysrole'
  | 'details' | 'install' | 'connections' | 'launch' | 'logon' | 'evidence' | 'outro';

export const SCENES: SceneId[] = [
  'intro', 'roadmap', 'course', 'check', 'request', 'sysrole', 'details',
  'install', 'connections', 'launch', 'logon', 'evidence', 'outro',
];

export const SCRIPT: Record<Lang, Record<SceneId, Seg[]>> = {
  es: {
    intro: [
      { t: 'Hola. En este video vas a configurar tu acceso a SAP BPC', cue: 'title' },
      { t: 'en cinco pasos sencillos.' },
      { t: 'Al final te pediremos una sola cosa:', cue: 'ask' },
      { t: 'una captura de pantalla que demuestre que pudiste entrar.', cue: 'shot' },
    ],
    roadmap: [
      { t: 'Este es el camino.' },
      { t: 'Uno: el curso de BPC en SuccessFactors.', cue: 'r1' },
      { t: 'Dos: la solicitud de acceso en SAP.', cue: 'r2' },
      { t: 'Tres: instalar SAP Analysis for Office.', cue: 'r3' },
      { t: 'Cuatro: el archivo de conexiones.', cue: 'r4' },
      { t: 'Y cinco: hacer Logon a BPC.', cue: 'r5' },
      { t: 'Vamos paso por paso.', cue: 'go' },
    ],
    course: [
      { t: 'Paso uno: el curso.' },
      { t: 'Entra a SuccessFactors y da clic en View My Learning.', cue: 'quick' },
      { t: 'En el buscador escribe BPC HR Online Learning y abre el curso.', cue: 'search' },
      { t: 'Son cuatro módulos y puede tomar hasta tres horas.', cue: 'course' },
      { t: 'Los módulos uno y cuatro terminan con un quiz que debes aprobar.', cue: 'quiz' },
      { t: 'Al terminar el módulo cuatro, toma captura de tu certificado', cue: 'cert' },
      { t: 'y envíala al equipo de HRSS.', cue: 'send' },
    ],
    check: [
      { t: 'Paso dos: el acceso a SAP.' },
      { t: 'Primero revisa si ya lo tienes.' },
      { t: 'En el portal NEO ve a Support, Access Management, IDLookup.', cue: 'support' },
      { t: 'Escribe tu nombre tal como aparece en Teams,', cue: 'lookup' },
      { t: 'da clic en Bulk Search y luego en tu ID.', cue: 'bulk' },
      { t: 'Si aparece bat-sapRoles-P52 con el rol de tu mercado,', say: 'Si aparece bat sap Roles P cincuenta y dos, con el rol de tu mercado,', cue: 'p52' },
      { t: 'ya tienes acceso: salta al paso tres.', cue: 'skip' },
    ],
    request: [
      { t: 'Si no lo tienes, abre NEO.', cue: 'neo' },
      { t: 'En Quick Links, entra a Access Requests', cue: 'quick' },
      { t: 'y después a Access Request Creation.', cue: 'arc' },
      { t: 'En Description escribe tu nombre, tu puesto y para qué necesitas el acceso.', cue: 'form' },
      { t: 'Request Type: New Account. Request For: Self.', cue: 'fields' },
      { t: 'Functional Area: Human Resources.', cue: 'area' },
    ],
    sysrole: [
      { t: 'En la pestaña User Access, da clic en Add y elige System.', cue: 'addsys' },
      { t: 'Busca P52 Client 100 y pásalo a Selected con la flecha.', say: 'Busca P cincuenta y dos Client cien, y pásalo a Selected con la flecha.', cue: 'p52' },
      { t: 'Da OK.', cue: 'ok' },
      { t: 'Ahora Add, y esta vez Role.', cue: 'addrole' },
      { t: 'Copia el rol de tu mercado de esta lista.', cue: 'roles' },
      { t: 'Pégalo en Role / Profile Name y da Search.', say: 'Pégalo en Role Profile Name y da Search.', cue: 'search' },
      { t: 'Selecciona el que dice P52 Client 100 y bájalo con la flecha.', say: 'Selecciona el que dice P cincuenta y dos Client cien, y bájalo con la flecha.', cue: 'avail' },
    ],
    details: [
      { t: 'En User Details, elige la compañía de tu mercado', cue: 'details' },
      { t: 'y escribe HR en Function.', say: 'y escribe H R en Function.', cue: 'function' },
      { t: 'En User System Details, abre el selector de User Group.', cue: 'usersys' },
      { t: 'Busca tu país entre asteriscos, por ejemplo *Mexico*,', say: 'Busca tu país entre asteriscos, por ejemplo: asterisco México asterisco,', cue: 'group' },
      { t: 'elige el grupo de HR y da OK.', say: 'elige el grupo de H R y da OK.', cue: 'hr' },
      { t: 'Por último, da clic en Submit.', cue: 'submit' },
      { t: 'Tu solicitud se envía para aprobación.', cue: 'sent' },
    ],
    install: [
      { t: 'Paso tres: instala SAP Analysis for Office.' },
      { t: 'Abre el menú de Windows, escribe BAT Company Portal y ábrelo.', cue: 'start' },
      { t: 'Si aparece esta ventana, elige BAT Company Portal.', cue: 'popup' },
      { t: 'En el buscador del portal escribe Analysis y presiona Enter.', cue: 'portal' },
      { t: 'Elige la versión de 64 o de 32 bits: la misma que tu Excel.', cue: 'results' },
      { t: 'Para saberlo, en Excel ve a Archivo, Cuenta, Acerca de Excel.', cue: 'about' },
      { t: 'Instala la aplicación y reinicia tu computadora. No te saltes este paso.', cue: 'restart' },
    ],
    connections: [
      { t: 'Paso cuatro: el archivo de conexiones.' },
      { t: 'Cierra todas las ventanas de Excel.', cue: 'close' },
      { t: 'Descarga el archivo Connections del módulo Library Resources en SharePoint.', cue: 'download' },
      { t: 'Abre el explorador de archivos y pega esta ruta en la barra de dirección.', cue: 'path' },
      { t: 'Cambia OneID por tu número de empleado.', say: 'Cambia One I D por tu número de empleado.', cue: 'oneid' },
      { t: 'Borra el archivo Connections que ya existe y pega el nuevo.', cue: 'replace' },
    ],
    launch: [
      { t: 'Paso cinco: el Logon.' },
      { t: 'Desde el menú de Windows abre Analysis for Microsoft Excel y espera a que cargue.', cue: 'analysis' },
      { t: 'Después abre EPM add-in for Excel.', say: 'Después abre E P M add-in for Excel.', cue: 'epm' },
      { t: 'En Excel deben aparecer las pestañas EPM, Analysis y Analysis Design.', say: 'En Excel deben aparecer las pestañas E P M, Analysis y Analysis Design.', cue: 'ribbon' },
    ],
    logon: [
      { t: 'Ve a la pestaña EPM y da clic en Log On.', say: 'Ve a la pestaña E P M y da clic en Log On.', cue: 'logon' },
      { t: 'Da clic en el botón de los tres puntos.', cue: 'dots' },
      { t: 'Busca P52 - BAT_HCT - HCT (SSO),', say: 'Busca la conexión P cincuenta y dos, BAT H C T, H C T, S S O,', cue: 'manager' },
      { t: 'márcala con Set as Default y da OK.', cue: 'default' },
      { t: 'Ahora sí: Log On.', cue: 'final' },
    ],
    evidence: [
      { t: '¡Listo! Ya estás dentro de BPC.', cue: 'done' },
      { t: 'Toma una captura de pantalla donde se vea la conexión.', cue: 'snip' },
      { t: 'Con Windows + Shift + S es muy rápido.', say: 'Con Windows, Shift, S, es muy rápido.', cue: 'keys' },
      { t: 'Envíala a HRSS para confirmar tu acceso.', cue: 'send' },
    ],
    outro: [
      { t: 'Curso, acceso, Analysis, conexiones y Logon.', cue: 'recap' },
      { t: 'Si algo falla en el camino, escríbenos. ¡Gracias!', cue: 'thanks' },
    ],
  },
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
      { t: 'Go to SuccessFactors and click View My Learning.', cue: 'quick' },
      { t: 'Search for BPC HR Online Learning and open the course.', cue: 'search' },
      { t: 'It has four modules and can take up to three hours.', cue: 'course' },
      { t: 'Modules one and four end with a quiz you need to pass.', cue: 'quiz' },
      { t: 'When you finish module four, take a screenshot of your certificate', cue: 'cert' },
      { t: 'and send it to the HRSS team.', cue: 'send' },
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
      { t: 'Request Type: New Account. Request For: Self.', cue: 'fields' },
      { t: 'Functional Area: Human Resources.', cue: 'area' },
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
      { t: 'and type HR as the Function.', cue: 'function' },
      { t: 'In User System Details, open the User Group picker.', cue: 'usersys' },
      { t: 'Search for your country between asterisks, for example *Mexico*,', say: 'Search for your country between asterisks, for example: asterisk Mexico asterisk,', cue: 'group' },
      { t: 'choose the HR group and click OK.', cue: 'hr' },
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
    evidence: [
      { t: "Done! You're in BPC.", cue: 'done' },
      { t: 'Take a screenshot that shows the connection.', cue: 'snip' },
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
  es: { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  en: { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda' },
};
