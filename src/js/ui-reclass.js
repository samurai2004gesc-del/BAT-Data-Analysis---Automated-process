/* Pantalla: Reclasificación de costos de movilidad */
(function (root) {
  'use strict';
  const { Core, Reclass: RC, UI, Learn } = root;
  const { $, esc } = UI;
  const S = { sup: null, supName: '', hist: [], dir: [], dirPairs: [], mae: [], maeName: '', cecos: null, ret: null, retName: '', ksb1: null, sel: new Set(), manualRate: false };

  function params() {
    return {
      provider: $('#rc-provider').value.trim() || 'K2', sociedad: ($('#rc-soc').value.trim() || 'MX15').toUpperCase(), month: Number($('#rc-month').value),
      year: Number($('#rc-year').value), deadline: $('#rc-deadline').value.trim() || suggestedDeadline(), account: $('#rc-account').value, sourceCeco: $('#rc-srcceco').value,
      functions: savedFunctions(), sort: $('#rc-sort') ? $('#rc-sort').checked : true
    };
  }
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  /** Fecha límite sugerida para los HRBPs: 5 días hábiles a partir de hoy ("Martes 2 de Diciembre"). */
  function suggestedDeadline(from) {
    const d = from ? new Date(from) : new Date();
    for (let n = 0; n < 5;) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n++; }
    return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + Core.MESES[d.getMonth()];
  }
  function updateFolder() {
    const p = params();
    $('#rc-folder').innerHTML = 'Carpeta del periodo: <code>' + esc(RC.supplierFolder(UI.config().oneId, p.year, p.month, p.provider)) + '</code>';
    UI.$$('.rc-where').forEach((el) => { el.textContent = UI.whereText(rel()); });
    const folder = UI.saveMode() === 'folder';
    const ic = root.Icons.svg(folder ? 'save' : 'download'), verb = folder ? 'Guardar' : 'Descargar';
    $('#rc-a-download').innerHTML = ic + verb + ' “Sent to HRBPs”';
    $('#rc-b-download').innerHTML = ic + verb + ' validación';
    $('#rc-c-download').innerHTML = ic + verb + ' “Reclasificacion por CeCo”';
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

  // ---------- Tabla Función → HRBP ----------
  function savedFunctions() { return UI.config().reclassFunctions || []; }
  function fnTable() { return RC.functionTable(savedFunctions()); }
  function saveFunctions(rows) {
    UI.config().reclassFunctions = rows.filter((r) => Core.str(r.code)).map((r) => ({ code: Core.str(r.code), hrbp: Core.str(r.hrbp), aliases: (r.aliases || []).map(Core.str).filter(Boolean) }));
    UI.saveConfig();
  }
  /** Lo aprendido de los archivos: una tabla explícita manda; la mayoría por función solo llena lo vacío. */
  function applyLearned(learned) {
    const t = fnTable();
    let changed = 0;
    Object.entries(learned).forEach(([code, v]) => {
      let e = t.find((x) => Core.norm(x.code) === Core.norm(code));
      if (!e) { e = { code, hrbp: '', aliases: [code] }; t.push(e); }
      if (v.from === 'tabla' ? e.hrbp !== v.hrbp : !e.hrbp) { e.hrbp = v.hrbp; changed++; }
    });
    if (changed) saveFunctions(t);
    return changed;
  }
  function renderFnTable() {
    const t = fnTable();
    const box = $('#rc-fn-table');
    box.innerHTML = '<table class="t"><thead><tr><th>Home Function</th><th>HRBP</th><th>También se escribe como</th><th></th></tr></thead><tbody>' +
      t.map((f, i) => '<tr><td><input data-fn="code" data-i="' + i + '" value="' + esc(f.code) + '"></td><td><input data-fn="hrbp" data-i="' + i + '" value="' + esc(f.hrbp) + '" placeholder="(sin HRBP)"></td>' +
        '<td><input data-fn="aliases" data-i="' + i + '" value="' + esc(f.aliases.filter((a) => Core.norm(a) !== Core.norm(f.code)).join(', ')) + '"></td><td><button class="mini danger" data-fn-del="' + i + '">Quitar</button></td></tr>').join('') +
      '</tbody></table><div class="actions"><button class="mini" id="rc-fn-add">Agregar función</button><span class="muted small">Los cambios se aplican al momento.</span></div>';
    const commit = () => {
      const rows = t.map((f, i) => ({
        code: $('[data-fn="code"][data-i="' + i + '"]', box).value, hrbp: $('[data-fn="hrbp"][data-i="' + i + '"]', box).value,
        aliases: [$('[data-fn="code"][data-i="' + i + '"]', box).value].concat($('[data-fn="aliases"][data-i="' + i + '"]', box).value.split(','))
      }));
      saveFunctions(rows);
      renderA(); renderB();
    };
    UI.$$('input[data-fn]', box).forEach((x) => x.addEventListener('change', commit));
    UI.$$('[data-fn-del]', box).forEach((b) => b.addEventListener('click', () => { t.splice(Number(b.dataset.fnDel), 1); saveFunctions(t); renderFnTable(); renderA(); renderB(); }));
    $('#rc-fn-add', box).addEventListener('click', () => { t.push({ code: 'Nueva', hrbp: '', aliases: [] }); saveFunctions(t); renderFnTable(); });
  }

  // ---------- A ----------
  /** Directorio aprendido en Bulk (se suma al Histórico como fuente). */
  function histAll() { const K = UI.config().knowledge; return S.hist.concat(K ? Learn.directoryRecords(K) : []); }
  function learnedRule() { const K = UI.config().knowledge; const r = K && K.providers && K.providers[params().provider]; return r && r.found ? r : null; }
  function enrichOpts() { const p = params(); return { mae: S.mae, functions: p.functions, cecos: S.cecos, sociedad: p.sociedad }; }
  async function onSupplier(files) {
    const { f, sheet, rows } = await rowsOf(files[0]);
    S.supBase = RC.detectSupplier(rows);
    S.sup = S.supBase;
    S.supName = f.name;
    const guess = ['K2', 'EY', 'Deloitte', 'SIRVA'].find((p) => new RegExp('\\b' + p + '\\b', 'i').test(f.name));
    if (guess) $('#rc-provider').value = guess;
    const el = $('#rc-sup-info');
    UI.clear(el);
    // Regla aprendida del Bulk para este proveedor
    const rule = learnedRule();
    const applied = rule ? Learn.applyRule(S.supBase, rule) : null;
    if (applied) {
      S.sup = applied;
      UI.msg(el, 'Apliqué lo aprendido en Bulk: ' + esc(Learn.explain(params().provider, rule)) + ' <label class="check" style="display:inline-flex"><input type="checkbox" id="rc-use-rule" checked> usar esta regla</label>', 'info');
      setTimeout(() => { const cb = $('#rc-use-rule'); if (cb) cb.addEventListener('change', () => { S.sup = cb.checked ? applied : S.supBase; renderA(); renderC(); }); });
    }
    const c = S.sup.cols;
    UI.msg(el, S.sup.data.length + ' cargos · hoja ' + esc(sheet) + ' · nombre: <b>' + esc(S.sup.header[c.name]) + '</b>' + (c.amount >= 0 ? ' · monto: <b>' + esc(S.sup.header[c.amount]) + '</b>' : '') + (c.service >= 0 ? ' · servicio: <b>' + esc(S.sup.header[c.service]) + '</b>' : '') +
      (c.ids.length ? ' · número de empleado: <b>' + c.ids.map((i) => esc(S.sup.header[i])).join(', ') + '</b>' : ''), 'ok');
    if (c.amount < 0) UI.msg(el, 'No identifiqué la columna del monto; elígela abajo (el paso C la necesita).', 'warn');
    columnPickers(el, S.sup, () => { renderA(); renderC(); });
    updateFolder();
    renderA();
  }
  async function onMae(files) {
    const { f, rows } = await rowsOf(files[0]);
    const res = RC.readSources(rows, 'MAE');
    UI.clear('#rc-mae-info');
    if (res.kind !== 'mae') { UI.msg('#rc-mae-info', 'Este archivo no parece la MAE (busqué las columnas “Nº pers.” y “Ce.coste”).', 'bad'); return; }
    S.mae = res.records;
    S.maeName = f.name;
    UI.msg('#rc-mae-info', '<b>' + UI.num(S.mae.length) + '</b> personas · ' + esc(f.name) + '<br><span class="small">Solo se usa en esta sesión: no se guarda en el navegador.</span>', 'ok');
    renderA(); renderB();
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
    S.dirPairs = [];
    let people = 0, maeFound = false;
    for (let k = 0; k < files.length; k++) {
      const file = files[k];
      const f = await UI.readFile(file);
      f.wb.SheetNames.forEach((sn) => {
        const res = RC.readSources(Core.sheetRows(f.wb.Sheets[sn]), file.name);
        if (res.kind === 'mae') { S.mae = res.records; S.maeName = file.name; maeFound = true; return; }
        // Los archivos que se sueltan después cuentan como más recientes
        res.records.forEach((r) => { if (!r.order) r.order = 1e6 + k; });
        S.dir = S.dir.concat(res.records);
        S.dirPairs = S.dirPairs.concat(res.pairs);
        people += res.records.length;
      });
    }
    const changed = applyLearned(RC.learnFunctionHrbp(S.dir, S.dirPairs, fnTable()));
    UI.clear('#rc-dir-info');
    UI.msg('#rc-dir-info', people + ' renglones de personas' + (S.dirPairs.length ? ' · tabla Función → HRBP con ' + S.dirPairs.length + ' funciones' : '') + (changed ? ' · actualicé el HRBP de ' + changed + ' función(es)' : ''), people || S.dirPairs.length ? 'ok' : 'warn');
    if (maeFound) UI.msg('#rc-dir-info', 'Uno de los archivos es la MAE: la usé como MAE.', 'info');
    if (maeFound) { UI.clear('#rc-mae-info'); UI.msg('#rc-mae-info', '<b>' + UI.num(S.mae.length) + '</b> personas · ' + esc(S.maeName), 'ok'); }
    renderFnTable();
    renderA(); renderB();
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
    const opts = (sel) => '<option value="-1">(ninguna)</option>' + sup.header.map((h, i) => '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + Core.colLetter(i) + ' · ' + esc(decodeX(h)) + '</option>').join('');
    const box = document.createElement('div');
    box.className = 'grid g3';
    box.innerHTML = '<label>Columna de monto<select data-c="amount">' + opts(sup.cols.amount) + '</select></label>' +
      '<label>Columna de servicio<select data-c="service">' + opts(sup.cols.service) + '</select></label>' +
      '<label>Columna de moneda<select data-c="currency">' + opts(sup.cols.currency) + '</select></label>';
    el.appendChild(box);
    UI.$$('select', box).forEach((x) => x.addEventListener('change', () => { sup.cols[x.dataset.c] = Number(x.value); after(); }));
  }
  function amountOf(sup, d) { return sup.cols.amount >= 0 ? Core.parseNum(d.raw[sup.cols.amount]) : null; }
  const flagText = (e, field) => (e.flags || []).filter((f) => f.field === field).map((f) => f.text).join(' · ');
  function previewTable(sup, enriched) {
    const p = params();
    const rows = sup.data.map((d, k) => ({ d, e: enriched[k] }));
    const cls = (e, field) => (flagText(e, field) ? 'empty' : e[field] ? 'found' : 'empty');
    return UI.table([
      { h: 'Fila', f: (r) => r.d._row }, { h: 'Assignee Name', f: (r) => r.d.name },
      { h: 'Monto', f: (r) => amountOf(sup, r.d), num: true, d: 2 },
      { h: 'Servicio', f: (r) => (sup.cols.service >= 0 ? r.d.raw[sup.cols.service] : '') },
      { h: 'Home Function', f: (r) => r.e.func, cls: (r) => cls(r.e, 'func'), title: (r) => 'Origen: ' + (r.e.from.func || '(sin dato)') },
      { h: 'HRBP', f: (r) => r.e.hrbp, cls: (r) => cls(r.e, 'hrbp'), title: (r) => 'Origen: ' + (r.e.from.hrbp || '(sin dato)') },
      { h: 'CeCo', f: (r) => r.e.ceco, cls: (r) => cls(r.e, 'ceco'), title: (r) => 'Origen: ' + (r.e.from.ceco || '(sin dato)') },
      { h: 'Ceco Oficial (MAE)', f: (r) => r.e.cecoOf + (r.e.cecoDiff ? ' (distinto)' : ''), cls: (r) => (r.e.cecoDiff || flagText(r.e, 'cecoOf') ? 'warnc' : ''), title: (r) => (r.e.mae ? 'MAE: ' + r.e.mae.name + ' (' + r.e.mae.how + ')' : 'No está en la MAE') },
      { h: 'Encontrado en', f: (r) => [r.e.matchedName ? 'historial: ' + r.e.matchedName + ' (' + r.e.how + ')' : '', r.e.mae ? 'MAE: ' + r.e.mae.name + ' (' + r.e.mae.how + ')' : ''].filter(Boolean).join(' · ') || '(no encontrado)' },
      { h: 'Por confirmar', f: (r) => (r.e.flags || []).map((x) => x.text).join(' · ') },
      { h: 'Sociedad ' + p.sociedad, f: (r) => { if (!S.cecos) return 'carga All CeCos'; const v = RC.validateCeco(r.e.ceco, S.cecos, p.sociedad); return v.status === 'OK' ? 'OK' : v.text; }, cls: (r) => (!S.cecos ? '' : RC.validateCeco(r.e.ceco, S.cecos, p.sociedad).status === 'OK' ? 'okc' : 'badc') }
    ], rows, { total: sup.cols.amount >= 0 });
  }
  function summaryHtml(sup, enr) {
    // Se cuenta por persona (una persona puede tener varios cargos)
    const byPerson = new Map();
    sup.data.forEach((d, k) => { const key = Core.norm(d.name); if (!byPerson.has(key)) byPerson.set(key, []); byPerson.get(key).push(enr[k]); });
    const people = byPerson.size;
    const count = (fn) => Array.from(byPerson.values()).filter((list) => list.some(fn)).length;
    const inFile = (field) => (e) => e.flags.some((f) => f.field === field && f.file !== false);
    const inApp = (field) => (e) => e.flags.some((f) => f.field === field && f.file === false);
    const pill = (n, txt, kind) => '<span class="pill ' + kind + '">' + n + ' ' + txt + '</span>';
    const opt = (n, txt, kind) => (n ? ' ' + pill(n, txt, kind) : '');
    const yellow = count((e) => e.flags.some((f) => f.file !== false));
    const missingFn = Array.from(new Set(enr.filter((e) => e.func && !e.hrbp).map((e) => e.func))).sort();
    return '<div class="msg ' + (yellow ? 'warn' : 'ok') + '">' + sup.data.length + ' cargos de ' + people + ' personas. ' +
      pill(count((e) => e.mae), 'en la MAE', 'ok') + ' ' + pill(count((e) => e.matchedName), 'con historial', 'ok') + ' ' +
      pill(yellow, 'con algo en amarillo', yellow ? 'bad' : 'ok') +
      opt(count(inFile('ceco')), 'CeCo por confirmar', 'bad') + opt(count(inFile('func')), 'sin función', 'bad') + opt(count((e) => !e.hrbp), 'sin HRBP', 'bad') +
      '<br><span class="small">Para revisar en la app (no se pinta en el archivo):</span>' +
      opt(count(inApp('func')), 'función sugerida por la MAE', 'warn') + opt(count(inApp('cecoOf')), 'en la MAE por nombre parecido', 'warn') +
      opt(count((e) => e.cecoDiff), 'con CeCo distinto al de la MAE', 'warn') +
      (count(inApp('func')) + count(inApp('cecoOf')) + count((e) => e.cecoDiff) ? '' : ' <span class="small">nada.</span>') +
      '<br><span class="small">En el archivo, lo que falta confirmar queda en amarillo con una nota. Pasa el cursor sobre Home Function, HRBP, CeCo o Ceco Oficial para ver de dónde salió cada dato.</span>' +
      (missingFn.length ? '<br><b>Sin HRBP en la tabla Función → HRBP:</b> ' + missingFn.map(esc).join(', ') + '. Agrégalas en “Funciones y HRBP” y se llenan solas.' : '') +
      (!S.mae.length ? '<br><span class="small">Sin la MAE no se llena “Ceco Oficial” ni se sugiere la función de personas nuevas.</span>' : '') +
      (!fnTable().some((f) => f.hrbp) ? '<br><b>La tabla Función → HRBP está vacía:</b> carga un Sent/Retrieved anterior o captúrala en “Funciones y HRBP”.' : '') + '</div>';
  }
  function renderA() {
    if (!S.sup) return;
    S.enrA = RC.enrich(S.sup, histAll(), S.dir, enrichOpts());
    $('#rc-a-summary').innerHTML = summaryHtml(S.sup, S.enrA);
    $('#rc-a-preview').innerHTML = previewTable(S.sup, S.enrA);
    $('#rc-a-download').disabled = false;
    $('#rc-a-email').disabled = false;
    $('#rc-a-eml').disabled = false;
  }
  async function sentWorkbook() { return RC.buildSentToHRBP(S.sup, S.enrA, params()); }
  async function downloadA() {
    const p = params();
    await UI.save(p.year, async () => [await UI.wbFile(rel() + '/' + fileNames().sent, await sentWorkbook())]);
  }
  function hrbpNames(enr) { return Array.from(new Set(enr.map((e) => e.hrbp).filter(Boolean).flatMap((h) => h.split('/').map((x) => x.trim())))); }
  async function emlA() {
    const p = params();
    const m = RC.emailToHRBPs(p);
    const wb = await sentWorkbook();
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
      ' <a class="btnlike" href="mailto:?subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body) + '">Abrir en Outlook</a> <span class="muted small">Recuerda adjuntar el archivo “Sent to HRBPs”.</span></div></div>';
  }

  // ---------- B ----------
  async function onRetrieved(files) {
    const { f, rows } = await rowsOf(files[0]);
    S.ret = RC.detectSupplier(rows);
    S.retName = f.name;
    UI.clear('#rc-b-info');
    const c = S.ret.cols;
    const yn = (x) => (x >= 0 ? 'sí' : 'no');
    UI.msg('#rc-b-info', S.ret.data.length + ' cargos · columnas encontradas: CeCo ' + yn(c.ceco) + ' · HRBP ' + yn(c.hrbp) + ' · Home Function ' + yn(c.func) + ' · Ceco Oficial ' + yn(c.cecoOf), c.ceco >= 0 ? 'ok' : 'bad');
    if (!S.cecos) UI.msg('#rc-b-info', 'Carga el catálogo “All CeCos - Approvers” en la pestaña A para validar.', 'warn');
    columnPickers($('#rc-b-info'), S.ret, () => { renderB(); renderC(); });
    renderB(); renderC();
  }
  function renderB() {
    if (!S.ret) return;
    const p = params();
    S.enrB = RC.enrich(S.ret, histAll(), S.dir, enrichOpts());
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
    box.innerHTML = '<div class="msg bad"><b>' + keys.reduce((a, k) => a + bad[k].length, 0) + ' cargo(s) con CeCo incorrecto.</b> No procedas a la reclasificación sin corregir. Correos sugeridos:</div>' +
      keys.map((h, i) => {
        const m = RC.emailInvalidCecos(h, bad[h], p);
        const to = UI.emailsFor([h]);
        return '<div class="filecard"><div class="kv"><span class="k">Para</span><span>' + esc(to.emails.join('; ') || h) + (to.missing.length ? ' <span class="pill bad">sin correo en el directorio</span>' : '') + '</span><button class="mini primary" data-eml="' + i + '">Borrador (.eml)</button>' +
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
  function base() { return S.ret ? { sup: S.ret, enr: S.enrB || RC.enrich(S.ret, histAll(), S.dir, enrichOpts()) } : S.sup ? { sup: S.sup, enr: S.enrA || RC.enrich(S.sup, histAll(), S.dir, enrichOpts()) } : null; }
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
        { h: 'Usar', raw: true, f: (l) => '<input type="checkbox" data-k="' + S.ksb1.indexOf(l) + '"' + (S.sel.has(S.ksb1.indexOf(l)) ? ' checked' : '') + '>' },
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
      '<div class="block"><div class="muted small">Cargo seleccionado en SAP</div><h2>' + (S.ksb1 ? UI.num(sapTot, 2) : '-') + '</h2>' + (S.ksb1 && sapSel.length ? '<span class="pill ' + (diff === 0 ? 'ok' : 'bad') + '">' + (diff === 0 ? 'Coincide' : 'Diferencia ' + UI.num(diff, 2)) + '</span>' : '') + '</div>' +
      '<div class="block"><div class="muted small">Tipo de cambio</div><h2>' + (rate ? UI.num(rate, 4) : '-') + '</h2></div>' +
      '<div class="block"><div class="muted small">A reclasificar (MXN)</div><h2>' + UI.num(res.ok.reduce((a, r) => a + (r.mxn || 0), 0), 2) + '</h2><span class="muted small">' + res.ok.length + ' cargos</span></div></div>';
    if (res.excluded.length) html += '<div class="msg bad"><b>' + res.excluded.length + ' cargo(s) excluidos:</b> ' + res.excluded.map((r) => esc(r.name) + ' (' + esc(r.motivo) + ')').join(' · ') + '</div>';
    if (!S.cecos) html += '<div class="msg warn">Sin catálogo All CeCos no se valida la sociedad de los CeCos.</div>';
    const lr = !S.ksb1 && Learn.rateFor(UI.config().knowledge, p.provider, p.year, p.month);
    if (lr) html += '<div class="msg info">Tipo de cambio registrado para ' + esc(lr.provider) + ' en ' + Core.MESES[lr.month - 1] + ' ' + lr.year + ': <b>' + UI.num(lr.rate, 4) + '</b> (aprendido de tu Histórico). Para este mes lo correcto es el del cargo en KSB1. <button class="mini" id="rc-use-rate">Usar como referencia</button></div>';
    const piv = RC.pivotByCeco(res.ok);
    html += UI.table([{ h: 'CeCo destino', k: 'ceco' }, { h: 'MXN', k: 'mxn', num: true, d: 2 }, { h: 'Moneda original', k: 'gbp', num: true, d: 2 }, { h: 'Cargos', k: 'n', num: true }], piv, { total: true, totalLabel: 'Grand Total' });
    sum.innerHTML = html;
    const ub = $('#rc-use-rate');
    if (ub) ub.addEventListener('click', () => { $('#rc-rate').value = lr.rate; S.manualRate = true; renderC(); });
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
    $('#rc-ev-result').innerHTML = '<div class="msg ' + (ok === 6 ? 'ok' : 'warn') + '"><b>' + ok + ' de 6</b> evidencias encontradas' + (ok === 6 ? ' · el mes/proveedor está completo' : '') + '</div><ul class="checklist">' +
      items.map((i) => '<li class="' + (i.ok ? 'ok' : 'bad') + '"><span class="pill ' + (i.ok ? 'ok' : 'bad') + '">' + (i.ok ? 'OK' : 'Falta') + '</span><div><b>' + i.id + '. ' + esc(i.label) + '</b><br><span class="muted small">Nombre esperado: <code>' + esc(i.pattern) + '</code></span>' + (i.files.length ? '<br><span class="small">' + i.files.map(esc).join(', ') + '</span>' : '') + '</div></li>').join('') + '</ul>';
  }

  function init() {
    const d = new Date();
    UI.options('#rc-month', Core.MESES.map((m, i) => ({ v: i + 1, t: Core.pad(i + 1) + '. ' + m })), d.getMonth() + 1);
    $('#rc-year').value = d.getFullYear();
    $('#rc-soc').value = UI.config().sociedad || 'MX15';
    $('#rc-deadline').placeholder = suggestedDeadline() + ' (sugerida)';
    const K = UI.config().knowledge;
    if (K && K.directory && K.directory.length) UI.msg('#rc-hist-info', 'Además uso lo aprendido en Bulk: ' + UI.num(K.directory.length) + ' personas (HRBP / función / CeCo).', 'info');
    UI.loadCatalog().then((cat) => { if (cat && !S.cecos) { S.cecos = cat; showCatalog('cache'); renderA(); renderB(); renderC(); } });
    updateFolder();
    renderFnTable();
    UI.$$('#rc-tabs button').forEach((b) => b.addEventListener('click', () => {
      UI.$$('#rc-tabs button').forEach((x) => x.classList.toggle('active', x === b));
      UI.$$('#page-reclass .tab').forEach((t) => t.classList.toggle('active', t.id === 'rc-tab-' + b.dataset.tab));
      if (b.dataset.tab === 'c') renderC();
    }));
    ['#rc-provider', '#rc-soc', '#rc-month', '#rc-year'].forEach((s) => $(s).addEventListener('change', () => { updateFolder(); renderA(); renderB(); renderC(); }));
    UI.dropZone('#rc-drop-sup', { onFiles: onSupplier });
    UI.dropZone('#rc-drop-mae', { onFiles: onMae });
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
  root.PageReclass = { init, S, renderFnTable, applyLearned };
})(typeof self !== 'undefined' ? self : this);
