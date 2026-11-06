/* Pantallas: Tracker de Recobros y Formatos SAP */
(function (root) {
  'use strict';
  const { Core, Recharges: R, UI } = root;
  const { $, esc } = UI;
  const T = { base: null, prev: null, assignments: null, stats: null };
  const P = { list: [] };

  function defaultHalf() { return new Date().getMonth() < 6 ? 'H1' : 'H2'; }

  // ---------- Tracker ----------
  function trParams() { return { half: $('#tr-half').value, year: Number($('#tr-year').value), oneId: $('#tr-oneid').value || UI.config().oneId, nameOrder: $('#tr-order').value }; }
  function trackerPath(p) { return 'Recharges/' + R.periodShort(p.half, p.year) + '/Tracker Recharges ' + R.periodShort(p.half, p.year).replace("'", '') + '.xlsx'; }
  async function onAssignments(files) {
    const f = await UI.readFile(files[0]);
    const res = R.readAssignments(f.wb);
    if (!res.assignments.length) throw new Error('No encontré asignaciones. El archivo debe tener columnas como Nombre, Payroll Num., CeCo, Host Country…');
    T.base = res.assignments;
    const el = $('#tr-info');
    UI.clear(el);
    UI.msg(el, '<b>' + res.assignments.length + '</b> asignaciones en ' + res.sheets.length + ' hoja(s): ' + res.sheets.map((s) => esc(s.sheet)).join(', '), 'ok');
    const noIC = res.assignments.filter((a) => !a.ic || !a.coder).length;
    if (noIC) UI.msg(el, noIC + ' asignación(es) sin IC code o Coder: aparecerán en la hoja “Datos faltantes”.', 'warn');
    recompute();
  }
  async function onPrev(files) {
    const f = await UI.readFile(files[0]);
    const prev = R.readPreviousTracker(f.wb);
    if (!prev) throw new Error('No reconocí el archivo como un Tracker generado por la app (busqué las columnas Key, Estatus, Recharge ID (Webi)…).');
    T.prev = prev;
    recompute();
  }
  function recompute() {
    const base = T.base || (T.prev ? T.prev.rows.map((r) => Object.assign({}, r)) : null);
    if (!base) return;
    const m = R.mergeTracker(base, T.prev ? T.prev.rows : []);
    T.assignments = m.assignments;
    T.stats = T.prev ? m.stats : null;
    const el = $('#tr-prev-info');
    UI.clear(el);
    if (T.prev) {
      UI.msg(el, 'Tracker anterior: <b>' + T.prev.rows.length + '</b> asignaciones (hoja ' + esc(T.prev.sheet) + ') · <b>' + m.stats.kept + '</b> conservan lo capturado · <b>' + m.stats.nuevos + '</b> nuevas · <b>' + m.stats.soloAnterior + '</b> ya no vienen en la lista (se dejan en gris al final)', 'ok');
      if (!T.base) UI.msg(el, 'Sin lista nueva: se regenera el Tracker con lo que ya tenía.', 'info');
    }
    renderTracker();
    $('#tr-download').disabled = false;
  }
  function renderTracker() {
    updateWhere();
    if (!T.assignments) return;
    const p = trParams();
    const view = (a) => { const o = Object.assign({}, a, a.manual || {}); return o; };
    $('#tr-preview').innerHTML = UI.table([
      { h: 'Key', k: 'key', cls: (a) => (a._new && T.prev ? 'empty' : '') }, { h: 'Nombre', k: 'nombre' }, { h: 'Área', k: 'area' }, { h: 'Sociedad', k: 'sociedad' }, { h: 'CeCo', k: 'ceco' },
      { h: 'Host', k: 'host' }, { h: 'Tipo', k: 'tipo' }, { h: 'Periodo', f: (a) => [a.desde, a.hasta].filter(Boolean).join(' – ') },
      { h: 'IC code', k: 'ic', cls: (a) => (a.ic ? '' : 'empty') }, { h: 'Coder', k: 'coder', cls: (a) => (a.coder ? '' : 'empty') },
      { h: 'Note Title', f: (a) => R.noteTitle(a, p.half, p.year, p.nameOrder) },
      { h: 'Novedad', f: (a) => (a._onlyPrev ? 'Ya no viene' : a._new && T.prev ? 'Nueva' : '') },
      { h: 'Estatus', f: (a) => view(a).estatus || R.STATUSES[0] }, { h: 'Siguiente paso', f: (a) => R.nextStep(view(a)) }
    ], T.assignments, { rowCls: (a) => (a._onlyPrev ? 'gone' : '') });
  }
  function updateWhere() {
    const p = trParams();
    $('#tr-where').textContent = UI.whereText(trackerPath(p));
    $('#tr-download').innerHTML = UI.saveMode() === 'folder' ? '💾 Guardar Tracker' : '⬇ Descargar Tracker';
    const sp = sapParams();
    $('#sap-where').textContent = UI.whereText('Recharges/' + R.periodShort(sp.half, sp.year) + '/Webis|JVUs|Accruals');
    $('#sap-zip').innerHTML = UI.saveMode() === 'folder' ? '💾 Guardar en las carpetas de cada empleado' : '⬇ Descargar ZIP con carpetas';
  }
  async function downloadTracker() {
    const p = trParams();
    await UI.save(p.year, async () => [await UI.wbFile(trackerPath(p), await R.buildTracker(T.assignments, p))]);
  }

  // ---------- Formatos SAP ----------
  function sapParams() { return { half: $('#sap-half').value, year: Number($('#sap-year').value) }; }
  async function onSapFiles(files) {
    for (const file of files) {
      const f = await UI.readFile(file);
      const pr = await R.processWorkbook(f);
      if (!pr.items.length) { UI.toast(file.name + ': no encontré hojas Vendor.Template(PO), Webi creation, JVU - Recharge ni Accrual.', 'bad', 8000); continue; }
      pr.host = $('#sap-host').value;
      P.list.push(pr);
    }
    renderSap();
  }
  function renderSap() {
    const p = sapParams();
    const el = $('#sap-list');
    el.innerHTML = '';
    P.list.forEach((pr, idx) => {
      const ctx = pr.ctx;
      const a = { nombre: ctx.nombre, host: pr.host };
      const webi = pr.items.find((i) => i.kind === 'Webi');
      const jvu = pr.items.find((i) => i.kind === 'JVU');
      const acc = pr.items.find((i) => i.kind === 'Accrual');
      let warn = [];
      pr.items.forEach((i) => i.analysis.warnings.forEach((w) => warn.push(i.kind + ': ' + w)));
      const wT = webi && webi.analysis.total, jT = jvu && R.amountForCompare('JVU', jvu.analysis);
      if (wT && jT && Core.round(wT - jT, 2) !== 0) warn.push('El monto del Webi (' + UI.num(wT, 2) + ') no coincide con el del JVU (' + UI.num(jT, 2) + '). Si el Webi lleva Mark Up, descuéntalo antes de comparar.');
      const title = R.noteTitle(a, p.half, p.year), text = R.noteText(a, p.half, p.year);
      const div = document.createElement('div');
      div.className = 'filecard';
      div.innerHTML = '<div class="head">' +
        '<label>KEY<input data-f="key" value="' + esc(ctx.key) + '" style="width:80px"></label>' +
        '<label style="flex:1">Nombre (Apellidos Nombre)<input data-f="nombre" value="' + esc(ctx.nombre) + '"></label>' +
        '<label>Host Country<input data-f="host" value="' + esc(pr.host || '') + '"></label>' +
        '<button class="mini danger" data-del>✕ Quitar</button></div>' +
        '<div class="muted small">' + esc(pr.file) + (ctx.tipo ? ' · Tipo en IDX: <b>' + esc(ctx.tipo) + '</b>' : '') + (ctx.ic ? ' · ' + esc(ctx.ic) : '') + (ctx.area ? ' · Área: ' + esc(ctx.area) : '') + '</div>' +
        '<div style="margin-top:8px">' + pr.items.map((i, j) => '<label class="check" style="display:inline-flex;margin-right:14px"><input type="checkbox" data-inc="' + j + '"' + (i.include === false ? '' : ' checked') + '> <span class="pill ' + (i.analysis.warnings.length ? 'bad' : 'ok') + '">' + esc(R.kindInfo(i.kind).label) + '</span> <span class="muted small">' + i.grid.length + ' filas' + (i.analysis.total !== null ? ' · total ' + UI.num(R.amountForCompare(i.kind, i.analysis), 2) : '') + '</span> <button class="mini" data-txt="' + j + '"' + (R.kindInfo(i.kind).txt ? '' : ' hidden') + '>TXT</button></label>').join('') + '</div>' +
        '<div class="kv">' +
        '<span class="k">Note Title</span><span>' + esc(title) + '</span>' + UI.copyable(title) +
        '<span class="k">Note Text</span><span>' + esc(text) + '</span>' + UI.copyable(text) +
        '<span class="k">SE Company Code</span><span>' + esc(ctx.ic || 'IC-00-MX15 (sociedad desde la que se recobra)') + '</span><span></span>' +
        '<span class="k">Mes a marcar “X”</span><span>' + R.monthToMark(Core.todaySerial()) + ' (si el Recharge se crea hoy) · Recharge Frequency: Single</span><span></span>' +
        (jvu ? '<span class="k">JVU</span><span>Exception = <b>16</b> · Function: Finance · Subfunction: FICO (FI - CORA)</span><span></span>' : '') +
        (acc ? '<span class="k">Accrual</span><span>✓ Intercompany Accrual · Partner Entity User ID = OneID del Coder · Exception = <b>05</b></span><span></span>' : '') +
        '</div>' + warn.map((w) => '<div class="msg warn">' + esc(w) + '</div>').join('');
      el.appendChild(div);
      UI.$$('input[data-f]', div).forEach((inp) => inp.addEventListener('change', () => {
        if (inp.dataset.f === 'host') pr.host = inp.value; else pr.ctx[inp.dataset.f] = inp.value.trim();
        renderSap();
      }));
      UI.$$('input[data-inc]', div).forEach((inp) => inp.addEventListener('change', () => { pr.items[Number(inp.dataset.inc)].include = inp.checked; }));
      UI.$$('button[data-txt]', div).forEach((b) => b.addEventListener('click', (e) => {
        e.preventDefault();
        const it = pr.items[Number(b.dataset.txt)];
        if (!pr.ctx.key || !pr.ctx.nombre) return UI.toast('Captura KEY y Nombre.', 'bad');
        Core.downloadBlob(new Blob([Core.encodeCP1252(Core.toTabText(it.grid))], { type: 'text/plain' }), R.fileName(pr.ctx.key, it.kind, pr.ctx.nombre) + '.txt');
      }));
      div.querySelector('[data-del]').addEventListener('click', () => { P.list.splice(idx, 1); renderSap(); });
    });
    $('#sap-zip').disabled = !P.list.length;
  }
  async function downloadZip() {
    const missing = P.list.filter((pr) => !pr.ctx.key || !pr.ctx.nombre);
    if (missing.length) throw new Error('Falta KEY o Nombre en: ' + missing.map((m) => m.file).join(', '));
    const p = sapParams();
    let log = [];
    const saved = await UI.save(p.year, async () => { const r = await R.buildFiles(P.list, p); log = r.log; return r.files; }, 'Recharges ' + R.periodShort(p.half, p.year).replace("'", '') + ' - formatos SAP.zip');
    if (!saved.length) return;
    const el = $('#sap-log');
    const head = saved[0].saved
      ? '<div class="msg ok"><b>Guardado en las carpetas de cada empleado</b> (' + saved.length + ' archivos).</div>'
      : '<div class="msg ok"><b>ZIP generado.</b> Descomprímelo dentro de la carpeta <code>' + esc(R.paths(UI.config().oneId, p.year, p.half).webis.replace(/\\Recharges\\.*$/, '')) + '</code> (trae la estructura Recharges\\' + esc(R.periodShort(p.half, p.year)) + '\\…).</div>';
    el.innerHTML = head + log.map((l) => '<div class="small ' + (l.ok ? '' : 'msg bad') + '">' + (l.ok ? '✔ ' : '✖ ') + esc(l.msg) + '</div>').join('');
  }

  function init() {
    const y = new Date().getFullYear();
    ['#tr-year', '#sap-year'].forEach((s) => { $(s).value = y; });
    ['#tr-half', '#sap-half'].forEach((s) => { $(s).value = defaultHalf(); });
    $('#tr-oneid').value = UI.config().oneId || '';
    UI.dropZone('#tr-drop', { onFiles: onAssignments });
    UI.dropZone('#tr-drop-prev', { onFiles: onPrev });
    ['#tr-half', '#tr-year', '#tr-order'].forEach((s) => $(s).addEventListener('change', renderTracker));
    ['#sap-half', '#sap-year'].forEach((s) => $(s).addEventListener('change', updateWhere));
    document.addEventListener('hrss-folder', updateWhere);
    updateWhere();
    $('#tr-download').addEventListener('click', (e) => UI.withBusy(e.currentTarget, downloadTracker));
    UI.dropZone('#sap-drop', { multiple: true, keepLabel: true, accept: '.xlsx,.xlsm,.xls', onFiles: onSapFiles });
    ['#sap-half', '#sap-year'].forEach((s) => $(s).addEventListener('change', renderSap));
    $('#sap-host').addEventListener('change', () => { P.list.forEach((pr) => { if (!pr.host) pr.host = $('#sap-host').value; }); renderSap(); });
    $('#sap-zip').addEventListener('click', (e) => UI.withBusy(e.currentTarget, downloadZip));
    $('#sap-clear').addEventListener('click', () => { P.list = []; renderSap(); $('#sap-log').innerHTML = ''; });
  }
  root.PageRecharges = { init, T, P };
})(typeof self !== 'undefined' ? self : this);
