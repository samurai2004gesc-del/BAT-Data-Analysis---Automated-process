/* Utilidades de interfaz y configuración persistente. */
(function (root) {
  'use strict';
  const Core = root.Core;
  const KEY = 'hrss-automatizador-config-v1';

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function num(n, d) {
    if (n === null || n === undefined || n === '') return '';
    const v = Number(n);
    if (!isFinite(v)) return esc(n);
    return v.toLocaleString('es-MX', { minimumFractionDigits: d === undefined ? 0 : d, maximumFractionDigits: d === undefined ? 2 : d });
  }
  function toast(text, type, ms) {
    const box = $('#toast');
    const m = document.createElement('div');
    m.className = 'msg ' + (type || 'info');
    m.textContent = text;
    box.appendChild(m);
    setTimeout(() => m.remove(), ms || 4500);
  }
  function msg(el, html, type) {
    if (typeof el === 'string') el = $(el);
    el.innerHTML += '<div class="msg ' + (type || 'info') + '">' + html + '</div>';
  }
  function clear(el) { if (typeof el === 'string') el = $(el); el.innerHTML = ''; }

  /** Tabla HTML. cols: [{h, k|f(row), cls(row)->string, num:bool, d:decimales}] */
  function table(cols, rows, opts) {
    opts = opts || {};
    let html = '<table class="t"><thead><tr>' + cols.map((c) => '<th' + (c.num ? ' class="num"' : '') + '>' + esc(c.h) + '</th>').join('') + '</tr></thead><tbody>';
    const lim = opts.limit || 2000;
    rows.slice(0, lim).forEach((r) => {
      html += '<tr' + (opts.rowCls ? ' class="' + opts.rowCls(r) + '"' : '') + '>' + cols.map((c) => {
        let v = c.f ? c.f(r) : r[c.k];
        const cls = [c.num ? 'num' : '', c.cls ? c.cls(r) : ''].filter(Boolean).join(' ');
        const out = c.raw ? v : (c.num ? num(v, c.d) : esc(v));
        return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + out + '</td>';
      }).join('') + '</tr>';
    });
    if (opts.total) html += '<tr class="total">' + cols.map((c, i) => '<td' + (c.num ? ' class="num"' : '') + '>' + (i === 0 ? esc(opts.totalLabel || 'Total') : (c.num && c.sum !== false ? num(rows.reduce((a, r) => a + (Number(c.f ? c.f(r) : r[c.k]) || 0), 0), c.d) : '')) + '</td>').join('') + '</tr>';
    html += '</tbody></table>';
    if (rows.length > lim) html += '<div class="muted small">Mostrando ' + lim + ' de ' + rows.length + ' filas (el Excel trae todas).</div>';
    return html;
  }

  /** Zona para arrastrar archivos (también abre el selector al hacer clic). */
  function dropZone(el, opts) {
    if (typeof el === 'string') el = $(el);
    const input = document.createElement('input');
    input.type = 'file';
    input.hidden = true;
    if (opts.multiple) input.multiple = true;
    input.accept = opts.accept || '.xlsx,.xlsm,.xls,.xlsb,.csv,.txt';
    el.appendChild(input);
    const original = el.innerHTML;
    const handle = async (files) => {
      if (!files || !files.length) return;
      el.classList.add('over');
      try {
        await opts.onFiles(Array.from(files));
        el.classList.add('loaded');
        const b = el.querySelector('b');
        if (b && !opts.keepLabel) b.textContent = '✔ ' + Array.from(files).map((f) => f.name).join(', ');
      } catch (e) {
        console.error(e);
        toast(e.message || String(e), 'bad', 8000);
      } finally {
        el.classList.remove('over');
        input.value = '';
      }
    };
    el.addEventListener('click', (e) => { if (e.target !== input) input.click(); });
    input.addEventListener('change', () => handle(input.files));
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); handle(e.dataTransfer.files); });
    return { reset: () => { el.classList.remove('loaded'); const b = el.querySelector('b'); const tmp = document.createElement('div'); tmp.innerHTML = original; const ob = tmp.querySelector('b'); if (b && ob) b.textContent = ob.textContent; } };
  }

  async function withBusy(btn, fn) {
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Procesando…';
    try { return await fn(); } catch (e) { console.error(e); toast(e.message || String(e), 'bad', 8000); } finally { btn.disabled = false; btn.innerHTML = old; }
  }
  function copy(text) {
    const done = () => toast('Copiado al portapapeles', 'ok', 1800);
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => fallback());
    else fallback();
    function fallback() { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('No se pudo copiar', 'bad'); } t.remove(); }
  }
  function copyable(text) {
    const id = 'c' + Math.random().toString(36).slice(2);
    setTimeout(() => { const b = document.getElementById(id); if (b) b.onclick = () => copy(text); });
    return '<button class="mini" id="' + id + '" title="Copiar">📋 Copiar</button>';
  }
  function options(sel, list, value, blank) {
    if (typeof sel === 'string') sel = $(sel);
    sel.innerHTML = (blank ? '<option value="">' + esc(blank) + '</option>' : '') + list.map((o) => {
      const v = typeof o === 'object' ? o.v : o, t = typeof o === 'object' ? o.t : o;
      return '<option value="' + esc(v) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');
  }
  async function readFile(file) {
    const r = await Core.loadFile(file);
    return r;
  }

  // ---------- Configuración ----------
  const DEFAULTS = () => ({ version: 1, oneId: '', sociedad: 'MX15', dateOrder: 'dmy', hc: { market: 'CAR', sopYear: new Date().getFullYear(), profiles: {} } });
  let cfg = null;
  function loadConfig() {
    try { cfg = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { cfg = null; }
    cfg = Object.assign(DEFAULTS(), cfg || {});
    cfg.hc = Object.assign(DEFAULTS().hc, cfg.hc || {});
    return cfg;
  }
  function saveConfig() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* almacenamiento bloqueado */ } }
  function config() { return cfg || loadConfig(); }
  function profile(market) {
    const c = config();
    const def = root.HC.MARKETS[market] || { splitMarketing: false, multiEntity: false };
    c.hc.profiles[market] = Object.assign({
      multiEntity: def.multiEntity, splitMarketing: def.splitMarketing, gradeGroupMax: '', entityName: '',
      fieldSub: 'Marketing - Trade Marketing & Distribution - Field', funcMapBPC: {}, funcMapApp: {}, entityMapBPC: {}, entityMapApp: {}, appCols: {}
    }, c.hc.profiles[market] || {});
    return c.hc.profiles[market];
  }
  function exportConfig() {
    const blob = new Blob([JSON.stringify(config(), null, 2)], { type: 'application/json' });
    Core.downloadBlob(blob, 'hrss-automatizador-config.json');
  }
  async function importConfig(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !data.hc) throw new Error('El archivo no es una configuración válida de HRSS Automatizador.');
    cfg = Object.assign(DEFAULTS(), data);
    saveConfig();
  }
  function resetConfig() { cfg = DEFAULTS(); saveConfig(); }

  root.UI = { $, $$, esc, num, toast, msg, clear, table, dropZone, withBusy, copy, copyable, options, readFile, loadConfig, saveConfig, config, profile, exportConfig, importConfig, resetConfig };
})(typeof self !== 'undefined' ? self : this);
