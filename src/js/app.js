/* Navegación, configuración e inicio de la app. */
(function (root) {
  'use strict';
  const { UI } = root;
  const { $, $$, esc } = UI;

  function go(page) {
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
    $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + page));
    if (page === 'config') renderConfig();
    try { sessionStorage.setItem('hrss-page', page); } catch (e) { /* sin almacenamiento */ }
    window.scrollTo(0, 0);
  }

  function renderFolder() {
    const c = UI.config();
    const name = UI.folderName();
    const mode = UI.saveMode();
    const ind = $('#folder-ind');
    ind.textContent = mode === 'folder' ? '📁 Guardando en: ' + name : '⬇ Guardando en: Descargas';
    ind.classList.toggle('on', mode === 'folder');
    if (c.saveMode === 'folder' && !name) ind.textContent = '⚠ Elige la carpeta Tracker';
    const fn = $('#cfg-folder-name');
    fn.textContent = name ? 'Carpeta elegida: ' + name : (UI.folderSupported() ? 'Sin carpeta elegida' : 'Este navegador no permite guardar en carpetas; usa Edge o Chrome.');
    $$('input[name=cfg-save]').forEach((r) => { r.checked = r.value === (c.saveMode || 'download'); });
    document.dispatchEvent(new CustomEvent('hrss-folder'));
  }
  function renderConfig() {
    const c = UI.config();
    $('#cfg-cc').value = c.ccDefault || '';
    $('#cfg-planning').value = c.planningTo || '';
    $('#cfg-reclass-cc').value = c.reclassCc || '';
    $('#cfg-contacts').value = c.contacts || '';
    renderFolder();
    $('#cfg-oneid').value = c.oneId || '';
    $('#cfg-soc').value = c.sociedad || 'MX15';
    $('#cfg-dateorder').value = c.dateOrder || 'dmy';
    const profs = c.hc.profiles || {};
    const names = Object.keys(profs);
    if (!names.length) { $('#cfg-profiles').innerHTML = '<p class="muted">Aún no hay equivalencias guardadas. Se crean al usar la pantalla de Headcount.</p>'; return; }
    $('#cfg-profiles').innerHTML = UI.table([
      { h: 'Mercado', k: 'n' }, { h: 'Funciones BPC', k: 'a', num: true }, { h: 'Funciones Aprobado', k: 'b', num: true }, { h: 'Entidades BPC', k: 'c', num: true }, { h: 'Entidades Aprobado', k: 'd', num: true },
      { h: '', raw: true, f: (r) => '<button class="mini" data-edit="' + esc(r.n) + '">Editar</button> <button class="mini danger" data-clear="' + esc(r.n) + '">Borrar</button>' }
    ], names.map((n) => ({ n, a: Object.keys(profs[n].funcMapBPC || {}).length, b: Object.keys(profs[n].funcMapApp || {}).length, c: Object.keys(profs[n].entityMapBPC || {}).length, d: Object.keys(profs[n].entityMapApp || {}).length }))) +
      '<div id="cfg-edit"></div>';
    $$('[data-clear]').forEach((b) => b.addEventListener('click', () => {
      if (!confirm('¿Borrar las equivalencias de ' + b.dataset.clear + '?')) return;
      delete c.hc.profiles[b.dataset.clear]; UI.saveConfig(); renderConfig();
    }));
    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const n = b.dataset.edit;
      $('#cfg-edit').innerHTML = '<h3>Editar ' + esc(n) + ' (JSON)</h3><textarea id="cfg-json">' + esc(JSON.stringify(c.hc.profiles[n], null, 2)) + '</textarea><div class="actions"><button class="primary" id="cfg-json-save">Guardar</button></div>';
      $('#cfg-json-save').addEventListener('click', () => {
        try { c.hc.profiles[n] = JSON.parse($('#cfg-json').value); UI.saveConfig(); UI.toast('Guardado', 'ok'); renderConfig(); } catch (e) { UI.toast('JSON inválido: ' + e.message, 'bad'); }
      });
    }));
  }

  function init() {
    UI.loadConfig();
    $$('#nav a').forEach((a) => a.addEventListener('click', () => go(a.dataset.page)));
    $$('[data-goto]').forEach((a) => a.addEventListener('click', () => go(a.dataset.goto)));
    root.PageHC.init();
    root.PageRecharges.init();
    root.PageReclass.init();
    $('#cfg-oneid').addEventListener('change', () => { UI.config().oneId = $('#cfg-oneid').value.trim(); UI.saveConfig(); $('#tr-oneid').value = UI.config().oneId; showWho(); });
    $('#cfg-soc').addEventListener('change', () => { UI.config().sociedad = $('#cfg-soc').value.trim().toUpperCase(); UI.saveConfig(); });
    $('#cfg-dateorder').addEventListener('change', () => { UI.config().dateOrder = $('#cfg-dateorder').value; UI.saveConfig(); });
    $('#cfg-export').addEventListener('click', UI.exportConfig);
    $('#cfg-import').addEventListener('change', async (e) => {
      try { await UI.importConfig(e.target.files[0]); UI.toast('Configuración importada', 'ok'); location.reload(); } catch (err) { UI.toast(err.message, 'bad', 7000); }
      e.target.value = '';
    });
    $('#cfg-reset').addEventListener('click', () => { if (confirm('¿Borrar toda la configuración y equivalencias guardadas en este navegador?')) { UI.resetConfig(); location.reload(); } });
    [['#cfg-cc', 'ccDefault'], ['#cfg-planning', 'planningTo'], ['#cfg-reclass-cc', 'reclassCc'], ['#cfg-contacts', 'contacts']].forEach(([sel, key]) => {
      $(sel).addEventListener('change', () => { UI.config()[key] = $(sel).value.trim(); UI.saveConfig(); UI.toast('Guardado', 'ok', 1500); });
    });
    $$('input[name=cfg-save]').forEach((r) => r.addEventListener('change', () => {
      UI.config().saveMode = r.value;
      UI.saveConfig();
      if (r.value === 'folder' && !UI.folderName()) UI.toast('Ahora elige la carpeta Tracker.', 'warn');
      renderFolder();
    }));
    $('#cfg-folder-pick').addEventListener('click', async () => {
      try {
        await UI.pickFolder();
        UI.config().saveMode = 'folder';
        UI.saveConfig();
        renderFolder();
        UI.toast('Carpeta elegida: ' + UI.folderName(), 'ok');
      } catch (e) { if (e.name !== 'AbortError') UI.toast(e.message, 'bad', 7000); }
    });
    $('#cfg-folder-forget').addEventListener('click', async () => { await UI.forgetFolder(); UI.config().saveMode = 'download'; UI.saveConfig(); renderFolder(); });
    UI.onFolderChange(renderFolder);
    if (!UI.folderSupported()) {
      $('#cfg-folder-pick').disabled = true;
      $$('input[name=cfg-save]').forEach((r) => { if (r.value === 'folder') r.disabled = true; });
    }
    renderConfig();
    UI.loadFolder();
    showWho();
    let start = 'home';
    try { start = sessionStorage.getItem('hrss-page') || 'home'; } catch (e) { /* sin almacenamiento */ }
    go(start);
    window.addEventListener('error', (e) => UI.toast('Error: ' + e.message, 'bad', 8000));
    window.addEventListener('unhandledrejection', (e) => UI.toast('Error: ' + (e.reason && e.reason.message || e.reason), 'bad', 8000));
  }
  function showWho() { const c = UI.config(); $('#who').textContent = c.oneId ? 'OneID ' + c.oneId : ''; }

  document.addEventListener('DOMContentLoaded', init);
})(typeof self !== 'undefined' ? self : this);
