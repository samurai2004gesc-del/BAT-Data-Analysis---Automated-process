/* Prueba de punta a punta en Chromium: abre dist/HRSS-Automatizador.html como archivo local,
 * carga los ejemplos en cada pantalla y verifica las descargas.
 * Uso: node tests/e2e.js [carpeta_capturas] */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const JSZip = require('jszip');

const ROOT = path.join(__dirname, '..');
const EX = (n) => path.join(ROOT, 'ejemplos', n);
const shots = process.argv[2];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => {
    class MemFile { constructor(n) { this.kind = 'file'; this.name = n; this.data = null; }
      async createWritable() { const self = this; const chunks = []; return { write: async (d) => { chunks.push(d); }, close: async () => { self.data = new Blob(chunks); } }; }
      async getFile() { return new File([this.data || ''], this.name); } }
    class MemDir { constructor(n) { this.kind = 'directory'; this.name = n; this.children = new Map(); }
      async getDirectoryHandle(n, o) { let c = this.children.get(n); if (!c) { if (!(o && o.create)) throw new DOMException('no existe', 'NotFoundError'); c = new MemDir(n); this.children.set(n, c); } return c; }
      async getFileHandle(n, o) { let c = this.children.get(n); if (!c) { if (!(o && o.create)) throw new DOMException('no existe', 'NotFoundError'); c = new MemFile(n); this.children.set(n, c); } return c; }
      async *entries() { for (const e of this.children) yield e; }
      async queryPermission() { return 'granted'; } async requestPermission() { return 'granted'; } }
    const root = new MemDir('General'); const t = new MemDir('Tracker'); const y = new MemDir('2026'); y.children.set('Tracker', t); root.children.set('2026', y);
    window.__memRoot = root;
    window.__memList = () => { const out = []; const walk = (d, pre) => d.children.forEach((v, k) => (v.kind === 'file' ? out.push(pre + k) : walk(v, pre + k + '/'))); walk(root, ''); return out.sort(); };
    window.__memRead = async (pathStr) => { let d = root; const parts = pathStr.split('/'); const last = parts.pop(); for (const q of parts) d = d.children.get(q); return await d.children.get(last).data.text(); };
    window.showDirectoryPicker = async () => root;
  });
  await page.goto('file://' + path.join(ROOT, 'dist', 'HRSS-Automatizador.html'));
  if (process.env.DBG) { page.on('console', (m) => console.log('   [console]', m.text())); await page.evaluate(() => { const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { console.log('a.click download=' + this.download + ' href=' + this.href.slice(0, 30)); return o.call(this); }; }); }
  const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: true }); };
  const upload = (zone, files) => page.setInputFiles(zone + ' input[type=file]', files);
  const download = async (btn) => { const [d] = await Promise.all([page.waitForEvent('download'), page.click(btn)]); const p = await d.path(); console.log('  descarga:', d.suggestedFilename(), d.url().slice(0, 60)); return { name: d.suggestedFilename(), path: p }; };
  const check = (cond, msg) => { if (!cond) throw new Error('FALLÓ: ' + msg); console.log('✔', msg); };

  await shot('01-inicio');

  // ---- Headcount ----
  await page.click('#nav a[data-page=hc]');
  await page.selectOption('#hc-market', 'CAR');
  await page.fill('#hc-year', '2026');
  await page.dispatchEvent('#hc-year', 'change');
  await page.fill('#hc-soplabel', "SOP9'26");
  await page.dispatchEvent('#hc-soplabel', 'change');
  await upload('#hc-drop-input', EX('01 HR Input Report CAR (ejemplo).xlsx'));
  await page.waitForSelector('#hc-input-info .msg.ok');
  check((await page.textContent('#hc-input-info')).includes('12'), 'HC: 12 posiciones leídas');
  await upload('#hc-drop-app', EX('02 Maestro HC CAR - catalogo aprobado (ejemplo).xlsx'));
  await page.waitForSelector('#hc-app-info .msg.ok');
  check(await page.$eval('#hc-col-sop', (s) => s.options[s.selectedIndex].text.includes("SOP9'26")), 'HC: columna SOP vigente detectada');
  // Equivalencias de entidad del aprobado (los códigos de país)
  for (const [k, v] of [['GY', 'Guyana'], ['JM', 'Jamaica'], ['TT', 'Trinidad Comercial'], ['TTO', 'Trinidad Operación']]) {
    await page.fill('input[data-map=entityMapApp][data-k="' + k + '"]', v);
    await page.dispatchEvent('input[data-map=entityMapApp][data-k="' + k + '"]', 'change');
  }
  await page.click('#hc-run');
  await page.waitForSelector('#hc-blocks .block');
  await shot('02-headcount');
  check((await page.textContent('#hc-blocks')).includes('NEEDS ADJUSTMENTS'), 'HC: semáforo calculado');
  await page.selectOption('#hc-f-entity', 'Guyana');
  check((await page.textContent('#hc-blocks')).includes('Grade 31'), 'HC: filtro por entidad');
  const hcFile = await download('#hc-download');
  const hcWb = XLSX.readFile(hcFile.path);
  check(hcWb.SheetNames[0] === 'Resumen' && hcFile.name.startsWith('HC Variations CAR'), 'HC: reporte Excel descargado (' + hcFile.name + ')');
  check((await page.textContent('#hc-changes')).includes('Primera corrida'), 'HC: primera corrida sin comparación');
  await page.fill('#hc-mail-to', 'hrbp.car@example.com');
  const hcMail = await download('#hc-mail');
  const hcEml = fs.readFileSync(hcMail.path, 'utf8');
  check(hcMail.name.endsWith('.eml') && /^X-Unsent: 1/.test(hcEml) && hcEml.includes('To: hrbp.car@example.com') && hcEml.includes('filename="HC Variations CAR'), 'HC: borrador .eml con reporte adjunto');
  // Segunda corrida con otro HR Input (falta una posición) → muestra cambios
  const wbIn = XLSX.readFile(EX('01 HR Input Report CAR (ejemplo).xlsx'));
  const aoa = XLSX.utils.sheet_to_json(wbIn.Sheets[wbIn.SheetNames[0]], { header: 1, raw: true, defval: null });
  aoa.splice(40, 1); // quita la posición de Finance Grade 36 (multiplicador 2)
  const wb2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(aoa), 'HR Input');
  const in2 = path.join(require('os').tmpdir(), 'HR Input CAR v2.xlsx'); XLSX.writeFile(wb2, in2);
  await upload('#hc-drop-input', in2);
  await page.waitForTimeout(300);
  await page.click('#hc-run');
  await page.waitForSelector('#hc-changes h3');
  check((await page.textContent('#hc-changes')).includes('Grade 36'), 'HC: segunda corrida muestra qué cambió');
  // Varios mercados
  await page.click('#hc-tabs button[data-tab=many]');
  await page.setInputFiles('#hcb-drop input[type=file]', [EX('01 HR Input Report CAR (ejemplo).xlsx'), EX('02 Maestro HC CAR - catalogo aprobado (ejemplo).xlsx')]);
  await page.waitForSelector('#hcb-files table');
  await page.selectOption('#hcb-files select[data-bm="1"]', 'CAR');
  await page.click('#hcb-run');
  await page.waitForSelector('#hcb-results table');
  await shot('02b-hc-varios');
  const batch = await download('#hcb-download');
  check(XLSX.readFile(batch.path).SheetNames.join(',') === 'Resumen mercados,CAR,Alertas', 'HC varios mercados: reporte consolidado (' + batch.name + ')');
  await page.click('#hc-tabs button[data-tab=one]');

  // ---- Tracker ----
  await page.click('#nav a[data-page=tracker]');
  await page.fill('#tr-year', '2026');
  await upload('#tr-drop', EX('03 Asignaciones a recobrar (ejemplo).xlsx'));
  await page.waitForSelector('#tr-preview table');
  await shot('03-tracker');
  const tr = await download('#tr-download');
  check(XLSX.readFile(tr.path).SheetNames.includes('Resumen por área'), 'Tracker descargado (' + tr.name + ')');
  // Simula captura manual en el tracker y lo vuelve a cargar como "anterior"
  const trWb = XLSX.readFile(tr.path);
  const trWs = trWb.Sheets[trWb.SheetNames[0]];
  const trRows = XLSX.utils.sheet_to_json(trWs, { header: 1, defval: null });
  const ridCol = trRows[2].indexOf('Recharge ID (Webi)');
  trWs[XLSX.utils.encode_cell({ r: 3, c: ridCol })] = { t: 's', v: '000002052572' };
  const trPrev = path.join(require('os').tmpdir(), 'Tracker anterior.xlsx'); XLSX.writeFile(trWb, trPrev);
  await upload('#tr-drop-prev', trPrev);
  await page.waitForSelector('#tr-prev-info .msg.ok');
  check((await page.textContent('#tr-prev-info')).includes('4 conservan'), 'Tracker: conserva lo capturado del anterior');
  check((await page.textContent('#tr-preview')).includes('Seguir aprobaciones'), 'Tracker: siguiente paso calculado');

  // ---- Formatos SAP ----
  await page.click('#nav a[data-page=sap]');
  await page.fill('#sap-host', 'Colombia');
  await page.dispatchEvent('#sap-host', 'change');
  await upload('#sap-drop', EX('04 Estimate Benefits (ejemplo).xlsx'));
  await page.waitForSelector('#sap-list .filecard');
  await shot('04-formatos-sap');
  check((await page.textContent('#sap-list')).includes("Recharge H2'26 Perez J.") || (await page.textContent('#sap-list')).includes("Recharge H1'26 Perez J."), 'SAP: Note Title generado');
  const zip = await download('#sap-zip');
  const z = await JSZip.loadAsync(fs.readFileSync(zip.path));
  const files = Object.keys(z.files).filter((n) => !n.endsWith('/'));
  check(files.length === 7 && files.some((f) => f.endsWith('1. Webi Perez Lopez Juan Carlos.txt')), 'SAP: ZIP con 7 archivos (' + zip.name + ')');

  // ---- Reclasificación ----
  await page.click('#nav a[data-page=reclass]');
  await page.selectOption('#rc-month', '6');
  await page.fill('#rc-year', '2026');
  await page.dispatchEvent('#rc-year', 'change');
  await upload('#rc-drop-sup', EX('05 K2 MX15 (ejemplo).xlsx'));
  await upload('#rc-drop-hist', EX('06 ConsolidadoCharges (ejemplo).xlsx'));
  await upload('#rc-drop-cecos', EX('07 All CeCos - Approvers (ejemplo).xlsx'));
  await page.waitForSelector('#rc-a-preview table');
  await page.click('#rc-a-email');
  await shot('05-reclas-a');
  const sent = await download('#rc-a-download');
  check(sent.name === 'Sent to HRBPs - MX15 K2.xlsx', 'Reclas A: ' + sent.name);
  // B: usa el archivo enviado como si fuera la respuesta
  await page.click('#rc-tabs button[data-tab=b]');
  await upload('#rc-drop-ret', sent.path);
  await page.waitForSelector('#rc-b-emails .msg');
  await shot('06-reclas-b');
  check((await page.textContent('#rc-b-emails')).includes('CeCo incorrecto'), 'Reclas B: detecta CeCos fuera de MX15');
  await page.click('#rc-tabs button[data-tab=c]');
  await upload('#rc-drop-ksb1', EX('08 KSB1 EXPORT (ejemplo).xlsx'));
  await page.waitForSelector('#rc-ksb1-lines table');
  await page.check('#rc-ksb1-lines input[data-k="0"]');
  await page.waitForTimeout(200);
  await shot('07-reclas-c');
  const rate = Number(await page.inputValue('#rc-rate'));
  check(Math.abs(rate - 23.1) < 0.01, 'Reclas C: tipo de cambio ' + rate);
  const rcl = await download('#rc-c-download');
  check(XLSX.readFile(rcl.path).SheetNames[0] === 'Reclasificacion por CeCo', 'Reclas C: ' + rcl.name);
  await page.click('#rc-tabs button[data-tab=d]');
  await page.setInputFiles('#rc-drop-ev input[type=file]', [EX('05 K2 MX15 (ejemplo).xlsx'), sent.path, rcl.path]);
  await page.waitForSelector('#rc-ev-result .checklist');
  await shot('08-reclas-d');

  // ---- Bulk: todo el año ----
  await page.click('#nav a[data-page=bulk]');
  await page.fill('#bk-year', '2026');
  await page.setInputFiles('#bk-folder', path.join(ROOT, 'ejemplos'));
  await page.waitForFunction(() => /\d+<\/b> archivo/.test(document.querySelector('#bk-queue').innerHTML));
  await page.click('#bk-run');
  await page.waitForSelector('#bk-results .block');
  await shot('11-bulk');
  const bkText = await page.textContent('#bk-results');
  check(/Cargos de proveedores por mes|Sin cargos de proveedores con mes/.test(bkText), 'Bulk: sección de gráfica presente');
  check(/Correo de Global/.test(bkText) && /Export KSB1/.test(bkText) && /HR Input Report/.test(bkText), 'Bulk: reconoce correo, KSB1 y HR Input de la carpeta de ejemplos');
  const bk = await download('#bk-download');
  check(XLSX.readFile(bk.path).SheetNames.includes('Inventario'), 'Bulk: consolidado anual (' + bk.name + ')');

  // ---- Power BI ----
  await page.click('#nav a[data-page=pbi]');
  await page.waitForSelector('#pbi-preview svg.pbi-page');
  check((await page.textContent('#pbi-app-status')).includes('archivos analizados'), 'Power BI: detecta datos de Bulk y Headcount');
  await page.fill('#pbi-name', 'HRSS Prueba');
  await page.dispatchEvent('#pbi-name', 'change');
  await shot('12-powerbi');
  const pbiZip = await download('#pbi-generate');
  const pz = await JSZip.loadAsync(fs.readFileSync(pbiZip.path));
  const pfiles = [];
  for (const n of Object.keys(pz.files).filter((n) => !n.endsWith('/'))) pfiles.push({ path: n.replace(/^Power BI\/HRSS Prueba\//, ''), data: await pz.file(n).async('uint8array') });
  const res = require('./pbi-check.js').check({ name: 'HRSS Prueba', files: pfiles });
  check(res.errors.length === 0 && pfiles.some((f) => f.path === 'HRSS Prueba.pbip'), 'Power BI: proyecto del navegador válido (' + pfiles.length + ' archivos)' + (res.errors.length ? ' ' + res.errors.slice(0, 3).join(' | ') : ''));
  await page.click('#pbi-tabs button[data-tab=files]');
  await page.setInputFiles('#pbi-drop input[type=file]', [EX('08 KSB1 EXPORT (ejemplo).xlsx'), EX('07 All CeCos - Approvers (ejemplo).xlsx')]);
  await page.waitForSelector('#pbi-files-list table');
  const gZip = await download('#pbi-generate');
  const gz = await JSZip.loadAsync(fs.readFileSync(gZip.path));
  const gname = Object.keys(gz.files).find((n) => n.endsWith('.pbip')).split('/').pop().replace('.pbip', '');
  const gfiles = [];
  for (const n of Object.keys(gz.files).filter((n) => !n.endsWith('/'))) gfiles.push({ path: n.split('/').slice(2).join('/'), data: await gz.file(n).async('uint8array') });
  const gres = require('./pbi-check.js').check({ name: gname, files: gfiles });
  check(gres.errors.length === 0, 'Power BI: proyecto genérico desde archivos válido' + (gres.errors.length ? ' ' + gres.errors.slice(0, 3).join(' | ') : ''));

  // ---- Guardar directo en la carpeta Tracker (OneDrive simulado) ----
  await page.click('#nav a[data-page=config]');
  await page.click('#cfg-folder-pick');
  await page.waitForFunction(() => document.querySelector('#folder-ind').textContent.includes('General'));
  check(true, 'Carpeta elegida: ' + (await page.textContent('#folder-ind')));
  await page.fill('#cfg-contacts', 'Laura Mendez Ruiz; laura.mendez@example.com\nCarlos Ortega Paz; carlos.ortega@example.com');
  await page.dispatchEvent('#cfg-contacts', 'change');
  await page.fill('#cfg-planning', 'planning@example.com');
  await page.dispatchEvent('#cfg-planning', 'change');
  await shot('10-config-carpeta');
  await page.click('#nav a[data-page=sap]');
  await page.click('#sap-zip');
  await page.waitForSelector('#sap-log .msg.ok');
  await page.click('#nav a[data-page=tracker]');
  await page.click('#tr-download');
  await page.waitForTimeout(800);
  await page.click('#nav a[data-page=reclass]');
  await page.click('#rc-tabs button[data-tab=a]');
  await page.click('#rc-a-download');
  await page.waitForTimeout(500);
  const aMail = await download('#rc-a-eml');
  const aEml = fs.readFileSync(aMail.path, 'utf8');
  check(aEml.includes('laura.mendez@example.com') && aEml.includes('filename="Sent to HRBPs - MX15 K2.xlsx"'), 'Reclas A: borrador .eml a HRBPs con adjunto');
  check((await page.textContent('#rc-a-mailinfo')).includes('Sofia Navarro Gil'), 'Reclas A: avisa nombres sin correo');
  await page.click('#rc-tabs button[data-tab=c]');
  await page.click('#rc-c-download');
  await page.waitForTimeout(500);
  const cMail = await download('#rc-c-eml');
  check(fs.readFileSync(cMail.path, 'utf8').includes('To: planning@example.com'), 'Reclas C: borrador para Planning');
  await page.click('#rc-tabs button[data-tab=d]');
  await page.click('#rc-ev-check');
  await page.waitForSelector('#rc-ev-result .checklist');
  check((await page.textContent('#rc-ev-result')).includes('2 de 6'), 'Checklist leído desde la carpeta: ' + (await page.textContent('#rc-ev-result .msg')));
  const mem = await page.evaluate(() => window.__memList());
  const expect = [
    "2026/Tracker/Recharges/H2'26/Tracker Recharges H226.xlsx",
    "2026/Tracker/Recharges/H2'26/Webis/1. Perez Lopez Juan Carlos/1. Webi Perez Lopez Juan Carlos.txt",
    "2026/Tracker/Recharges/H2'26/JVUs/1. Perez Lopez Juan Carlos/1. JVU Perez Lopez Juan Carlos.xlsx",
    '2026/Tracker/Suppliers/06. Junio/K2/Sent to HRBPs - MX15 K2.xlsx',
    '2026/Tracker/Suppliers/06. Junio/K2/Reclasificacion por CeCo.xlsx'
  ];
  check(expect.every((e) => mem.includes(e)), 'Archivos guardados en sus carpetas (' + mem.length + '): ' + expect.filter((e) => !mem.includes(e)).join(' | '));
  // Bulk escaneando la carpeta elegida
  await page.click('#nav a[data-page=bulk]');
  await page.click('#bk-reset');
  await page.click('#bk-scan');
  await page.waitForFunction(() => /\d+<\/b> archivo/.test(document.querySelector('#bk-queue').innerHTML));
  await page.click('#bk-run');
  await page.waitForSelector('#bk-results .block');
  const learnedTxt = (await page.textContent('#bk-results .learned').catch(() => '')) || '';
  check(/Lo que aprendí/.test(learnedTxt) && /\d+ personas/.test(learnedTxt), 'Bulk: muestra lo aprendido (' + (learnedTxt.match(/\d+ personas[^·]*/) || [''])[0].trim() + ')');
  check(/Sent to HRBPs/.test(await page.textContent('#bk-results')), 'Bulk: escanea la carpeta del año (' + (await page.textContent('#bk-progress-text')) + ')');
  // Volver a guardar pregunta antes de reemplazar (el diálogo se acepta)
  await page.click('#nav a[data-page=sap]');
  await page.click('#sap-zip');
  await page.waitForSelector('#sap-log .msg.ok');
  check(true, 'Reemplazo con confirmación');

  // ---- Configuración ----
  await page.click('#nav a[data-page=config]');
  await page.fill('#cfg-oneid', '12345678');
  await page.dispatchEvent('#cfg-oneid', 'change');
  const cfgFile = await download('#cfg-export');
  const cfg = JSON.parse(fs.readFileSync(cfgFile.path, 'utf8'));
  check(cfg.oneId === '12345678' && cfg.hc.profiles.CAR.entityMapApp.GY === 'Guyana', 'Config: exporta equivalencias guardadas');
  await shot('09-config');

  // ---- Macro y guía incluidas ----
  await page.click('#nav a[data-page=sap]');
  const bas = await download('#sap-macro');
  const basBytes = fs.readFileSync(bas.path);
  const basText = basBytes.toString('latin1');
  check(bas.name === 'HRSS_FormatosSAP.bas' && /^Attribute VB_Name = "HRSS_FormatosSAP"\r\n/.test(basText) && /Sub GenerarFormatosSAP/.test(basText) && !/\n(?<!\r)/.test(basText.replace(/\r\n/g, '')) && !basBytes.includes(Buffer.from([0xC3, 0xA1])),
    'Macro .bas: ANSI (Windows-1252) con CRLF');
  await page.click('#nav a[data-page=help]');
  const pdf = await download('#page-help [data-guide=download]');
  check(/\.pdf$/.test(pdf.name) && fs.readFileSync(pdf.path).subarray(0, 5).toString() === '%PDF-', 'Guía PDF incluida (' + (fs.statSync(pdf.path).size / 1024).toFixed(0) + ' KB)');

  check(errors.length === 0, 'Sin errores de JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
