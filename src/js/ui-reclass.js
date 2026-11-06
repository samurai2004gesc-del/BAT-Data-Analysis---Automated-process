/* Pantalla: Reclasificación de costos de movilidad */
(function (root) {
  'use strict';
  const { Core, Reclass: RC, UI } = root;
  const { $, esc } = UI;
  const S = { sup: null, supName: '', hist: [], dir: [], cecos: null, ret: null, retName: '', ksb1: null, sel: new Set(), manualRate: false };

  function params() {
    return {
      provider: $('#rc-provider').value.trim() || 'K2', sociedad: ($('#rc-soc').value.trim() || 'MX15').toUpperCase(), month: Number($('#rc-month').value),
      year: Number($('#rc-year').value), deadline: $('#rc-deadline').value.trim(), account: $('#rc-account').value, sourceCeco: $('#rc-srcceco').value
    };
  }
  function updateFolder() {
    const p = params();
    $('#rc-folder').innerHTML = 'Carpeta del periodo: <code>' + esc(RC.supplierFolder(UI.config().oneId, p.year, p.month, p.provider)) + '</code>';
  }
  async function rowsOf(file, preferSheet) {
    const f = await UI.readFile(file);
    let s = preferSheet ? Core.getSheet(f.wb, preferSheet) : null;
    if (!s) s = { name: f.wb.SheetNames[0], ws: f.wb.Sheets[f.wb.SheetNames[0]] };
    return { f, sheet: s.name, rows: Core.sheetRows(s.ws) };
  }

  // ---------- A ----------
  async function onSupplier(files) {
    const { f, sheet, rows } = await rowsOf(files[0]);
    S.sup = RC.detectSupplier(rows);
    S.supName = f.name;
    const guess = ['K2', 'EY', 'Deloitte', 'SIRVA'].find((p) => new RegExp('\\b' + p + '\\b', 'i').test(f.name));
    if (guess) $('#rc-provider').value = guess;
    const el = $('#rc-sup-info');
    UI.clear(el);
    const c = S.sup.cols;
    UI.msg(el, S.sup.data.length + ' cargos · hoja ' + esc(sheet) + ' · nombre: <b>' + esc(S.sup.header[c.name]) + '</b>' + (c.amount >= 0 ? ' · monto: <b>' + esc(S.sup.header[c.amount]) + '</b>' : '') + (c.service >= 0 ? ' · servicio: <b>' + esc(S.sup.header[c.service]) + '</b>' : ''), 'ok');
    if (c.amount < 0) UI.msg(el, 'No identifiqué la columna del monto; el paso C la necesita.', 'warn');
    updateFolder();
    renderA();
  }
  async function onHist(files) {
    const f = await UI.readFile(files[0]);
    let s = Core.getSheet(f.wb, ['Histórico K2', 'Historico K2', 'Histórico', 'Historico']);
    if (!s) s = { name: f.wb.SheetNames[0], ws: f.wb.Sheets[f.wb.SheetNames[0]] };
    S.hist = RC.readSource(Core.sheetRows(s.ws), 'Histórico');
    UI.clear('#rc-hist-info');
    UI.msg('#rc-hist-info', S.hist.length + ' registros en la hoja ' + esc(s.name), S.hist.length ? 'ok' : 'warn');
    renderA();
  }
  async function onDir(files) {
    S.dir = [];
    for (const file of files) {
      const f = await UI.readFile(file);
      f.wb.SheetNames.forEach((sn) => { S.dir = S.dir.concat(RC.readSource(Core.sheetRows(f.wb.Sheets[sn]), file.name)); });
    }
    UI.clear('#rc-dir-info');
    UI.msg('#rc-dir-info', S.dir.length + ' personas en el directorio', S.dir.length ? 'ok' : 'warn');
    renderA();
  }
  async function onCecos(files) {
    const { sheet, rows } = await rowsOf(files[0]);
    S.cecos = RC.readCecos(rows);
    UI.clear('#rc-cecos-info');
    UI.msg('#rc-cecos-info', S.cecos.count + ' CeCos en el catálogo (hoja ' + esc(sheet) + ', CeCo = columna ' + Core.colLetter(S.cecos.cecoCol) + ', Sociedad = columna ' + Core.colLetter(S.cecos.socCol) + ')', S.cecos.count ? 'ok' : 'bad');
    renderA(); renderB(); renderC();
  }
  function amountOf(sup, d) { return sup.cols.amount >= 0 ? Core.parseNum(d.raw[sup.cols.amount]) : null; }
  function previewTable(sup, enriched) {
    const p = params();
    const rows = sup.data.map((d, k) => ({ d, e: enriched[k], v: RC.validateCeco(enriched[k].ceco, S.cecos, p.sociedad) }));
    return UI.table([
      { h: 'Fila', f: (r) => r.d._row }, { h: 'Assignee Name', f: (r) => r.d.name },
      { h: 'Monto', f: (r) => amountOf(sup, r.d), num: true, d: 2 },
      { h: 'Servicio', f: (r) => (sup.cols.service >= 0 ? r.d.raw[sup.cols.service] : '') },
      { h: 'HRBP', f: (r) => r.e.hrbp, cls: (r) => (r.e.hrbp ? 'found' : 'empty') },
      { h: 'Home Function', f: (r) => r.e.func, cls: (r) => (r.e.func ? 'found' : 'empty') },
      { h: 'CeCo', f: (r) => r.e.ceco, cls: (r) => (r.e.ceco ? 'found' : 'empty') },
      { h: 'Coincidencia', f: (r) => (r.e.matchedName ? r.e.matchedName + (r.e.score < 1 ? ' (parcial)' : '') : '—') },
      { h: 'Validación ' + p.sociedad, f: (r) => (S.cecos ? r.v.text : 'carga All CeCos'), cls: (r) => (!S.cecos ? '' : r.v.status === 'OK' ? 'okc' : 'badc') }
    ], rows, { total: sup.cols.amount >= 0 });
  }
  function renderA() {
    if (!S.sup) return;
    S.enrA = RC.enrich(S.sup, S.hist, S.dir);
    $('#rc-a-preview').innerHTML = previewTable(S.sup, S.enrA);
    const miss = S.enrA.filter((e) => !e.ceco).length;
    if (miss) $('#rc-a-preview').insertAdjacentHTML('afterbegin', '<div class="msg warn">' + miss + ' cargo(s) sin CeCo en el histórico: quedarán en amarillo para que el HRBP lo complete.</div>');
    $('#rc-a-download').disabled = false;
    $('#rc-a-email').disabled = false;
  }
  async function downloadA() {
    const p = params();
    const wb = await RC.buildSentToHRBP(S.sup, S.enrA, p);
    await Core.downloadWorkbook(wb, 'Sent to HRBPs - ' + p.sociedad + ' ' + p.provider + '.xlsx');
  }
  function showEmail() {
    const p = params();
    const m = RC.emailToHRBPs(p);
    const hrbps = Array.from(new Set(S.enrA.map((e) => e.hrbp).filter(Boolean).flatMap((h) => h.split('/').map((x) => x.trim()))));
    $('#rc-a-email-box').innerHTML = '<div class="filecard"><div class="kv"><span class="k">Para</span><span>' + esc(hrbps.join('; ') || '(HRBPs involucrados)') + '</span>' + UI.copyable(hrbps.join('; ')) +
      '<span class="k">Asunto</span><span>' + esc(m.subject) + '</span>' + UI.copyable(m.subject) + '</div>' +
      '<textarea id="rc-mail-body">' + esc(m.body) + '</textarea><div class="actions">' + UI.copyable(m.body) +
      ' <a class="btnlike" href="mailto:?subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body) + '">✉ Abrir en Outlook</a> <span class="muted small">Recuerda adjuntar el archivo “Sent to HRBPs”.</span></div></div>';
  }

  // ---------- B ----------
  async function onRetrieved(files) {
    const { f, rows } = await rowsOf(files[0]);
    S.ret = RC.detectSupplier(rows);
    S.retName = f.name;
    UI.clear('#rc-b-info');
    const c = S.ret.cols;
    UI.msg('#rc-b-info', S.ret.data.length + ' cargos · columnas: CeCo ' + (c.ceco >= 0 ? '✔' : '✖') + ' · HRBP ' + (c.hrbp >= 0 ? '✔' : '✖') + ' · Home Function ' + (c.func >= 0 ? '✔' : '✖'), c.ceco >= 0 ? 'ok' : 'bad');
    if (!S.cecos) UI.msg('#rc-b-info', 'Carga el catálogo “All CeCos - Approvers” en la pestaña A para validar.', 'warn');
    renderB(); renderC();
  }
  function renderB() {
    if (!S.ret) return;
    const p = params();
    S.enrB = RC.enrich(S.ret, S.hist, S.dir);
    $('#rc-b-preview').innerHTML = previewTable(S.ret, S.enrB);
    $('#rc-b-download').disabled = !S.cecos;
    const box = $('#rc-b-emails');
    box.innerHTML = '';
    if (!S.cecos) return;
    const bad = {};
    S.ret.data.forEach((d, k) => {
      const e = S.enrB[k];
      const v = RC.validateCeco(e.ceco, S.cecos, p.sociedad);
      if (v.status !== 'OK') { const h = e.hrbp || '(sin HRBP)'; (bad[h] = bad[h] || []).push({ name: d.name, ceco: e.ceco, text: v.text }); }
    });
    const keys = Object.keys(bad);
    if (!keys.length) { box.innerHTML = '<div class="msg ok"><b>Todos los CeCos pertenecen a ' + esc(p.sociedad) + '.</b> Puedes continuar con la reclasificación (pestaña C).</div>'; return; }
    box.innerHTML = '<div class="msg bad"><b>' + keys.reduce((a, k) => a + bad[k].length, 0) + ' cargo(s) con CeCo incorrecto.</b> NO procedas a la reclasificación sin corregir. Correos sugeridos:</div>' +
      keys.map((h) => { const m = RC.emailInvalidCecos(h, bad[h], p); return '<div class="filecard"><div class="kv"><span class="k">Para</span><span>' + esc(h) + '</span><span></span><span class="k">Asunto</span><span>' + esc(m.subject) + '</span>' + UI.copyable(m.subject) + '</div><textarea style="min-height:150px">' + esc(m.body) + '</textarea>' + UI.copyable(m.body) + '</div>'; }).join('');
  }
  async function downloadB() {
    const p = params();
    const wb = await RC.buildValidated(S.ret, S.enrB, S.cecos, p);
    await Core.downloadWorkbook(wb, 'Validacion CeCos - ' + p.sociedad + ' ' + p.provider + '.xlsx');
  }

  // ---------- C ----------
  function base() { return S.ret ? { sup: S.ret, enr: S.enrB || RC.enrich(S.ret, S.hist, S.dir) } : S.sup ? { sup: S.sup, enr: S.enrA || RC.enrich(S.sup, S.hist, S.dir) } : null; }
  async function onKSB1(files) {
    const { rows } = await rowsOf(files[0]);
    S.ksb1 = RC.readKSB1(rows);
    S.sel = new Set();
    const b = base();
    if (b) {
      const tot = b.sup.data.reduce((a, d) => a + (amountOf(b.sup, d) || 0), 0);
      S.ksb1.forEach((l, i) => { if (Math.abs(Math.abs(l.tran) - Math.abs(tot)) < 0.05 && l.tcur !== l.ocur) S.sel.add(i); });
    }
    UI.clear('#rc-ksb1-info');
    UI.msg('#rc-ksb1-info', S.ksb1.length + ' movimientos en el export' + (S.sel.size ? ' · se preseleccionó el cargo que coincide con el total del proveedor' : ' · marca el cargo del proveedor'), 'ok');
    S.manualRate = false;
    renderC();
  }
  function renderC() {
    const lines = $('#rc-ksb1-lines');
    if (S.ksb1) {
      lines.innerHTML = UI.table([
        { h: '✓', raw: true, f: (l) => '<input type="checkbox" data-k="' + S.ksb1.indexOf(l) + '"' + (S.sel.has(S.ksb1.indexOf(l)) ? ' checked' : '') + '>' },
        { h: 'Documento', k: 'doc' }, { h: 'Texto', k: 'text' }, { h: 'Fecha', f: (l) => Core.fmtDate(l.date) },
        { h: 'Valor (moneda transacción)', k: 'tran', num: true, d: 2 }, { h: 'Mon.', k: 'tcur' }, { h: 'Valor MXN', k: 'obj', num: true, d: 2 }, { h: 'Mon. obj.', k: 'ocur' }
      ], S.ksb1);
      UI.$$('input[data-k]', lines).forEach((c) => c.addEventListener('change', () => { const k = Number(c.dataset.k); if (c.checked) S.sel.add(k); else S.sel.delete(k); S.manualRate = false; renderC(); }));
      if (!S.manualRate) {
        const r = RC.exRateFrom(S.ksb1.filter((_, i) => S.sel.has(i)));
        $('#rc-rate').value = r ? Core.round(r, 6) : '';
      }
    }
    const b = base();
    const sum = $('#rc-c-summary');
    const ok = !!b && Number($('#rc-rate').value) > 0;
    $('#rc-c-download').disabled = !ok;
    $('#rc-c-hist').disabled = !ok;
    if (!b) { sum.innerHTML = '<div class="msg info">Carga el archivo del proveedor (A) o el Retrieved (B).</div>'; return; }
    const p = params();
    const rate = Number($('#rc-rate').value) || null;
    const res = RC.buildHistoricRows(b.sup, b.enr, S.cecos, Object.assign({}, p, { exRate: rate }));
    S.resC = res;
    const supTot = b.sup.data.reduce((a, d) => a + (amountOf(b.sup, d) || 0), 0);
    const sapSel = S.ksb1 ? S.ksb1.filter((_, i) => S.sel.has(i)) : [];
    const sapTot = sapSel.reduce((a, l) => a + l.tran, 0);
    const diff = Core.round(Math.abs(supTot) - Math.abs(sapTot), 2);
    let html = '<div class="grid g4">' +
      '<div class="block"><div class="muted small">Total proveedor</div><h2>' + UI.num(supTot, 2) + '</h2></div>' +
      '<div class="block"><div class="muted small">Cargo seleccionado en SAP</div><h2>' + (S.ksb1 ? UI.num(sapTot, 2) : '—') + '</h2>' + (S.ksb1 && sapSel.length ? '<span class="pill ' + (diff === 0 ? 'ok' : 'bad') + '">' + (diff === 0 ? 'Coincide' : 'Diferencia ' + UI.num(diff, 2)) + '</span>' : '') + '</div>' +
      '<div class="block"><div class="muted small">Tipo de cambio</div><h2>' + (rate ? UI.num(rate, 4) : '—') + '</h2></div>' +
      '<div class="block"><div class="muted small">A reclasificar (MXN)</div><h2>' + UI.num(res.ok.reduce((a, r) => a + (r.mxn || 0), 0), 2) + '</h2><span class="muted small">' + res.ok.length + ' cargos</span></div></div>';
    if (res.excluded.length) html += '<div class="msg bad"><b>' + res.excluded.length + ' cargo(s) excluidos:</b> ' + res.excluded.map((r) => esc(r.name) + ' (' + esc(r.motivo) + ')').join(' · ') + '</div>';
    if (!S.cecos) html += '<div class="msg warn">Sin catálogo All CeCos no se valida la sociedad de los CeCos.</div>';
    const piv = RC.pivotByCeco(res.ok);
    html += UI.table([{ h: 'CeCo destino', k: 'ceco' }, { h: 'MXN', k: 'mxn', num: true, d: 2 }, { h: 'Moneda original', k: 'gbp', num: true, d: 2 }, { h: 'Cargos', k: 'n', num: true }], piv, { total: true, totalLabel: 'Grand Total' });
    sum.innerHTML = html;
  }
  async function downloadC() {
    const p = Object.assign(params(), { exRate: Number($('#rc-rate').value) });
    const wb = await RC.buildReclassWorkbook(S.resC, p);
    await Core.downloadWorkbook(wb, 'Reclasificacion por CeCo.xlsx');
  }
  async function downloadHist() {
    const wb = await RC.buildHistoricPaste(S.resC);
    const p = params();
    await Core.downloadWorkbook(wb, 'Para Historico - ' + p.provider + ' ' + Core.MESES[p.month - 1] + ' ' + p.year + '.xlsx');
  }

  // ---------- D ----------
  function checklist(names) {
    const p = params();
    const items = RC.evidenceChecklist(names, p.provider, p.sociedad);
    const ok = items.filter((i) => i.ok).length;
    $('#rc-ev-result').innerHTML = '<div class="msg ' + (ok === 6 ? 'ok' : 'warn') + '"><b>' + ok + ' de 6</b> evidencias encontradas' + (ok === 6 ? ' · el mes/proveedor está completo ✅' : '') + '</div><ul class="checklist">' +
      items.map((i) => '<li class="' + (i.ok ? 'ok' : 'bad') + '"><span>' + (i.ok ? '✅' : '❌') + '</span><div><b>' + i.id + '. ' + esc(i.label) + '</b><br><span class="muted small">Nombre esperado: <code>' + esc(i.pattern) + '</code></span>' + (i.files.length ? '<br><span class="small">' + i.files.map(esc).join(', ') + '</span>' : '') + '</div></li>').join('') + '</ul>';
  }

  function init() {
    const d = new Date();
    UI.options('#rc-month', Core.MESES.map((m, i) => ({ v: i + 1, t: Core.pad(i + 1) + '. ' + m })), d.getMonth() + 1);
    $('#rc-year').value = d.getFullYear();
    $('#rc-soc').value = UI.config().sociedad || 'MX15';
    updateFolder();
    UI.$$('#rc-tabs button').forEach((b) => b.addEventListener('click', () => {
      UI.$$('#rc-tabs button').forEach((x) => x.classList.toggle('active', x === b));
      UI.$$('#page-reclass .tab').forEach((t) => t.classList.toggle('active', t.id === 'rc-tab-' + b.dataset.tab));
      if (b.dataset.tab === 'c') renderC();
    }));
    ['#rc-provider', '#rc-soc', '#rc-month', '#rc-year'].forEach((s) => $(s).addEventListener('change', () => { updateFolder(); renderA(); renderB(); renderC(); }));
    UI.dropZone('#rc-drop-sup', { onFiles: onSupplier });
    UI.dropZone('#rc-drop-hist', { onFiles: onHist });
    UI.dropZone('#rc-drop-dir', { multiple: true, onFiles: onDir });
    UI.dropZone('#rc-drop-cecos', { onFiles: onCecos });
    UI.dropZone('#rc-drop-ret', { onFiles: onRetrieved });
    UI.dropZone('#rc-drop-ksb1', { onFiles: onKSB1 });
    UI.dropZone('#rc-drop-ev', { multiple: true, accept: '', keepLabel: true, onFiles: async (files) => checklist(files.map((f) => f.name)) });
    $('#rc-ev-folder').addEventListener('change', (e) => checklist(Array.from(e.target.files).filter((f) => f.webkitRelativePath.split('/').length <= 2).map((f) => f.name)));
    $('#rc-rate').addEventListener('input', () => { S.manualRate = true; renderC(); });
    $('#rc-a-download').addEventListener('click', (e) => UI.withBusy(e.currentTarget, downloadA));
    $('#rc-a-email').addEventListener('click', showEmail);
    $('#rc-b-download').addEventListener('click', (e) => UI.withBusy(e.currentTarget, downloadB));
    $('#rc-c-download').addEventListener('click', (e) => UI.withBusy(e.currentTarget, downloadC));
    $('#rc-c-hist').addEventListener('click', (e) => UI.withBusy(e.currentTarget, downloadHist));
  }
  root.PageReclass = { init, S };
})(typeof self !== 'undefined' ? self : this);
