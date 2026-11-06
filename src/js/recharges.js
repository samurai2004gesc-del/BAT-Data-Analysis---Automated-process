/* Recobros Intercompañía por Costos de Expatriados.
 *  1) Tracker: arma el Tracker del periodo a partir de la lista de asignaciones (o la hoja "People"
 *     de Estimate Benefits), con notas para SAP, nombres de archivo, rutas y columnas de seguimiento.
 *  2) Formatos SAP: toma Estimate Benefits (o las copias de las hojas) y genera el Shopping Cart, Webi,
 *     JVU y Accrual en Excel + TXT delimitado por tabulaciones, sin filas vacías, con la nomenclatura
 *     y carpetas correctas, listos en un ZIP. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.Recharges = factory(root.Core);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';
  const { norm, isBlank, str, parseNum, parseDate, fmtDate } = Core;

  const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const MONTH_EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---------- Asignaciones ----------
  const ASSIGN_FIELDS = [
    ['key', 'Key', [/^key$/, /^id$/, /^#$/, /^no\.?$/]],
    ['nombre', 'Nombre', [/^nombre$/, /assignee name/, /^name$/, /nombre/, /employee name/]],
    ['payroll', 'Payroll Num.', [/payroll/, /numnom/, /num\.? ?nom/, /no\.? empleado/, /employee (id|number)/]],
    ['area', 'Área', [/^area$/, /area/, /function/, /funcion/, /departamento/]],
    ['sociedad', 'Sociedad', [/sociedad/, /company code/, /^soc/]],
    ['ceco', 'CeCo', [/^ce\.? ?co(ste)?$/, /ce\.?co/, /cost cent/, /centro de cost/]],
    ['grade', 'Grade', [/grade/, /grado/]],
    ['host', 'Host Country', [/host country/, /pais destino/, /^country$/, /^pais$/, /host(?!.*(hrbp|entity|region|gmsp|approver))/, /country/]],
    ['tipo', 'Tipo asignación', [/tipo/, /assignment type/, /type/]],
    ['desde', 'Desde', [/desde/, /^from$/, /start/, /inicio/]],
    ['hasta', 'Hasta', [/hasta/, /^to$/, /termino/, /end/, /fin/]],
    ['ic', 'IC code', [/ic code/, /receiving entity ic/, /^ic/, /intercompany/]],
    ['coder', 'Coder', [/receiving entity coder$/, /^coder$/, /coder(?!.*email)/, /aprobador/]],
    ['coderEmail', 'Coder email', [/coder.*e-?mail/, /e-?mail/, /correo/]],
    ['hrbp', 'HRBP', [/^hrbp$/, /hrbp/]],
    ['currency', 'Moneda', [/^currency$/, /^moneda$/, /currency/]],
    ['markup', 'Mark up', [/mark ?up/]],
    ['po', 'RRB PO', [/rrb ?po/, /rrb wbs/, /^po$/]]
  ];
  function guessAssignmentColumns(headers) {
    const H = headers.map(norm);
    const used = new Set();
    const cols = {};
    ASSIGN_FIELDS.forEach(([k, , pats]) => {
      let idx = -1;
      for (const re of pats) { idx = H.findIndex((h, i) => h && !used.has(i) && re.test(h)); if (idx >= 0) break; }
      cols[k] = idx;
      if (idx >= 0) used.add(idx);
    });
    return cols;
  }
  const GENERIC_SHEETS = /^(sheet|hoja|people|data|datos|asignaciones|tabla)\s*\d*$/;
  /** Lee todas las hojas del libro que parezcan una lista de asignaciones. */
  function readAssignments(wb) {
    const out = [];
    const sheets = [];
    // Las hojas que parecen Tracker (Webi, PO, JVU…) no son la lista de asignaciones: se usan como "Tracker anterior"
    const DETAIL = ['payroll', 'ceco', 'tipo', 'ic', 'coderEmail', 'grade', 'sociedad', 'desde', 'hasta'];
    const hiddenSheets = new Set(((wb.Workbook && wb.Workbook.Sheets) || []).filter((x) => x.Hidden).map((x) => x.name));
    const cands = [];
    wb.SheetNames.forEach((sn) => {
      if (hiddenSheets.has(sn)) return;
      const rows = Core.sheetRows(wb.Sheets[sn]);
      const h = Core.findHeaderRow(rows, ['Nombre', 'Name', 'Payroll', 'CeCo', 'Ce.coste', 'Host Country', 'Key', 'NumNom', 'Sociedad'], 40);
      if (h < 0) return;
      const headers = rows[h] || [];
      const cols = guessAssignmentColumns(headers);
      if (cols.nombre < 0 || (cols.ceco < 0 && cols.payroll < 0 && cols.key < 0)) return;
      cands.push({ sn, rows, h, headers, cols, score: DETAIL.filter((k) => cols[k] >= 0).length });
    });
    const best = cands.reduce((m, c) => Math.max(m, c.score), 0);
    cands.filter((c) => c.score >= Math.min(3, best)).forEach(({ sn, rows, h, headers, cols }) => {
      sheets.push({ sheet: sn, headerRow: h + 1, cols, headers: Core.headerLabels(headers) });
      const areaFromSheet = GENERIC_SHEETS.test(norm(sn)) ? '' : sn.trim();
      for (let i = h + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const get = (k) => (cols[k] >= 0 ? r[cols[k]] : null);
        const nombre = str(get('nombre'));
        if (!nombre || /^(nombre|name|total|grand total|row labels|by status|status|\(blank\))$/.test(norm(nombre))) continue;
        // Con columna Key, solo cuentan las filas con un KEY numérico (lo demás suelen ser tablas dinámicas debajo)
        if (cols.key >= 0 && !/^\d+(\.0+)?$/.test(str(get('key')))) continue;
        const a = {};
        ASSIGN_FIELDS.forEach(([k]) => { a[k] = str(get(k)); });
        a.nombre = nombre;
        if (!a.area) a.area = areaFromSheet;
        a.sheet = sn;
        out.push(a);
      }
    });
    // Asigna KEY consecutivo a quien no lo traiga y elimina duplicados exactos (misma persona repetida en dos hojas)
    const seen = new Set();
    const dedup = [];
    out.forEach((a) => {
      const id = norm(a.nombre) + '|' + norm(a.payroll) + '|' + norm(a.host);
      if (seen.has(id)) return;
      seen.add(id);
      dedup.push(a);
    });
    let next = dedup.reduce((m, a) => Math.max(m, parseInt(a.key, 10) || 0), 0) + 1;
    dedup.forEach((a) => { if (!a.key) { a.key = String(next++); a._autoKey = true; } });
    return { assignments: dedup, sheets };
  }

  // ---------- Nombres y nomenclatura ----------
  const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'van', 'von', 'da', 'dos', 'das', 'di']);
  /** "Balboa Ramirez Marco Antonio" -> {apellido:"Balboa", inicial:"M"}  (formato Apellidos Nombre).
   *  order = 'nombre-apellido' para nombres tipo "Jose Nicolas Rivolta". */
  function nameParts(full, order) {
    const t = str(full).split(/\s+/).filter(Boolean);
    if (!t.length) return { apellido: '', inicial: '', nombres: '' };
    if (t.length === 1) return { apellido: t[0], inicial: '', nombres: '' };
    const isP = (w) => PARTICLES.has(w.toLowerCase());
    // Avanza sobre un apellido (incluye partículas: "De La Garza")
    const surnameEnd = (from) => { let i = from; while (i < t.length - 1 && isP(t[i])) i++; return i + 1; };
    if (order === 'nombre-apellido') {
      const given = t.length >= 4 ? 2 : 1;
      const ap = t.slice(given, surnameEnd(given)).join(' ');
      return { apellido: ap, inicial: t[0][0].toUpperCase(), nombres: t.slice(0, given).join(' ') };
    }
    const first = surnameEnd(0);
    let given = t.length === 2 ? 1 : surnameEnd(first);
    if (given > t.length - 1) given = t.length - 1;
    return { apellido: t.slice(0, first).join(' '), inicial: t[given][0].toUpperCase(), nombres: t.slice(given).join(' ') };
  }
  function periodShort(half, year) { return half + "'" + String(year).slice(-2); }
  function noteTitle(a, half, year, order) { const p = nameParts(a.nombre, order); return 'Recharge ' + periodShort(half, year) + ' ' + p.apellido + ' ' + p.inicial + '.'; }
  function noteText(a, half, year) { return 'Recharge From ' + half + "'" + year + ' From ' + a.nombre + ' Cost to ' + (a.host || '{Host Country}'); }
  function fileName(key, kind, nombre) { return Core.safeFileName(key + '. ' + kind + ' ' + nombre); }
  function folderName(key, nombre) { return Core.safeFileName(key + '. ' + nombre); }
  function monthToMark(serial) { const { m } = Core.serialToYMD(serial); return MONTH_EN_SHORT[m % 12]; }
  function basePath(oneId, year) { return 'C:\\Users\\' + (oneId || '{OneID}') + '\\BAT\\Gerencia HRSS-Organización - General\\' + year; }
  function paths(oneId, year, half) {
    const b = basePath(oneId, year) + '\\Tracker\\Recharges\\' + periodShort(half, year);
    return { webis: b + '\\Webis', jvus: b + '\\JVUs', accruals: b + '\\Accruals' };
  }
  function seCompanyCode(sociedad) { const s = str(sociedad).toUpperCase(); return s ? (s.startsWith('IC-') ? s : 'IC-00-' + s) : ''; }

  const STATUSES = ['Pendiente de información', 'Webi cargado', 'En aprobación (1/3)', 'En aprobación (2/3)', 'En aprobación (3/3)', 'Aprobado - PO generada', 'JVU cargado', 'JVU contabilizado (Batch ID)', 'Accrual cargado', 'Validado en FBL5N', 'Rechazado', 'Cancelado'];

  const TRACKER_COLS = [
    { header: 'Key', key: 'key', width: 6 }, { header: 'Nombre (Apellidos Nombre)', key: 'nombre', width: 34 },
    { header: 'Payroll Num.', key: 'payroll', width: 12 }, { header: 'Área', key: 'area', width: 16 },
    { header: 'Sociedad', key: 'sociedad', width: 9 }, { header: 'SE Company Code', key: 'se', width: 13 },
    { header: 'CeCo', key: 'ceco', width: 13 }, { header: 'Grade', key: 'grade', width: 7 },
    { header: 'Host Country', key: 'host', width: 14 }, { header: 'Tipo asignación', key: 'tipo', width: 12 },
    { header: 'Desde', key: 'desde', width: 9 }, { header: 'Hasta', key: 'hasta', width: 9 },
    { header: 'Receiving IC code', key: 'ic', width: 13 }, { header: 'Coder (aprobador Host)', key: 'coder', width: 20 },
    { header: 'Coder email', key: 'coderEmail', width: 26 }, { header: 'Moneda', key: 'currency', width: 8 }, { header: 'Mark up', key: 'markup', width: 8 },
    { header: 'Note Title (SAP)', key: 'noteTitle', width: 28 }, { header: 'Note Text (SAP)', key: 'noteText', width: 50 },
    { header: 'Estatus', key: 'estatus', width: 24 }, { header: 'Siguiente paso', key: 'next', width: 34 },
    { header: 'Recharge ID (Webi)', key: 'rid', width: 16 }, { header: 'Fecha carga Webi', key: 'f1', width: 12 },
    { header: 'Aprobador 1', key: 'ap1', width: 18 }, { header: 'Aprobador 2', key: 'ap2', width: 18 }, { header: 'Aprobador 3', key: 'ap3', width: 18 },
    { header: 'RRB WBS / PO', key: 'po', width: 26 }, { header: 'Monto Webi', key: 'mw', width: 12 }, { header: 'Monto PO (ME23N)', key: 'mp', width: 13 },
    { header: 'JVU ID', key: 'jvu', width: 14 }, { header: 'Fecha carga JVU', key: 'f2', width: 12 }, { header: 'BATCH ID', key: 'batch', width: 14 },
    { header: '¿Accrual?', key: 'acc', width: 9 }, { header: 'Accrual ID', key: 'accid', width: 14 }, { header: 'Validación FBL5N', key: 'fbl', width: 14 },
    { header: 'Comentarios', key: 'com', width: 40 },
    { header: 'Archivo Shopping Cart', key: 'fsc', width: 36 }, { header: 'Archivo Webi', key: 'fwebi', width: 36 },
    { header: 'Archivo JVU', key: 'fjvu', width: 36 }, { header: 'Archivo Accrual', key: 'facc', width: 36 },
    { header: 'Carpeta del empleado', key: 'folder', width: 36 }
  ];
  /** Columnas que se capturan a mano durante el semestre (se conservan al regenerar el Tracker). */
  const MANUAL_KEYS = ['estatus', 'rid', 'f1', 'ap1', 'ap2', 'ap3', 'po', 'mw', 'mp', 'jvu', 'f2', 'batch', 'acc', 'accid', 'fbl', 'com'];
  const DATA_KEYS = ['payroll', 'area', 'sociedad', 'ceco', 'grade', 'host', 'tipo', 'desde', 'hasta', 'ic', 'coder', 'coderEmail', 'currency', 'markup', 'hrbp'];
  const colIdx = (k) => TRACKER_COLS.findIndex((c) => c.key === k);

  /** Siguiente paso del proceso según lo capturado (misma lógica que la fórmula del Excel). */
  function nextStep(m) {
    // "NA", "N/A", "Pendiente", "Aprobación…" no cuentan como hecho
    const v = (k) => !isBlank(m[k]) && !/^(n\/?a|na|no|-|pendiente|pending|aprobaci)/.test(norm(m[k]));
    const st = norm(m.estatus);
    if (st === 'cancelado' || st === 'rechazado') return '—';
    if (v('fbl')) return '✔ Terminado';
    if (norm(m.acc) === 'si' && !v('accid')) return 'Crear y cargar Accrual (mismo día)';
    if (!v('rid')) return 'Crear y cargar Webi';
    if (!v('po')) return 'Seguir aprobaciones (RRB PO Dashboard)';
    if (!v('jvu') && !v('accid')) return 'Generar y cargar JVU (mismo día)';
    if (v('jvu') && !v('batch')) return 'Esperar BATCH ID';
    return 'Validar en FBL5N';
  }
  function nextStepFormula(r) {
    const L = (k) => Core.colLetter(colIdx(k)) + r;
    return 'IF(OR(' + L('estatus') + '="Cancelado",' + L('estatus') + '="Rechazado"),"—",IF(' + L('fbl') + '<>"","✔ Terminado",IF(AND(' + L('acc') + '="Sí",' + L('accid') + '=""),"Crear y cargar Accrual (mismo día)",' +
      'IF(' + L('rid') + '="","Crear y cargar Webi",IF(' + L('po') + '="","Seguir aprobaciones (RRB PO Dashboard)",IF(AND(' + L('jvu') + '="",' + L('accid') + '=""),"Generar y cargar JVU (mismo día)",' +
      'IF(AND(' + L('jvu') + '<>"",' + L('batch') + '=""),"Esperar BATCH ID","Validar en FBL5N")))))))';
  }

  const TRACKER_SYNONYMS = {
    nombre: ['name', 'nombre'], estatus: ['status'], rid: ['webi', 'req id', 'recharge id'], f1: ['webi upload'],
    ap1: ['se approver'], ap2: ['aprobador'], ap3: ['re approver'], po: ['po', 'rrb wbs'], mw: ['costo total'], jvu: ['jvu'],
    f2: ['jvu approval'], batch: ['batch', 'status jvu'], accid: ['accrual'], fbl: ['registered in sap', 'fbl5n', 'contabilidad'],
    com: ['comment', 'comments', 'comentario'], host: ['country', 'pais'], area: ['area'], coder: ['coder'], ceco: ['ceco'], ic: ['ic code']
  };
  /** Lee un Tracker generado antes por la app, o un Tracker propio con columnas tipo Status / Webi / PO / JVU. */
  function readPreviousTracker(wb) {
    let best = null;
    const hiddenSheets = new Set(((wb.Workbook && wb.Workbook.Sheets) || []).filter((x) => x.Hidden).map((x) => x.name));
    wb.SheetNames.forEach((sn) => {
      const rows = Core.sheetRows(wb.Sheets[sn]);
      const h = Core.findHeaderRow(rows, ['Key', 'Estatus', 'Status', 'Recharge ID (Webi)', 'Webi', 'RRB WBS / PO', 'PO', 'JVU', 'Nombre (Apellidos Nombre)'], 10);
      if (h < 0) return;
      const hd = (rows[h] || []).map((x) => norm(x).replace(/\s+mm\/dd\/yyyy$/, ''));
      const map = {};
      // Los nombres van en orden de prioridad
      const take = (key, names) => {
        if (map[key] !== undefined) return;
        for (const n of names) { const i = hd.findIndex((x, j) => x === n && !Object.values(map).includes(j)); if (i >= 0) { map[key] = i; return; } }
      };
      TRACKER_COLS.forEach((c) => take(c.key, [norm(c.header)]));
      // Sinónimos de otros formatos de Tracker (p. ej. el que se usaba antes de la app)
      Object.entries(TRACKER_SYNONYMS).forEach(([k, names]) => take(k, names));
      if (map.nombre === undefined || (map.rid === undefined && map.po === undefined && map.jvu === undefined)) return;
      const out = [];
      rows.slice(h + 1).forEach((r) => {
        if (!r || isBlank(r[map.nombre])) return;
        if (map.key !== undefined && !/^\d+(\.0+)?$/.test(str(r[map.key]))) return; // tablas dinámicas debajo
        const o = {};
        Object.keys(map).forEach((k) => { const v = r[map[k]]; o[k] = isBlank(v) ? '' : v; });
        ['key', 'nombre'].concat(DATA_KEYS).forEach((k) => { o[k] = str(o[k]); });
        if (o.com) o.com = String(o.com).replace(/^\[No viene en la lista nueva\]\s*/, '');
        out.push(o);
      });
      const cand = { sheet: sn, rows: out, hidden: hiddenSheets.has(sn) };
      // Preferir hojas visibles y, entre ellas, la que tenga más asignaciones
      if (!best || (best.hidden && !cand.hidden) || (best.hidden === cand.hidden && cand.rows.length > best.rows.length)) best = cand;
    });
    return best;
  }
  /** Combina la lista nueva con el Tracker anterior: conserva lo capturado, agrega nuevos y marca los que ya no vienen. */
  function mergeTracker(assignments, prevRows) {
    const prev = (prevRows || []).map((p) => Object.assign({ _used: false }, p));
    const match = (a) => {
      let m = prev.find((p) => !p._used && a.payroll && p.payroll && norm(a.payroll) === norm(p.payroll));
      if (!m) {
        let bs = 0;
        prev.forEach((p) => { if (p._used) return; const sc = Core.nameScore(a.nombre, p.nombre); if (sc >= 0.9 && sc > bs) { bs = sc; m = p; } });
      }
      return m;
    };
    const out = [];
    let kept = 0, nuevos = 0;
    assignments.forEach((a0) => {
      const a = Object.assign({}, a0);
      const m = match(a);
      if (m) {
        m._used = true; kept++;
        a.manual = {};
        MANUAL_KEYS.forEach((k) => { if (!isBlank(m[k])) a.manual[k] = m[k]; });
        DATA_KEYS.forEach((k) => { if (isBlank(a[k]) && !isBlank(m[k])) a[k] = m[k]; });
        if (a._autoKey && m.key) { a.key = m.key; a._autoKey = false; }
      } else { a._new = true; nuevos++; }
      out.push(a);
    });
    const only = prev.filter((p) => !p._used).map((p) => {
      const a = { key: p.key, nombre: p.nombre, _onlyPrev: true, manual: {} };
      DATA_KEYS.forEach((k) => { a[k] = p[k] || ''; });
      MANUAL_KEYS.forEach((k) => { if (!isBlank(p[k])) a.manual[k] = p[k]; });
      a.manual.com = '[No viene en la lista nueva] ' + (a.manual.com || '');
      return a;
    });
    // KEY consecutivo para los nuevos sin KEY propio, sin chocar con los existentes
    const used = new Set(out.concat(only).filter((a) => !a._autoKey).map((a) => String(a.key)));
    let next = Array.from(used).reduce((mx, k) => Math.max(mx, parseInt(k, 10) || 0), 0) + 1;
    out.forEach((a) => { if (a._autoKey) { while (used.has(String(next))) next++; a.key = String(next); used.add(a.key); a._autoKey = false; } });
    return { assignments: out.concat(only), stats: { kept, nuevos, soloAnterior: only.length } };
  }

  async function buildTracker(assignments, p) {
    const wb = Core.newWorkbook();
    const C = Core.COLORS;
    const ps = periodShort(p.half, p.year);
    const pth = paths(p.oneId, p.year, p.half);
    const ws = wb.addWorksheet('Tracker ' + ps.replace("'", ''), { views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }] });
    Core.title(ws, 1, 'Tracker de Recobros ' + ps, 'Generado: ' + Core.stamp() + ' · ' + assignments.length + ' asignaciones · Mes a marcar con "X" en SAP si se crea hoy: ' + monthToMark(Core.todaySerial()) + ' · Key en amarillo = asignación nueva · "Siguiente paso" se actualiza solo al capturar');
    const cols = TRACKER_COLS;
    const rows = assignments.map((a) => {
      const m = a.manual || {};
      const o = Object.assign({}, a, {
        se: seCompanyCode(a.sociedad),
        noteTitle: noteTitle(a, p.half, p.year, p.nameOrder), noteText: noteText(a, p.half, p.year),
        fsc: fileName(a.key, 'SC', a.nombre), fwebi: fileName(a.key, 'Webi', a.nombre),
        fjvu: fileName(a.key, 'JVU', a.nombre), facc: fileName(a.key, 'Accrual', a.nombre), folder: folderName(a.key, a.nombre)
      });
      MANUAL_KEYS.forEach((k) => { o[k] = isBlank(m[k]) ? null : m[k]; });
      ['f1', 'f2'].forEach((k) => { if (typeof o[k] === 'number') o[k] = Core.serialToJSDate(o[k]); });
      if (!o.estatus) o.estatus = STATUSES[0];
      if (!o.acc) o.acc = 'No';
      o.next = nextStep(o);
      return o;
    });
    const t = Core.writeTable(ws, 3, cols, rows, { autoFilter: true });
    // Colores por bloque de información
    const groups = [[1, colIdx('markup') + 1, C.head], [colIdx('noteTitle') + 1, colIdx('noteText') + 1, 'FF7F6000'], [colIdx('estatus') + 1, colIdx('com') + 1, 'FF375623'], [colIdx('fsc') + 1, cols.length, 'FF595959']];
    groups.forEach(([a, b, color]) => { for (let c = a; c <= b; c++) { const cell = ws.getCell(3, c); cell.fill = Core.fill(color); } });
    const cE = colIdx('estatus') + 1, cA = colIdx('acc') + 1, cN = colIdx('next') + 1;
    for (let r = 4; r <= t.lastRow; r++) {
      const a = rows[r - 4];
      ws.getCell(r, cE).dataValidation = { type: 'list', allowBlank: true, formulae: ['"' + STATUSES.join(',') + '"'] };
      ws.getCell(r, cA).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Sí,No"'] };
      for (let c = cE; c <= colIdx('com') + 1; c++) ws.getCell(r, c).fill = Core.fill('FFF4F9EF');
      const nc = ws.getCell(r, cN);
      nc.value = { formula: nextStepFormula(r), result: a.next };
      nc.font = { bold: true, color: { argb: 'FF1F4E79' } };
      ['f1', 'f2'].forEach((k) => { ws.getCell(r, colIdx(k) + 1).numFmt = 'dd/mm/yyyy'; });
      if (a._new) ws.getCell(r, 1).fill = Core.fill(C.yellow);
      if (a._onlyPrev) ws.getRow(r).eachCell((c) => { c.font = { color: { argb: 'FF808080' }, italic: true }; });
    }
    ws.addConditionalFormatting({
      ref: Core.colLetter(cE - 1) + '4:' + Core.colLetter(cE - 1) + Math.max(4, t.lastRow),
      rules: [
        { type: 'containsText', operator: 'containsText', text: 'Validado', style: { fill: Core.fill(C.green), font: { color: { argb: C.greenTx } } }, priority: 1 },
        { type: 'containsText', operator: 'containsText', text: 'Rechazado', style: { fill: Core.fill(C.red), font: { color: { argb: C.redTx } } }, priority: 2 },
        { type: 'containsText', operator: 'containsText', text: 'Pendiente', style: { fill: Core.fill(C.yellow), font: { color: { argb: C.yellowTx } } }, priority: 3 }
      ]
    });

    // Resumen por área (como la lámina del kick-off)
    const ws2 = wb.addWorksheet('Resumen por área');
    Core.title(ws2, 1, 'Asignaciones a recobrar ' + ps, 'Total: ' + assignments.length + ' asignaciones');
    const byArea = {};
    assignments.forEach((a) => { const k = a.area || '(Sin área)'; byArea[k] = byArea[k] || { area: k, n: 0, lta: 0, sta: 0, otro: 0 }; const r = byArea[k]; r.n++; const tp = norm(a.tipo); if (/lta/.test(tp)) r.lta++; else if (/sta/.test(tp)) r.sta++; else r.otro++; });
    const areaRows = Object.values(byArea).sort((x, y) => y.n - x.n).map((r) => [r.area, r.n, r.n / (assignments.length || 1), r.lta, r.sta, r.otro]);
    Core.writeTable(ws2, 4, [
      { header: 'Área', width: 22 }, { header: 'Asignaciones', width: 13, total: true }, { header: '% del total', width: 11, numFmt: '0%', total: true },
      { header: 'LTA', width: 8, total: true }, { header: 'STA', width: 8, total: true }, { header: 'Otro', width: 8, total: true }
    ], areaRows, { totals: true });
    const byHost = {};
    assignments.forEach((a) => { const k = a.host || '(Sin país)'; byHost[k] = (byHost[k] || 0) + 1; });
    Core.writeTable(ws2, 4, [{ header: 'Host Country', width: 20 }, { header: 'Asignaciones', width: 13, total: true }],
      Object.entries(byHost).sort((x, y) => y[1] - x[1]), { startCol: 8, totals: true });
    // Datos clave faltantes (los 10 "Key Data" del kick-off)
    const need = [['sociedad', 'Sociedad'], ['ceco', 'CeCo'], ['host', 'Host Country'], ['tipo', 'Tipo asignación'], ['desde', 'Periodo (Desde)'], ['hasta', 'Periodo (Hasta)'], ['ic', 'IC code'], ['coder', 'Coder']];
    const missing = [];
    assignments.forEach((a) => { const m = need.filter(([k]) => !a[k]).map(([, l]) => l); if (m.length) missing.push([a.key, a.nombre, a.area, m.join(', ')]); });
    const ws3 = wb.addWorksheet('Datos faltantes');
    Core.title(ws3, 1, 'Key Data pendiente por asignación', missing.length ? missing.length + ' asignación(es) con datos por completar antes de crear el Recharge' : 'Todas las asignaciones tienen los datos clave');
    Core.writeTable(ws3, 4, [{ header: 'Key', width: 6 }, { header: 'Nombre', width: 34 }, { header: 'Área', width: 18 }, { header: 'Falta', width: 70 }], missing, { autoFilter: true });

    // Rutas y guía rápida
    const ws4 = wb.addWorksheet('Rutas y guía');
    Core.title(ws4, 1, 'Rutas de almacenamiento y recordatorios');
    Core.writeTable(ws4, 3, [{ header: 'Concepto', width: 30 }, { header: 'Valor', width: 110 }], [
      ['Ruta Webis (SC + Webi)', pth.webis + '\\{KEY}. {Nombre}'], ['Ruta JVUs', pth.jvus + '\\{KEY}. {Nombre}'], ['Ruta Accruals', pth.accruals + '\\{KEY}. {Nombre}'],
      ['SAP NEO · Recharge', 'Requisition To Pay › Portal Form Initiator › Request RRB PO Recharge · Recharge Frequency = Single · "X" en el mes siguiente al de creación'],
      ['SAP NEO · Aprobadores', 'Requisition to Pay › Portal Form Initiator › RRB PO Recharges Dashboard › Form Number › Approver List'],
      ['SAP · PO', 'ME23N › Other Purchase Order (descontar Mark Up si aplica)'],
      ['SAP NEO · JVU', 'Request Journal Mass Upload · Function = Finance · Subfunction = FICO (FI - CORA) · Exception = 16'],
      ['SAP NEO · Accrual', 'Request Journal Mass Upload · Intercompany Accrual ✓ · Partner Entity User ID = OneID del Coder · Exception = 05'],
      ['SAP NEO · Seguimiento JVU/Accrual', 'Dashboard For Finance Forms (Start/End Date, Company Code, User)'],
      ['SAP · Validación contable', 'FBL5N · Customer Account = IC Code del End Market · Company Code · All Items · Posting Date ±1 semana'],
      ['Roles del Coder (bat-sapRoles-P03)', 'ZMX10EPPR2PC_LINE_MGR_APPRVR · ZMX10ERRRVAC_FINANCE_ALL_DI · ZMX10EPPR2PC_EMPLOYEE'],
      ['Precaución', 'JVU y Accrual: crear el formato y cargarlo a SAP el MISMO día (tienen fórmulas con fecha). Eliminar filas vacías antes de guardar el TXT.']
    ]);
    ws4.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
    return wb;
  }

  // ---------- Formatos SAP (SC / Webi / JVU / Accrual) ----------
  const KINDS = [
    { kind: 'SC', label: 'Shopping Cart', sheets: ['Vendor.Template(PO)', 'vendor.template', 'shopping cart'], txt: false, folder: 'webis' },
    { kind: 'Webi', label: 'Webi', sheets: ['Webi creation', 'webi'], txt: true, folder: 'webis' },
    { kind: 'JVU', label: 'JVU', sheets: ['JVU - Recharge', 'jvu'], txt: true, folder: 'jvus', dated: true },
    { kind: 'Accrual', label: 'Accrual', sheets: ['Accrual'], txt: true, folder: 'accruals', dated: true }
  ];
  function kindInfo(kind) { return KINDS.find((k) => k.kind === kind); }
  /** Detecta qué formatos trae el libro (Estimate Benefits completo o copia de una sola hoja). */
  function detectFormats(wb, filename) {
    const found = [];
    const used = new Set();
    KINDS.forEach((k) => {
      const s = Core.getSheet(wb, k.sheets);
      if (s && !used.has(s.name)) { found.push({ kind: k.kind, sheet: s.name }); used.add(s.name); }
    });
    if (!found.length && wb.SheetNames.length) {
      const fn = norm(filename);
      let kind = null;
      if (/\bsc\b|shopping/.test(fn)) kind = 'SC';
      else if (/webi/.test(fn)) kind = 'Webi';
      else if (/jvu/.test(fn)) kind = 'JVU';
      else if (/accrual/.test(fn)) kind = 'Accrual';
      if (kind) found.push({ kind, sheet: wb.SheetNames[0] });
    }
    return found;
  }
  /** Lee KEY, Nombre y tipo (Recharge/Accrual) de las hojas Consolidado(#) e IDX, o del nombre de archivo. */
  function detectContext(wb, filename) {
    const ctx = { key: '', nombre: '', numNom: '', area: '', tipo: '', ic: '', reference: '', costCenter: '', po: '', currency: '' };
    const cons = Core.getSheet(wb, ['Consolidado(#)', 'consolidado']);
    if (cons) {
      const rows = Core.sheetRows(cons.ws);
      const h = Core.findHeaderRow(rows, ['Key', 'NumNom', 'Nombre', 'Area'], 10);
      if (h >= 0 && rows[h + 1]) {
        const hd = rows[h];
        const g = (names) => { const i = Core.findCol(hd, names); return i >= 0 ? str(rows[h + 1][i]) : ''; };
        ctx.key = g(['Key']); ctx.numNom = g(['NumNom']); ctx.nombre = g(['Nombre', 'Name']); ctx.area = g(['Area']);
      }
    }
    const idx = Core.getSheet(wb, ['IDX']);
    if (idx) {
      const rows = Core.sheetRows(idx.ws);
      const val = (label) => {
        for (const r of rows) {
          if (!r) continue;
          for (let j = 0; j < r.length; j++) {
            if (norm(r[j]).replace(/:$/, '') === label) { for (let k = j + 1; k < r.length; k++) if (!isBlank(r[k])) return str(r[k]); }
          }
        }
        return '';
      };
      ctx.nombre = ctx.nombre || val('name');
      ctx.currency = val('currency'); ctx.reference = val('reference'); ctx.costCenter = val('cost center'); ctx.po = val('po');
      // Tipo de recobro en B14 (lista Recharge / Accrual) e IC code debajo
      for (const r of rows) {
        if (!r) continue;
        for (const c of r) {
          const n = norm(c);
          if (n === 'recharge' || n === 'accrual') ctx.tipo = ctx.tipo || (n === 'recharge' ? 'Recharge' : 'Accrual');
          if (/^ic-\d\d-/.test(n)) ctx.ic = ctx.ic || str(c);
        }
      }
    }
    if (!ctx.key || !ctx.nombre) {
      const m = String(filename || '').replace(/\.[^.]+$/, '').match(/^\s*(\d+)\.\s*(?:SC|Webi|JVU|Accrual)\s+(.+)$/i);
      if (m) { ctx.key = ctx.key || m[1]; ctx.nombre = ctx.nombre || m[2].trim(); }
    }
    return ctx;
  }
  function yyyymmddToSerial(s) {
    const m = String(s).match(/^(20\d{2})(\d{2})(\d{2})$/);
    if (!m) return null;
    const mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return Core.ymdToSerial(+m[1], mo, d);
  }
  /** Analiza la cuadrícula (texto) de un formato: totales y fechas para validar. */
  function analyze(kind, grid) {
    const res = { rows: grid.length, total: null, debit: null, credit: null, dates: [], warnings: [] };
    const hdrRows = Math.min(grid.length, 6);
    let amountCol = -1, keyCol = -1, headerEnd = 0;
    for (let i = 0; i < hdrRows; i++) {
      (grid[i] || []).forEach((v, j) => {
        const n = norm(v);
        if (amountCol < 0 && (/^amount( in dc)?$/.test(n) || n === 'wrbtr' || n === 'importe' || n === 'monto')) { amountCol = j; headerEnd = Math.max(headerEnd, i); }
        if (keyCol < 0 && (n === 'bschl' || n === 'post key' || n === 'posting key')) { keyCol = j; headerEnd = Math.max(headerEnd, i); }
      });
    }
    // Fechas tipo 20260812 en el encabezado del documento
    grid.slice(0, 8).forEach((r) => (r || []).forEach((v) => { const s = yyyymmddToSerial(String(v).trim()); if (s) res.dates.push(s); }));
    if (amountCol >= 0) {
      let sum = 0, deb = 0, cred = 0, n = 0;
      for (let i = headerEnd + 1; i < grid.length; i++) {
        const r = grid[i] || [];
        if (r.some((c) => /^(grand )?total\b/.test(norm(c)))) continue; // fila de totales
        const v = parseNum(r[amountCol]);
        if (v === null) continue;
        const pk = keyCol >= 0 ? String(r[keyCol]).trim() : '';
        if (keyCol >= 0 && !/^\d{2}$/.test(pk)) continue; // fila de encabezado del documento (periodo, etc.)
        n++; sum += v;
        if (pk === '40') deb += v; else if (pk === '50') cred += v;
      }
      if (n) {
        res.total = Core.round(sum, 2);
        if (keyCol >= 0) {
          res.debit = Core.round(deb, 2); res.credit = Core.round(cred, 2);
          if (Core.round(deb - cred, 2) !== 0) res.warnings.push('Las partidas 40 (' + res.debit + ') y 50 (' + res.credit + ') no cuadran.');
        }
      }
    }
    const today = Core.todaySerial();
    if (kindInfo(kind) && kindInfo(kind).dated && res.dates.length && res.dates.some((d) => d !== today)) {
      res.warnings.push('El formato trae la fecha ' + fmtDate(res.dates[0]) + ' y hoy es ' + fmtDate(today) + '. El JVU/Accrual debe crearse y cargarse el mismo día: abre Estimate Benefits hoy, guarda y vuelve a generar.');
    }
    return res;
  }
  function amountForCompare(kind, a) {
    if (!a) return null;
    if (a.credit !== null && a.credit !== undefined && a.credit !== 0) return a.credit;
    return a.total;
  }

  /** Copia una hoja (valores + formatos) a un libro nuevo usando ExcelJS. Devuelve buffer xlsx o null si no se pudo. */
  async function copySheetWithFormats(buffer, sheetName) {
    try {
      const ExcelJS = Core.lib('ExcelJS');
      const src = new ExcelJS.Workbook();
      await src.xlsx.load(buffer);
      const ws = src.getWorksheet(sheetName);
      if (!ws) return null;
      const out = new ExcelJS.Workbook();
      const nws = out.addWorksheet(sheetName.slice(0, 31));
      let lastRow = 0, lastCol = 0;
      ws.eachRow({ includeEmpty: false }, (row, r) => {
        row.eachCell({ includeEmpty: false }, (cell, c) => {
          let v = cell.value;
          if (v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v)) v = v.result === undefined ? null : v.result;
          if (v && typeof v === 'object' && v.error) v = null;
          if (v === null || v === undefined || v === '') return;
          lastRow = Math.max(lastRow, r); lastCol = Math.max(lastCol, c);
        });
      });
      for (let r = 1; r <= lastRow; r++) {
        const row = ws.getRow(r);
        const nrow = nws.getRow(r);
        if (row.height) nrow.height = row.height;
        for (let c = 1; c <= lastCol; c++) {
          const cell = row.getCell(c);
          let v = cell.value;
          if (v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v)) v = v.result === undefined ? null : v.result;
          if (v && typeof v === 'object' && v.error) v = null;
          const nc = nrow.getCell(c);
          nc.value = v === undefined ? null : v;
          if (cell.style) nc.style = JSON.parse(JSON.stringify(cell.style));
        }
      }
      for (let c = 1; c <= lastCol; c++) { const w = ws.getColumn(c).width; if (w) nws.getColumn(c).width = w; }
      (ws.model.merges || []).forEach((m) => {
        try {
          const [a, b] = m.split(':');
          const ca = ws.getCell(a), cb = ws.getCell(b);
          if (ca.row <= lastRow && ca.col <= lastCol && cb.row <= lastRow && cb.col <= lastCol) nws.mergeCells(m);
        } catch (e) { /* ignora merges inválidos */ }
      });
      return await out.xlsx.writeBuffer();
    } catch (e) {
      return null;
    }
  }
  /** Libro solo con valores (respaldo si ExcelJS no pudo leer el original, p. ej. .xls). */
  async function valuesWorkbook(grid, sheetName) {
    const wb = Core.newWorkbook();
    const ws = wb.addWorksheet((sheetName || 'Hoja1').slice(0, 31));
    grid.forEach((r, i) => {
      const row = ws.getRow(i + 1);
      r.forEach((v, j) => { const n = parseNum(v); row.getCell(j + 1).value = (n !== null && /^-?[\d.,]+$/.test(String(v)) && !/^0\d/.test(String(v)) && String(v).length < 16) ? n : v; });
    });
    return wb.xlsx.writeBuffer();
  }

  /** Procesa un libro y devuelve los archivos a generar. */
  async function processWorkbook(file, opts) {
    // file: {name, buffer, wb}
    const formats = detectFormats(file.wb, file.name);
    const ctx = detectContext(file.wb, file.name);
    const items = formats.map((f) => {
      const grid = Core.cleanGrid(Core.sheetText(file.wb.Sheets[f.sheet]));
      return Object.assign({}, f, { grid, analysis: analyze(f.kind, grid) });
    });
    return { file: file.name, ctx, items, buffer: file.buffer, opts };
  }

  /** Lista de archivos a generar, con rutas relativas a la carpeta "{Año}\\Tracker":
   *  Recharges/H2'26/{Webis|JVUs|Accruals}/{KEY}. {Nombre}/{KEY}. {Tipo} {Nombre}.xlsx|.txt */
  async function buildFiles(processed, p) {
    const base0 = 'Recharges/' + periodShort(p.half, p.year);
    const files = [], log = [];
    for (const pr of processed) {
      const key = str(pr.ctx.key), nombre = str(pr.ctx.nombre);
      if (!key || !nombre) { log.push({ file: pr.file, ok: false, msg: 'Falta KEY o Nombre' }); continue; }
      const folder = folderName(key, nombre);
      for (const it of pr.items) {
        if (it.include === false) continue;
        const info = kindInfo(it.kind);
        const base = fileName(key, it.kind, nombre);
        const sub = info.folder === 'webis' ? 'Webis' : info.folder === 'jvus' ? 'JVUs' : 'Accruals';
        const dir = base0 + '/' + sub + '/' + folder + '/';
        let xbuf = await copySheetWithFormats(pr.buffer, it.sheet);
        const styled = !!xbuf;
        if (!xbuf) xbuf = await valuesWorkbook(it.grid, it.sheet);
        files.push({ path: dir + base + '.xlsx', data: new Uint8Array(xbuf), type: Core.XLSX_MIME });
        if (info.txt) files.push({ path: dir + base + '.txt', data: Core.encodeCP1252(Core.toTabText(it.grid)), type: 'text/plain' });
        log.push({ file: pr.file, ok: true, msg: sub + '/' + folder + '/' + base + (info.txt ? ' (.xlsx + .txt)' : ' (.xlsx)') + (styled ? '' : ' · solo valores') });
      }
    }
    return { files, log };
  }
  /** ZIP con la misma estructura (para descargar y descomprimir dentro de Tracker). */
  async function buildZip(processed, p) {
    const JSZip = Core.lib('JSZip');
    const zip = new JSZip();
    const { files, log } = await buildFiles(processed, p);
    files.forEach((f) => zip.file(f.path, f.data));
    const blob = await zip.generateAsync({ type: typeof window !== 'undefined' ? 'blob' : 'nodebuffer' });
    return { blob, log, files };
  }

  return {
    ASSIGN_FIELDS, STATUSES, KINDS, guessAssignmentColumns, readAssignments, nameParts, periodShort, noteTitle, noteText,
    fileName, folderName, monthToMark, paths, seCompanyCode, buildTracker, TRACKER_COLS, MANUAL_KEYS, nextStep, readPreviousTracker, mergeTracker,
    detectFormats, detectContext, analyze, amountForCompare, copySheetWithFormats, processWorkbook, buildFiles, buildZip, kindInfo
  };
});
