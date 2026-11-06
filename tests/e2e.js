/* Prueba de punta a punta en Chromium: abre dist/HRSS-Automatizador.html como archivo local,
 * carga los ejemplos en cada pantalla y verifica las descargas.
 * Uso: node tests/e2e.js [carpeta_capturas] */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

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

  // ---- Tracker ----
  await page.click('#nav a[data-page=tracker]');
  await page.fill('#tr-year', '2026');
  await upload('#tr-drop', EX('03 Asignaciones a recobrar (ejemplo).xlsx'));
  await page.waitForSelector('#tr-preview table');
  await shot('03-tracker');
  const tr = await download('#tr-download');
  check(XLSX.readFile(tr.path).SheetNames.includes('Resumen por área'), 'Tracker descargado (' + tr.name + ')');

  // ---- Formatos SAP ----
  await page.click('#nav a[data-page=sap]');
  await page.fill('#sap-host', 'Colombia');
  await page.dispatchEvent('#sap-host', 'change');
  await upload('#sap-drop', EX('04 Estimate Benefits (ejemplo).xlsx'));
  await page.waitForSelector('#sap-list .filecard');
  await shot('04-formatos-sap');
  check((await page.textContent('#sap-list')).includes("Recharge H2'26 Perez J.") || (await page.textContent('#sap-list')).includes("Recharge H1'26 Perez J."), 'SAP: Note Title generado');
  const zip = await download('#sap-zip');
  const JSZip = require('jszip');
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

  // ---- Configuración ----
  await page.click('#nav a[data-page=config]');
  await page.fill('#cfg-oneid', '12345678');
  await page.dispatchEvent('#cfg-oneid', 'change');
  const cfgFile = await download('#cfg-export');
  const cfg = JSON.parse(fs.readFileSync(cfgFile.path, 'utf8'));
  check(cfg.oneId === '12345678' && cfg.hc.profiles.CAR.entityMapApp.GY === 'Guyana', 'Config: exporta equivalencias guardadas');
  await shot('09-config');

  check(errors.length === 0, 'Sin errores de JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
