/* Construye dist/HRSS-Automatizador.html: un solo archivo con todo incluido (sin internet). */
'use strict';
const fs = require('fs');
const path = require('path');
const pkg = require('./package.json');

const src = (p) => fs.readFileSync(path.join(__dirname, 'src', p), 'utf8');
const scripts = [
  'vendor/xlsx.full.min.js', 'vendor/exceljs.min.js', 'vendor/jszip.min.js',
  'js/core.js', 'js/hc.js', 'js/recharges.js', 'js/reclass.js', 'js/chart.js', 'js/bulk.js', 'js/ui.js', 'js/ui-hc.js', 'js/ui-recharges.js', 'js/ui-reclass.js', 'js/ui-bulk.js', 'js/app.js'
];
// Evita que un "</script>" dentro de una librería cierre la etiqueta antes de tiempo
const safe = (code) => code.replace(/<\/script/gi, '<\\/script');
let html = src('index.html')
  .replace('/*@@CSS@@*/', () => src('styles.css'))
  .replace('v__VERSION__', 'v' + pkg.version)
  .replace('<script>/*@@SCRIPTS@@*/</script>', () => scripts.map((s) => '<script>/* ' + s + ' */\n' + safe(src(s)) + '\n</script>').join('\n'));
const out = path.join(__dirname, 'dist', 'HRSS-Automatizador.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('OK →', path.relative(__dirname, out), (fs.statSync(out).size / 1024 / 1024).toFixed(2) + ' MB');
