/* Genera src/js/icons.js con los íconos de línea que usa la app (Lucide, licencia ISC).
 * Los trazos se copian una sola vez del paquete lucide-react para que la app siga funcionando sin internet.
 * Uso: node tools/iconos/generar-iconos.js [ruta a node_modules/lucide-react]
 * (por defecto usa el que instala el proyecto del video: videos/bpc-logon/node_modules/lucide-react). */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const PKG = path.resolve(process.argv[2] || path.join(ROOT, 'videos', 'bpc-logon', 'node_modules', 'lucide-react'));
const OUT = path.join(ROOT, 'src', 'js', 'icons.js');
// Nombre en la app -> ícono de Lucide
const ICONS = {
  home: 'house', headcount: 'users', tracker: 'clipboard-list', sap: 'file-output', reclass: 'arrow-left-right',
  bulk: 'layers', pbi: 'chart-column', settings: 'settings', help: 'circle-help', guide: 'book-open',
  play: 'play', download: 'download', upload: 'upload', mail: 'mail', folder: 'folder', 'folder-open': 'folder-open',
  search: 'search', stop: 'square', save: 'save', x: 'x', check: 'check', ok: 'circle-check', warn: 'triangle-alert',
  loader: 'loader-circle', copy: 'copy', minus: 'circle-minus', info: 'info', plus: 'plus', trash: 'trash-2', macro: 'file-code'
};

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function iconBody(name) {
  const file = path.join(PKG, 'dist', 'esm', 'icons', name + '.mjs');
  const src = fs.readFileSync(file, 'utf8');
  const alias = src.match(/export \{ default \} from '\.\/([\w-]+)\.mjs'/); // nombre viejo -> nombre nuevo
  if (alias) return iconBody(alias[1]);
  const m = src.match(/const __iconData = (\{[\s\S]*?\});\s*\n/);
  if (!m) throw new Error('Formato no reconocido: ' + file);
  const data = vm.runInNewContext('(' + m[1] + ')', Object.create(null), { timeout: 1000 });
  return data.node.map(([tag, attrs]) => '<' + tag + Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => ' ' + k + '="' + esc(v) + '"').join('') + '/>').join('');
}

const pkg = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8'));
const license = fs.readFileSync(path.join(PKG, 'LICENSE'), 'utf8').trim().split('\n').map((l) => ' * ' + l).join('\n').replace(/ +$/gm, '');
const body = Object.entries(ICONS).map(([k, n]) => '    ' + JSON.stringify(k) + ': ' + JSON.stringify(iconBody(n))).join(',\n');
const js = `/* Íconos de línea de la app. GENERADO por tools/iconos/generar-iconos.js (no editar a mano).
 * Trazos de Lucide v${pkg.version} (https://lucide.dev), licencia ISC:
 *
${license}
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Icons = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const D = {
${body}
  };
  /** Ícono como SVG en línea (hereda el color del texto). */
  function svg(name, cls) {
    const b = D[name];
    if (!b) return '';
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + b + '</svg>';
  }
  /** Reemplaza <i data-i="nombre"></i> por el ícono (en el HTML se hace al construir; esto es por si acaso). */
  function apply(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('i[data-i]').forEach((el) => { el.outerHTML = svg(el.getAttribute('data-i'), el.className); });
  }
  /** Para el HTML de origen: cambia los marcadores al construir la app. */
  function inline(html) { return String(html).replace(/<i data-i="([\\w-]+)"(?: class="([^"]*)")?><\\/i>/g, (m, n, c) => { if (!D[n]) throw new Error('Ícono desconocido: ' + n); return svg(n, c); }); }
  return { svg, apply, inline, names: Object.keys(D) };
});
`;
fs.writeFileSync(OUT, js);
console.log('OK →', path.relative(ROOT, OUT), Object.keys(ICONS).length + ' íconos (' + (js.length / 1024).toFixed(1) + ' KB)');
