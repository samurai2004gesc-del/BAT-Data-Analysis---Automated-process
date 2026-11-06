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

  // ---------- Carpeta "Tracker" (guardar directo en OneDrive / SharePoint sincronizado) ----------
  const DB = 'hrss-automatizador', STORE = 'kv';
  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
      };
    });
  }
  let folder = null;
  const folderListeners = [];
  function folderSupported() { return typeof window.showDirectoryPicker === 'function'; }
  function folderName() { return folder ? folder.name : ''; }
  function onFolderChange(fn) { folderListeners.push(fn); }
  function notifyFolder() { folderListeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }
  async function loadFolder() {
    try { folder = (await idb('readonly', (s) => s.get('trackerDir'))) || null; } catch (e) { folder = null; }
    notifyFolder();
  }
  async function pickFolder() {
    if (!folderSupported()) throw new Error('Este navegador no permite elegir carpetas. Usa Microsoft Edge o Google Chrome actualizados.');
    const h = await window.showDirectoryPicker({ id: 'hrss-tracker', mode: 'readwrite' });
    folder = h;
    try { await idb('readwrite', (s) => s.put(h, 'trackerDir')); } catch (e) { /* no se pudo recordar; se pedirá otra vez */ }
    notifyFolder();
    return h;
  }
  async function forgetFolder() {
    folder = null;
    try { await idb('readwrite', (s) => s.delete('trackerDir')); } catch (e) { /* nada */ }
    notifyFolder();
  }
  function saveMode() { return config().saveMode === 'folder' && folder ? 'folder' : 'download'; }
  /** Pide permiso de escritura. Debe llamarse al inicio del clic (antes de procesar). */
  async function ensureFolderPermission() {
    if (!folder) throw new Error('Elige primero la carpeta Tracker en Configuración.');
    const opts = { mode: 'readwrite' };
    if (folder.queryPermission && (await folder.queryPermission(opts)) === 'granted') return;
    if (folder.requestPermission && (await folder.requestPermission(opts)) === 'granted') return;
    throw new Error('No se concedió permiso para escribir en la carpeta ' + folder.name + '.');
  }
  async function subdir(dir, parts, create) {
    let d = dir;
    for (const p of parts) if (p) d = await d.getDirectoryHandle(p, { create });
    return d;
  }
  /** Ubica la carpeta "{Año}\Tracker" a partir de lo que el usuario eligió (Tracker, el año o la carpeta General). */
  async function trackerDir(year) {
    const n = Core.norm(folder.name);
    if (n === 'tracker') return folder;
    try {
      if (/^\d{4}$/.test(n)) return await subdir(folder, ['Tracker'], false);
      return await subdir(folder, [String(year), 'Tracker'], false);
    } catch (e) {
      throw new Error('No encontré la carpeta "' + year + '\\Tracker" dentro de "' + folder.name + '". En Configuración elige la carpeta …\\Gerencia HRSS-Organización - General\\' + year + '\\Tracker.');
    }
  }
  async function exists(dir, name) { try { await dir.getFileHandle(name); return true; } catch (e) { return false; } }
  /**
   * Guarda archivos: en la carpeta Tracker (modo carpeta) o como descarga.
   * opts: { year, files: [{path:'Suppliers/06. Junio/K2/x.xlsx', data}], zipName?: 'x.zip' (si son varios y se descargan) }
   * build: función async que devuelve opts.files (se llama después de pedir permiso).
   */
  async function save(year, build, zipName) {
    const mode = saveMode();
    if (mode === 'folder') await ensureFolderPermission();
    const files = await build();
    if (!files || !files.length) return [];
    if (mode === 'folder') {
      const root = await trackerDir(year);
      const plan = [];
      for (const f of files) {
        const parts = f.path.split('/');
        const name = parts.pop();
        const dir = await subdir(root, parts, true);
        plan.push({ dir, name, f, exists: await exists(dir, name) });
      }
      const over = plan.filter((p) => p.exists);
      if (over.length && !confirm('Ya existen ' + over.length + ' archivo(s):\n\n' + over.slice(0, 8).map((p) => '• ' + p.f.path).join('\n') + (over.length > 8 ? '\n…' : '') + '\n\n¿Reemplazarlos?')) {
        toast('No se guardó nada.', 'warn');
        return [];
      }
      for (const p of plan) {
        const fh = await p.dir.getFileHandle(p.name, { create: true });
        const w = await fh.createWritable();
        await w.write(p.f.data);
        await w.close();
      }
      toast('Guardado en ' + root.name + ': ' + files.length + ' archivo(s)', 'ok', 6000);
      return files.map((f) => ({ path: (root.name + '/' + f.path), saved: true }));
    }
    if (files.length === 1 || !zipName) {
      files.forEach((f) => Core.downloadBlob(new Blob([f.data], { type: f.type || 'application/octet-stream' }), f.path.split('/').pop()));
    } else {
      const JSZip = Core.lib('JSZip');
      const zip = new JSZip();
      files.forEach((f) => zip.file(f.path, f.data));
      Core.downloadBlob(await zip.generateAsync({ type: 'blob' }), zipName);
    }
    return files.map((f) => ({ path: f.path, saved: false }));
  }
  /** Lista los nombres de archivo de una subcarpeta del Tracker (para el checklist). */
  async function listFolder(year, relPath) {
    await ensureFolderPermission();
    const root = await trackerDir(year);
    const dir = await subdir(root, relPath.split('/'), false);
    const names = [];
    for await (const [name, h] of dir.entries()) if (h.kind === 'file') names.push(name);
    return names;
  }
  /** Texto corto que indica dónde se guardará (junto a los botones). */
  function whereText(rel) {
    return saveMode() === 'folder' ? '📁 Se guarda en ' + folder.name + '\\' + String(rel || '').replace(/\//g, '\\') : '⬇ Se guarda en Descargas';
  }
  async function wbFile(path, wb) { return { path, data: new Uint8Array(await wb.xlsx.writeBuffer()), type: Core.XLSX_MIME }; }

  // ---------- Contactos y borradores de correo ----------
  function contacts() {
    const map = [];
    String(config().contacts || '').split(/\r?\n/).forEach((line) => {
      const m = line.split(/[;\t]/).map((x) => x.trim());
      if (m.length >= 2 && /@/.test(m[1])) map.push({ name: m[0], email: m[1] });
      else if (m.length === 1 && /@/.test(m[0])) map.push({ name: m[0], email: m[0] });
    });
    return map;
  }
  /** Convierte nombres (o "Nombre / Nombre") a correos usando el directorio de Configuración. */
  function emailsFor(names) {
    const list = contacts();
    const out = [], missing = [];
    (Array.isArray(names) ? names : [names]).flatMap((n) => String(n || '').split(/[\/;,]/)).map((n) => n.trim()).filter(Boolean).forEach((n) => {
      if (/@/.test(n)) { out.push(n); return; }
      let best = null;
      list.forEach((c) => { const s = Core.nameScore(n, c.name); if (s >= 0.9 && (!best || s > best.s)) best = { s, c }; });
      if (best) out.push(best.c.email); else missing.push(n);
    });
    return { emails: Array.from(new Set(out)), missing: Array.from(new Set(missing)) };
  }
  function downloadEml(m) {
    const eml = Core.buildEml(m);
    Core.downloadBlob(new Blob([eml], { type: 'message/rfc822' }), Core.safeFileName(m.subject || 'Correo').slice(0, 120) + '.eml');
  }

  root.UI = {
    $, $$, esc, num, toast, msg, clear, table, dropZone, withBusy, copy, copyable, options, readFile, loadConfig, saveConfig, config, profile, exportConfig, importConfig, resetConfig,
    folderSupported, folderName, onFolderChange, loadFolder, pickFolder, forgetFolder, saveMode, save, listFolder, wbFile, whereText, contacts, emailsFor, downloadEml
  };
})(typeof self !== 'undefined' ? self : this);
