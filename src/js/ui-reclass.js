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
    UI.$$('.rc-where').forEach((el) => { el.textContent = UI.whereText(rel()); });
    const folder = UI.saveMode() === 'folder';
    $('#rc-a-download').innerHTML = folder ? '💾 Guardar “Sent to HRBPs”' : '⬇ Descargar “Sent to HRBPs”';
    $('#rc-b-download').innerHTML = folder ? '💾 Guardar validación' : '⬇ Descargar validación';
    $('#rc-c-download').innerHTML = folder ? '💾 Guardar “Reclasificacion por CeCo”' : '⬇ Descargar “Reclasificacion por CeCo”';
    $('#rc-ev-check').disabled = !folder;
    $('#rc-ev-check').title = folder ? '' : 'Elige la carpeta Tracker en Configuración para usar esta opción';
  }
  function rel() { const p = params(); return RC.supplierRelPath(p.month, p.provider); }
  function fileNames() {
    const p = params();
    return { sent: 'Sent to HRBPs - ' + p.sociedad + ' ' + p.provider + '.xlsx', val: 'Validacion CeCos - ' + p.sociedad + ' ' + p.provider + '.xlsx', recl: 'Reclasificacion por CeCo.xlsx', hist: 'Para Historico - ' + p.provider + ' ' + Core.MESES[p.month - 1] + ' ' + p.year + '.xlsx' };
  }
  /** Muestra a quién va el correo y qué nombres no están en el directorio. */
  function mailInfo(el, to, missing) {
    $(el).innerHTML = missing.length ? '<div class="msg warn">Sin correo en el directorio para: ' + esc(missing.join(', ')) + '. Agrégalos en Configuración › Correos o escríbelos en Outlook.</div>' : (to.length ? '<div class="msg ok small">Para: ' + esc(to.join('; ')) + '</div>' : '');
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
    if (c.amount < 0) UI.msg(el, 'No identifiqué la columna del monto; elígela abajo (el paso C la necesita).', 'warn');
    columnPickers(el, S.sup, () => { renderA(); renderC(); });
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
    UI.clear('#rc-cecos-info');
    UI.msg('#rc-cecos-info', 'Leyendo el catálogo… (el All CeCos completo tiene ~380 mil filas y puede tardar de 20 a 40 segundos; solo se hace una vez)', 'info');
    await new Promise((r) => setTimeout(r, 50));
    const buf = await Core.readFileAsArrayBuffer(files[0]);
    const wb = Core.readWorkbook(new Uint8Array(buf), { dense: true, cellNF: false, cellText: false });
    const sheet = wb.SheetNames[0];
    S.cecos = RC.readCecos(Core.sheetRows(wb.Sheets[sheet]));
    S.cecos.date = Core.stamp();
    S.cecos.file = files[0].name;
    const saved = await UI.saveCatalog({ map: S.cecos.map, count: S.cecos.count, cecoCol: S.cecos.cecoCol, socCol: S.cecos.socCol, date: S.cecos.date, file: S.cecos.file });
    showCatalog(saved);
    renderA(); renderB(); renderC();
  }
  function showCatalog(saved) {
    UI.clear('#rc-cecos-info');
    if (!S.cecos) return;
    const note = saved === true ? '<br><span class="small">Guardado en este navegador: la próxima vez no necesitas volver a cargarlo.</span>'
      : saved === 'cache' ? '<br><span class="small">Catálogo guardado de una sesión anterior. Arrastra uno nuevo para actualizarlo.</span>' : '';
    UI.msg('#rc-cecos-info', '<b>' + UI.num(S.cecos.count) + '</b> CeCos · ' + esc(S.cecos.file || '') + ' (' + esc(S.cecos.date || '') + ') · CeCo = columna ' + Core.colLetter(S.cecos.cecoCol) + ', Sociedad = columna ' + Core.colLetter(S.cecos.socCol) + note, S.cecos.count ? 'ok' : 'bad');
  }
  const decodeX = (t) => String(t || '').replace(/_x([0-9a-f]{4})_/gi, (m, x) => String.fromCharCode(parseInt(x, 16))).replace(/\s+/g, ' ');
  /** Selectores para corregir la columna de monto / servicio / moneda si el proveedor cambia su formato. */
  function columnPickers(el, sup, after) {
    const opts = (sel) => '<option value="-1">— ninguna —</option>' + sup.header.map((h, i) => '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + Core.colLetter(i) + ' · ' + esc(decodeX(h)) + '</option>').join('');
    const box = document.createElement('div');
    box.className = 'grid g3';
    box.innerHTML = '<label>Columna de monto<select data-c="amount">' + opts(sup.cols.amount) + '</select></label>' +
      '<label>Columna de servicio<select data-c="service">' + opts(sup.cols.service) + '</select></label>' +
      '<label>Columna de moneda<select data-c="currency">' + opts(sup.cols.currency) + '</select></label>';
    el.appendChild(box);
    UI.$$('select', box).forEach((x) => x.addEventListener('change', () => { sup.cols[x.dataset.c] = Number(x.value); after(); }));
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
    $('#rc-a-eml').disabled = false;
  }
  async function downloadA() {
    const p = params();
    await UI.save(p.year, async () => [await UI.wbFile(rel() + '/' + fileNames().sent, await RC.buildSentToHRBP(S.sup, S.enrA, p))]);
  }
  function hrbpNames(enr) { return Array.from(new Set(enr.map((e) => e.hrbp).filter(Boolean).flatMap((h) => h.split('/').map((x) => x.trim())))); }
  async function emlA() {
    const p = params();
    const m = RC.emailToHRBPs(p);
    const wb = await RC.buildSentToHRBP(S.sup, S.enrA, p);
    const to = UI.emailsFor(hrbpNames(S.enrA));
    mailInfo('#rc-a-mailinfo', to.emails, to.missing);
    UI.downloadEml({ to: to.emails, cc: UI.config().ccDefault, subject: m.subject, text: m.body, attachments: [{ name: fileNames().sent, data: await wb.xlsx.writeBuffer(), type: Core.XLSX_MIME }] });
  }
  function showEmail() {
    const p = params();
    const m = RC.emailToHRBPs(p);
    const hrbps = hrbpNames(S.enrA);
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
    columnPickers($('#rc-b-info'), S.ret, () => { renderB(); renderC(); });
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
      keys.map((h, i) => {
        const m = RC.emailInvalidCecos(h, bad[h], p);
        const to = UI.emailsFor([h]);
        return '<div class="filecard"><div class="kv"><span class="k">Para</span><span>' + esc(to.emails.join('; ') || h) + (to.missing.length ? ' <span class="pill bad">sin correo en el directorio</span>' : '') + '</span><button class="mini primary" data-eml="' + i + '">✉ Borrador (.eml)</button>' +
          '<span class="k">Asunto</span><span>' + esc(m.subject) + '</span>' + UI.copyable(m.subject) + '</div><textarea style="min-height:150px">' + esc(m.body) + '</textarea>' + UI.copyable(m.body) + '</div>';
      }).join('');
    UI.$$('[data-eml]', box).forEach((b) => b.addEventListener('click', () => {
      const h = keys[Number(b.dataset.eml)];
      const m = RC.emailInvalidCecos(h, bad[h], p);
      const body = b.closest('.filecard').querySelector('textarea').value;
      UI.downloadEml({ to: UI.emailsFor([h]).emails, cc: UI.config().ccDefault, subject: m.subject, text: body });
    }));
  }
  async function downloadB() {
    const p = params();
    await UI.save(p.year, async () => [await UI.wbFile(rel() + '/' + fileNames().val, await RC.buildValidated(S.ret, S.enrB, S.cecos, p))]);
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
    $('#rc-c-eml').disabled = !ok;
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
    await UI.save(p.year, async () => [await UI.wbFile(rel() + '/' + fileNames().recl, await RC.buildReclassWorkbook(S.resC, p))]);
  }
  async function downloadHist() {
    const p = params();
    await UI.save(p.year, async () => [await UI.wbFile(rel() + '/' + fileNames().hist, await RC.buildHistoricPaste(S.resC))]);
  }
  async function emlC() {
    const p = Object.assign(params(), { exRate: Number($('#rc-rate').value) });
    const m = RC.emailReclass(S.resC, p);
    const wb = await RC.buildReclassWorkbook(S.resC, p);
    const c = UI.config();
    const b = base();
    // Para: Intern de Planning · CC: su Line Manager / HR Data Analyst LM (Configuración) + HRBPs involucrados
    const hr = UI.emailsFor(hrbpNames(b.enr));
    const to = UI.emailsFor([c.planningTo || '']);
    const cc = UI.emailsFor([c.reclassCc || '']).emails.concat(hr.emails);
    mailInfo('#rc-c-mailinfo', to.emails, to.missing.concat(hr.missing));
    if (!c.planningTo) UI.toast('Tip: captura el correo del Intern de Planning en Configuración › Correos.', 'info', 6000);
    UI.downloadEml({ to: to.emails, cc, subject: m.subject, text: m.body, attachments: [{ name: fileNames().recl, data: await wb.xlsx.writeBuffer(), type: Core.XLSX_MIME }] });
  }

  // ---------- D ----------
  async function checkFolder() {
    const p = params();
    try {
      checklist(await UI.listFolder(p.year, rel()));
    } catch (e) {
      if (e.name === 'NotFoundError') throw new Error('No existe la carpeta ' + rel().replace(/\//g, '\\') + ' dentro de ' + p.year + '\\Tracker.');
      throw e;
    }
  }
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
    UI.loadCatalog().then((cat) => { if (cat && !S.cecos) { S.cecos = cat; showCatalog('cache'); renderA(); renderB(); renderC(); } });
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
    $('#rc-a-eml').addEventListener('click', (e) => UI.withBusy(e.currentTarget, emlA));
    $('#rc-c-eml').addEventListener('click', (e) => UI.withBusy(e.currentTarget, emlC));
    $('#rc-ev-check').addEventListener('click', (e) => UI.withBusy(e.currentTarget, checkFolder));
    document.addEventListener('hrss-folder', updateFolder);
    $('#rc-b-download').addEventListener('click', (e) => UI.withBusy(e.currentTarget, downloadB));
    $('#rc-c-download').addEventListener('click', (e) => UI.withBusy(e.currentTarget, downloadC));
    $('#rc-c-hist').addEventListener('click', (e) => UI.withBusy(e.currentTarget, downloadHist));
  }
  root.PageReclass = { init, S };
})(typeof self !== 'undefined' ? self : this);
