/* Genera docs/Guia-HRSS-Automatizador.pdf a partir de docs/guia/guia.html.
 * Toma capturas de cada pantalla de la app (dist/HRSS-Automatizador.html) y las incrusta en la guía.
 * Requiere Playwright con Chromium.  Uso: npm run build && npm run guide && npm run build
 * (el segundo build mete el PDF nuevo dentro de la app). */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const pkg = require('../../package.json');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'dist', 'HRSS-Automatizador.html');
const SRC = path.join(ROOT, 'docs', 'guia', 'guia.html');
const OUT = path.join(ROOT, 'docs', 'Guia-HRSS-Automatizador.pdf');
const PAGES = ['home', 'config', 'hc', 'tracker', 'sap', 'reclass', 'bulk', 'pbi'];
const MAX_H = 400; // alto máximo de cada captura (px CSS)

(async () => {
  if (!fs.existsSync(APP)) throw new Error('Primero corre npm run build');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.25, locale: 'es-MX' });
  const page = await ctx.newPage();
  await page.goto('file://' + APP);
  const shots = {};
  for (const id of PAGES) {
    await page.evaluate((p) => { sessionStorage.setItem('hrss-page', p); }, id);
    await page.reload();
    await page.waitForSelector('#page-' + id + '.active');
    await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.innerHTML = ''; });
    const box = await page.locator('#page-' + id).boundingBox();
    const buf = await page.screenshot({ type: 'jpeg', quality: 68, clip: { x: box.x - 8, y: Math.max(0, box.y - 8), width: box.width + 16, height: Math.min(box.height + 16, MAX_H) } });
    shots[id] = 'data:image/jpeg;base64,' + buf.toString('base64');
  }
  await page.evaluate(() => sessionStorage.clear());
  let html = fs.readFileSync(SRC, 'utf8')
    .replace(/\{\{VERSION\}\}/g, pkg.version)
    .replace(/\{\{img:(\w+)\}\}/g, (m, id) => { if (!shots[id]) throw new Error('Sin captura: ' + id); return shots[id]; });
  const doc = await ctx.newPage();
  await doc.setContent(html, { waitUntil: 'load' });
  await doc.pdf({
    path: OUT, format: 'Letter', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font:8px Inter,Arial,sans-serif;color:#8a96a3;padding:0 16mm;display:flex;justify-content:space-between"><span>Guía rápida · HRSS Automatizador v' + pkg.version + '</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'
  });
  await browser.close();
  console.log('OK →', path.relative(ROOT, OUT), (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
})().catch((e) => { console.error(e); process.exit(1); });
