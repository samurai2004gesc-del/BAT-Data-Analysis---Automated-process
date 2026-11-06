/* Headcount: HC in BPC vs HC Approved.
 * Replica la lógica documentada de la herramienta "HC in BPC vs HC Approved" (macros VBA) sin depender
 * de posiciones fijas de columnas ni de tablas dinámicas, y corrige los riesgos conocidos:
 *  - Busca el encabezado por nombre (no exige H33) y mapea las 26 columnas por nombre.
 *  - El semáforo revisa cada grado (no la suma, que puede compensar +3 / -3).
 *  - Lista de grados dinámica (aparecen todos los grados de ambos lados).
 *  - Un solo filtro de Entidad / Función aplica a SOP y COPLAN al mismo tiempo.
 *  - Avisa de funciones o entidades sin equivalencia. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.HC = factory(root.Core);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';
  const { norm, isBlank, str, parseNum, parseDate, ymdToSerial, fmtDate } = Core;

  const HR_COLUMNS = [
    ['nep', 'New / existing / planned'], ['pru', 'Planning Reporting Unit'], ['bcc', 'Budgetary Cost Centre'],
    ['ccc', 'Contractual Cost Centre'], ['ccf', 'Cost Centre Function'], ['posFunc', 'Position Function'],
    ['homeFunc', 'Home Function'], ['subFuncId', 'Sub-function ID'], ['subFunc', 'Sub-function'], ['jobCode', 'Job Code'],
    ['jobGrade', 'Job Grade'], ['position', 'Position Code & Position Title'], ['regTemp', 'Regular / Temporary'],
    ['empClass', 'Employee Class'], ['empName', 'Employee Name'], ['localIA', 'Local / IA'], ['location', 'Location'],
    ['payGrade', 'Pay Grade'], ['currency', 'Cost Centre Currency'], ['salary', 'Salary'],
    ['fte', 'FTE % (month independent)'], ['fullPart', 'Full / Part Time'], ['start', 'Start Date'], ['end', 'End Date'],
    ['fteMult', 'FTE Multiplier'], ['dateCheck', 'Date Check']
  ];
  const REQUIRED = ['payGrade', 'fte', 'start', 'end', 'homeFunc'];

  const MARKETS = {
    'Colombia': { splitMarketing: true, multiEntity: false, bpcEntity: 'COC00L' },
    'CAR': { splitMarketing: false, multiEntity: true, bpcEntity: 'TTC00L / C00MJM / C00MGY / TTO02L' },
    'CAM': { splitMarketing: false, multiEntity: true, bpcEntity: 'CTC03L_PA13 / HNO02L / CTC03L_HN13' },
    'Venezuela': { splitMarketing: false, multiEntity: false, bpcEntity: 'C00MVE' },
    'México Comercial': { splitMarketing: false, multiEntity: false, bpcEntity: 'MXC00L' },
    'México Operaciones': { splitMarketing: false, multiEntity: false, bpcEntity: 'MXO02L' }
  };

  function defaultCutoffs(sopYear) {
    const y = Number(sopYear);
    return {
      coplanStart: ymdToSerial(y + 1, 1, 1), // Y2 / AA2: primer día COPLAN = corte superior SOP
      coplanEndPlus1: ymdToSerial(y + 2, 1, 1), // Z2: corte superior COPLAN
      sopLastDay: ymdToSerial(y, 12, 31), // AB2
      coplanLastDay: ymdToSerial(y + 1, 12, 31) // AC2
    };
  }

  // ---------- Lectura del HR Input Report ----------
  function parseHRInput(rows) {
    const target = norm('New / existing / planned');
    let hRow = -1, hCol = -1;
    for (let i = 0; i < Math.min(rows.length, 200) && hRow < 0; i++) {
      const r = rows[i] || [];
      for (let j = 0; j < r.length; j++) if (norm(r[j]) === target) { hRow = i; hCol = j; break; }
    }
    if (hRow < 0) {
      // Copia sin metadatos: buscar por otras columnas clave
      hRow = Core.findHeaderRow(rows, ['Pay Grade', 'Home Function', 'Start Date', 'End Date', 'FTE Multiplier'], 200);
      if (hRow < 0 || Core.findCol(rows[hRow] || [], ['Pay Grade']) < 0) {
        throw new Error('No encontré el encabezado del HR Input Report ("New / existing / planned", "Pay Grade", etc.). ¿Es el reporte correcto de BPC?');
      }
    }
    const header = rows[hRow] || [];
    const H = header.map(norm);
    const map = {};
    const used = new Set();
    HR_COLUMNS.forEach(([key, label]) => {
      const n = norm(label);
      let idx = H.findIndex((h, i) => h === n && !used.has(i));
      if (idx < 0) idx = H.findIndex((h, i) => h && !used.has(i) && h.startsWith(n));
      if (idx < 0 && key === 'fte') idx = H.findIndex((h, i) => !used.has(i) && /^fte ?%/.test(h));
      if (idx >= 0) { map[key] = idx; used.add(idx); }
    });
    const missing = REQUIRED.filter((k) => map[k] === undefined).map((k) => HR_COLUMNS.find((c) => c[0] === k)[1]);
    if (missing.length) throw new Error('Al HR Input le faltan columnas obligatorias: ' + missing.join(', '));

    const info = [];
    const xl = Core.colLetter(hCol >= 0 ? hCol : 0) + (hRow + 1);
    if (hCol >= 0 && !(hRow === 32 && hCol === 7)) info.push('El encabezado está en ' + xl + ' (el reporte estándar lo trae en H33). Se leyó igualmente por nombre de columna.');
    const optionalMissing = HR_COLUMNS.filter(([k]) => map[k] === undefined && !REQUIRED.includes(k)).map((c) => c[1]);
    if (optionalMissing.length) info.push('Columnas no encontradas (no críticas): ' + optionalMissing.join(', '));

    const data = [];
    for (let i = hRow + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const rec = { _row: i + 1 };
      let any = false;
      HR_COLUMNS.forEach(([key]) => {
        const v = map[key] === undefined ? null : r[map[key]];
        rec[key] = v === undefined ? null : v;
        if (!isBlank(v)) any = true;
      });
      if (any) data.push(rec);
    }
    return { headerRow: hRow + 1, headerCell: xl, map, positions: data, info };
  }

  // ---------- Normalización ----------
  function gradeKey(v, groupMax) {
    const s = str(v);
    if (!s) return '(Sin grado)';
    const m = s.match(/(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (groupMax && n <= Number(groupMax)) return 'Grade ' + groupMax + ' and below';
      return 'Grade ' + n;
    }
    return s.toUpperCase();
  }
  function gradeSortValue(k) {
    const m = k.match(/(\d+)/);
    if (k === '(Sin grado)') return -1000;
    if (m) return Number(m[1]) - (/below/.test(k) ? 0.5 : 0);
    return 1000; // textos (MT, etc.) arriba
  }
  function sortGrades(keys) { return keys.slice().sort((a, b) => gradeSortValue(b) - gradeSortValue(a) || a.localeCompare(b)); }
  function lookup(mapObj, raw) {
    const k = str(raw);
    if (!k) return '';
    if (mapObj && Object.prototype.hasOwnProperty.call(mapObj, k) && !isBlank(mapObj[k])) return String(mapObj[k]).trim();
    if (mapObj) {
      const nk = norm(k);
      for (const key of Object.keys(mapObj)) if (norm(key) === nk && !isBlank(mapObj[key])) return String(mapObj[key]).trim();
    }
    return k;
  }
  function hasMap(mapObj, raw) {
    const nk = norm(raw);
    return !!mapObj && Object.keys(mapObj).some((k) => norm(k) === nk && !isBlank(mapObj[k]));
  }

  /** Aplica las columnas calculadas AA..AG a cada posición. */
  function computePositions(positions, cfg) {
    const c = cfg.cutoffs;
    const order = cfg.dateOrder || 'dmy';
    return positions.map((p) => {
      const fteRaw = p.fte;
      let fte = parseNum(fteRaw);
      const mult = parseNum(p.fteMult);
      const start = parseDate(p.start, order);
      const end = parseDate(p.end, order);
      // AA: Total
      const total = fte !== 1 ? 0 : (mult === null || mult === 0 ? 1 : mult);
      // Excel trata la celda vacía como 0 en las comparaciones
      const s = start === null ? 0 : start;
      const e = end === null ? 0 : end;
      const sop = s >= c.coplanStart ? 0 : (e >= c.sopLastDay ? total : 0);
      const coplan = s >= c.coplanEndPlus1 ? 0 : (e >= c.coplanLastDay ? total : 0);
      // AD: Function (opcional apertura de Marketing en Field / Office)
      const home = str(p.homeFunc);
      let func = home;
      if (cfg.splitMarketing && norm(home) === 'marketing') {
        func = norm(p.subFunc) === norm(cfg.marketingFieldSubfunction || 'Marketing - Trade Marketing & Distribution - Field') ? 'Marketing Field' : 'Marketing Office';
      }
      const funcShort = lookup(cfg.funcMapBPC, func);
      const entityCode = str(p.pru).slice(0, 11);
      const entity = cfg.multiEntity ? (lookup(cfg.entityMapBPC, entityCode) || '(Sin entidad)') : (cfg.entityName || 'Total');
      const grade = gradeKey(p.payGrade, cfg.gradeGroupMax);
      const reasons = (startCut, endCut, counted) => {
        if (counted) return 'Cuenta';
        if (total === 0) return fte === null ? 'Sin FTE %' : 'FTE distinto de 100% (' + (Math.round(fte * 10000) / 100) + '%)';
        if (start !== null && s >= startCut) return 'Inicia en/después de ' + fmtDate(startCut);
        if (end === null) return 'Sin fecha de fin';
        if (e < endCut) return 'Termina antes de ' + fmtDate(endCut);
        return 'No cuenta';
      };
      return Object.assign({}, p, {
        startSerial: start, endSerial: end, fteNum: fte, total, countSOP: sop, countCOPLAN: coplan,
        func, funcShort: funcShort || '(Sin función)', entityCode, entity, grade,
        reasonSOP: reasons(c.coplanStart, c.sopLastDay, sop !== 0),
        reasonCOPLAN: reasons(c.coplanEndPlus1, c.coplanLastDay, coplan !== 0)
      });
    });
  }

  // ---------- Catálogo de HC Aprobado ----------
  function guessApprovedColumns(headers) {
    const H = headers.map(norm);
    const pick = (re, exclude) => H.findIndex((h) => re.test(h) && !(exclude && exclude.test(h)));
    const lastMatch = (re) => { let k = -1; H.forEach((h, i) => { if (re.test(h)) k = i; }); return k; };
    return {
      grade: pick(/grad[eo]|pay ?grade|nivel/),
      func: pick(/home function short|function|funcion|area|departamento/, /sub/),
      entity: pick(/entidad|entity|pais|country|mercado|market|unidad/),
      sop: lastMatch(/sop/),
      coplan: lastMatch(/coplan|co-plan/)
    };
  }
  function parseApproved(rows, headerIdx, cols, cfg) {
    const out = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const gRaw = cols.grade >= 0 ? r[cols.grade] : null;
      const sopV = cols.sop >= 0 ? parseNum(r[cols.sop]) : null;
      const copV = cols.coplan >= 0 ? parseNum(r[cols.coplan]) : null;
      if (isBlank(gRaw) && !sopV && !copV) continue;
      const g = norm(gRaw);
      if (/^(grand )?total|^suma|^sum of/.test(g)) continue;
      const funcRaw = cols.func >= 0 ? str(r[cols.func]) : '';
      const entRaw = cols.entity >= 0 ? str(r[cols.entity]) : '';
      out.push({
        _row: i + 1,
        gradeRaw: str(gRaw), funcRaw, entityRaw: entRaw,
        grade: gradeKey(gRaw, cfg.gradeGroupMax),
        funcShort: lookup(cfg.funcMapApp, funcRaw) || '(Sin función)',
        entity: cfg.multiEntity ? (lookup(cfg.entityMapApp, entRaw) || '(Sin entidad)') : (cfg.entityName || 'Total'),
        sop: sopV || 0, coplan: copV || 0
      });
    }
    return out;
  }

  // ---------- Comparación ----------
  function action(diff) {
    if (diff > 0) return 'Eliminate extra positions/Adjust end dates';
    if (diff < 0) return 'Add more positions/Adjust end dates';
    return 'No action required';
  }
  function compare(positions, approved, filter) {
    filter = filter || {};
    const okP = (x) => (!filter.entity || x.entity === filter.entity) && (!filter.func || x.funcShort === filter.func);
    const g = {};
    const ensure = (k) => (g[k] = g[k] || { grade: k, bpcSOP: 0, appSOP: 0, bpcCOPLAN: 0, appCOPLAN: 0, positions: 0 });
    positions.filter(okP).forEach((p) => { const r = ensure(p.grade); r.bpcSOP += p.countSOP; r.bpcCOPLAN += p.countCOPLAN; r.positions++; });
    approved.filter(okP).forEach((a) => { const r = ensure(a.grade); r.appSOP += a.sop; r.appCOPLAN += a.coplan; });
    const rows = sortGrades(Object.keys(g)).map((k) => {
      const r = g[k];
      r.diffSOP = Core.round(r.bpcSOP - r.appSOP, 4);
      r.diffCOPLAN = Core.round(r.bpcCOPLAN - r.appCOPLAN, 4);
      r.actionSOP = action(r.diffSOP);
      r.actionCOPLAN = action(r.diffCOPLAN);
      return r;
    }).filter((r) => r.bpcSOP || r.appSOP || r.bpcCOPLAN || r.appCOPLAN || r.positions);
    const tot = rows.reduce((t, r) => {
      ['bpcSOP', 'appSOP', 'bpcCOPLAN', 'appCOPLAN', 'diffSOP', 'diffCOPLAN', 'positions'].forEach((k) => { t[k] += r[k]; });
      return t;
    }, { grade: 'Grand Total', bpcSOP: 0, appSOP: 0, bpcCOPLAN: 0, appCOPLAN: 0, diffSOP: 0, diffCOPLAN: 0, positions: 0 });
    const status = (key) => {
      const bad = rows.filter((r) => r[key] !== 0).length;
      if (!bad) return { ok: true, text: 'HC ALIGNED AND READY', detail: 'Todos los grados cuadran.' };
      const totalDiff = Core.round(rows.reduce((a, r) => a + r[key], 0), 4);
      return {
        ok: false, text: 'NEEDS ADJUSTMENTS IN BPC',
        detail: bad + ' grado(s) con diferencia' + (totalDiff === 0 ? ' (ojo: el total da 0 porque las diferencias se compensan)' : ' · diferencia total ' + totalDiff)
      };
    };
    return { rows, total: tot, statusSOP: status('diffSOP'), statusCOPLAN: status('diffCOPLAN') };
  }

  function alerts(positions, approved, cfg) {
    const list = [];
    const add = (tipo, detalle, accion) => list.push({ tipo, detalle, accion });
    const uniq = (arr) => Array.from(new Set(arr)).filter(Boolean);
    const fBPC = uniq(positions.map((p) => p.func)).filter((f) => cfg.funcMapBPC && Object.keys(cfg.funcMapBPC).length && !hasMap(cfg.funcMapBPC, f));
    if (fBPC.length) add('Función sin equivalencia (BPC)', fBPC.join(', '), 'Agrégala en Configuración › Equivalencias de función BPC.');
    const fApp = uniq(approved.map((a) => a.funcRaw)).filter((f) => cfg.funcMapApp && Object.keys(cfg.funcMapApp).length && !hasMap(cfg.funcMapApp, f));
    if (fApp.length) add('Función sin equivalencia (Aprobado)', fApp.join(', '), 'Agrégala en Configuración › Equivalencias de función del HC Aprobado.');
    const fb = new Set(positions.map((p) => p.funcShort)), fa = new Set(approved.map((a) => a.funcShort));
    const onlyB = [...fb].filter((f) => !fa.has(f)), onlyA = [...fa].filter((f) => !fb.has(f));
    if (onlyB.length && approved.length) add('Función solo en BPC', onlyB.join(', '), 'No existe en el HC Aprobado con ese nombre: revisa las equivalencias.');
    if (onlyA.length && positions.length) add('Función solo en Aprobado', onlyA.join(', '), 'No existe en BPC con ese nombre: revisa las equivalencias.');
    if (cfg.multiEntity) {
      const eb = uniq(positions.filter((p) => !hasMap(cfg.entityMapBPC, p.entityCode)).map((p) => p.entityCode));
      if (eb.length) add('Unidad BPC sin entidad', eb.join(', '), 'Agrega el código de 11 caracteres en Configuración › Entidades BPC.');
      const ea = uniq(approved.filter((a) => !hasMap(cfg.entityMapApp, a.entityRaw)).map((a) => a.entityRaw));
      if (ea.length) add('Entidad del Aprobado sin equivalencia', ea.join(', '), 'Agrégala en Configuración › Entidades del HC Aprobado.');
    }
    const noEnd = positions.filter((p) => p.total && p.endSerial === null);
    if (noEnd.length) add('Posiciones sin fecha de fin', noEnd.length + ' posición(es), no cuentan (igual que en Excel). Filas: ' + noEnd.slice(0, 15).map((p) => p._row).join(', '), 'Revisa en BPC si deberían tener fecha de fin.');
    const part = positions.filter((p) => p.fteNum !== null && p.fteNum !== 1);
    if (part.length) add('FTE distinto de 100%', part.length + ' posición(es) quedan fuera del conteo (regla de la herramienta).', 'Informativo.');
    const badDates = positions.filter((p) => (!isBlank(p.start) && p.startSerial === null) || (!isBlank(p.end) && p.endSerial === null));
    if (badDates.length) add('Fechas no reconocidas', badDates.length + ' posición(es). Filas: ' + badDates.slice(0, 15).map((p) => p._row).join(', '), 'Revisa el formato de Start/End Date.');
    const noGrade = positions.filter((p) => p.grade === '(Sin grado)' && p.total);
    if (noGrade.length) add('Posiciones sin Pay Grade', noGrade.length + ' posición(es)', 'Revisa la captura en BPC.');
    if (!approved.length) add('HC Aprobado vacío', 'No se cargaron filas de HC Aprobado.', 'Carga el catálogo y elige las columnas SOP / COPLAN.');
    return list;
  }

  /** Corre todo el análisis. */
  function run(hrRows, approvedInput, cfg) {
    const parsed = parseHRInput(hrRows);
    const positions = computePositions(parsed.positions, cfg);
    let approved = [];
    if (approvedInput && approvedInput.rows) approved = parseApproved(approvedInput.rows, approvedInput.headerIdx, approvedInput.cols, cfg);
    const entities = Array.from(new Set(positions.map((p) => p.entity).concat(approved.map((a) => a.entity)))).sort();
    const funcs = Array.from(new Set(positions.map((p) => p.funcShort).concat(approved.map((a) => a.funcShort)))).sort();
    return { parsed, positions, approved, entities, funcs, alerts: alerts(positions, approved, cfg), overall: compare(positions, approved, {}) };
  }

  // ---------- Reporte Excel ----------
  async function buildReport(res, cfg, filter) {
    const wb = Core.newWorkbook();
    const C = Core.COLORS;
    const sopL = cfg.sopLabel || 'SOP', copL = cfg.coplanLabel || 'COPLAN';
    const cmp = compare(res.positions, res.approved, filter || {});

    // Resumen
    const ws = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
    Core.title(ws, 1, 'HC in BPC vs HC Approved — ' + (cfg.market || 'Mercado'), 'Generado: ' + Core.stamp() + ' · Archivo: ' + (cfg.sourceName || ''));
    const fdesc = 'Filtro: Entidad = ' + ((filter && filter.entity) || 'Todas') + ' · Función = ' + ((filter && filter.func) || 'Todas');
    ws.getCell('A3').value = fdesc;
    ws.getCell('A3').font = { bold: true };
    const block = (startCol, label, key, st) => {
      const t = ws.getCell(5, startCol);
      t.value = label;
      t.font = { bold: true, size: 12, color: { argb: C.navy } };
      const s = ws.getCell(6, startCol);
      s.value = st.text;
      s.font = { bold: true, color: { argb: st.ok ? C.greenTx : C.redTx } };
      s.fill = Core.fill(st.ok ? C.green : C.red);
      ws.getCell(6, startCol + 1).value = st.detail;
      ws.getCell(6, startCol + 1).font = { italic: true, size: 9 };
      const rows = cmp.rows.map((r) => [r.grade, r['bpc' + key], r['app' + key], r['diff' + key], r['action' + key]]);
      Core.writeTable(ws, 8, [
        { header: 'Pay Grade', width: 22 }, { header: 'HC BPC', width: 11, numFmt: '#,##0.##', total: true },
        { header: 'HC Approved', width: 12, numFmt: '#,##0.##', total: true },
        { header: 'Differences', width: 12, numFmt: '#,##0.##;[Red]-#,##0.##;0', total: true,
          style: (cell) => { const v = Number(cell.value) || 0; cell.fill = Core.fill(v === 0 ? C.green : C.red); } },
        { header: 'Action Required', width: 42 }
      ], rows, { startCol, totals: true, totalsLabel: 'Grand Total' });
    };
    block(1, sopL + ' (año en curso)', 'SOP', cmp.statusSOP);
    block(7, copL + ' (año siguiente)', 'COPLAN', cmp.statusCOPLAN);
    ws.getColumn(6).width = 3;
    let r0 = 10 + cmp.rows.length + 2;
    const notes = [
      'Cómo leer: Differences = HC BPC − HC Approved. Positivo = sobran posiciones en BPC; negativo = faltan.',
      'El semáforo revisa grado por grado (no solo la suma), así que diferencias que se compensan sí se detectan.',
      'Regla de conteo: la posición cuenta si FTE = 100%, ya existe dentro del año (inicia antes del ' + fmtDate(cfg.cutoffs.coplanStart) + ' para SOP / ' + fmtDate(cfg.cutoffs.coplanEndPlus1) + ' para COPLAN) y sigue viva al ' + fmtDate(cfg.cutoffs.sopLastDay) + ' (SOP) / ' + fmtDate(cfg.cutoffs.coplanLastDay) + ' (COPLAN).',
      'Detalle posición por posición en la hoja "Posiciones BPC" (columna Motivo).'
    ];
    notes.forEach((n, i) => { const c = ws.getCell(r0 + i, 1); c.value = n; c.font = { size: 9, color: { argb: 'FF595959' } }; });

    // Por función / entidad / grado
    const ws2 = wb.addWorksheet('Detalle por función', { views: [{ state: 'frozen', ySplit: 3 }] });
    Core.title(ws2, 1, 'Comparación por ' + (cfg.multiEntity ? 'entidad, ' : '') + 'función y grado', 'Usa los filtros del encabezado para aislar una función o entidad.');
    const det = [];
    const ents = cfg.multiEntity ? res.entities : [null];
    ents.forEach((e) => res.funcs.forEach((f) => {
      compare(res.positions, res.approved, { entity: e, func: f }).rows.forEach((r) => det.push([
        e || cfg.entityName || 'Total', f, r.grade, r.bpcSOP, r.appSOP, r.diffSOP, r.bpcCOPLAN, r.appCOPLAN, r.diffCOPLAN,
        r.diffSOP || r.diffCOPLAN ? 'Revisar' : 'OK'
      ]));
    }));
    const diffStyle = (cell) => { const v = Number(cell.value) || 0; if (v !== 0) cell.fill = Core.fill(C.red); };
    Core.writeTable(ws2, 3, [
      { header: 'Entidad', width: 20 }, { header: 'Función', width: 24 }, { header: 'Pay Grade', width: 20 },
      { header: 'BPC ' + sopL, width: 11, total: true }, { header: 'Aprobado ' + sopL, width: 13, total: true }, { header: 'Dif ' + sopL, width: 11, total: true, style: diffStyle },
      { header: 'BPC ' + copL, width: 12, total: true }, { header: 'Aprobado ' + copL, width: 14, total: true }, { header: 'Dif ' + copL, width: 12, total: true, style: diffStyle },
      { header: 'Estatus', width: 10 }
    ], det, { autoFilter: true });

    // Resumen por función (y entidad)
    const ws3 = wb.addWorksheet('Resumen por función');
    Core.title(ws3, 1, 'Totales por función' + (cfg.multiEntity ? ' y entidad' : ''));
    const sumRows = [];
    ents.forEach((e) => res.funcs.forEach((f) => {
      const t = compare(res.positions, res.approved, { entity: e, func: f }).total;
      if (t.bpcSOP || t.appSOP || t.bpcCOPLAN || t.appCOPLAN) sumRows.push([e || cfg.entityName || 'Total', f, t.bpcSOP, t.appSOP, t.diffSOP, t.bpcCOPLAN, t.appCOPLAN, t.diffCOPLAN]);
    }));
    Core.writeTable(ws3, 3, [
      { header: 'Entidad', width: 20 }, { header: 'Función', width: 26 },
      { header: 'BPC ' + sopL, width: 11, total: true }, { header: 'Aprobado ' + sopL, width: 13, total: true }, { header: 'Dif ' + sopL, width: 11, total: true, style: diffStyle },
      { header: 'BPC ' + copL, width: 12, total: true }, { header: 'Aprobado ' + copL, width: 14, total: true }, { header: 'Dif ' + copL, width: 12, total: true, style: diffStyle }
    ], sumRows, { totals: true, autoFilter: false });

    // Posiciones
    const ws4 = wb.addWorksheet('Posiciones BPC', { views: [{ state: 'frozen', ySplit: 1 }] });
    const pcols = HR_COLUMNS.map(([k, label]) => ({ header: label, key: k, width: 14 }));
    const extra = [
      { header: 'Total', key: 'total', width: 8 }, { header: 'Counted Positions ' + sopL, key: 'countSOP', width: 12 },
      { header: 'Counted Positions ' + copL, key: 'countCOPLAN', width: 13 }, { header: 'Function', key: 'func', width: 18 },
      { header: 'Home Function Short', key: 'funcShort', width: 18 }, { header: 'Código de Entidad', key: 'entityCode', width: 14 },
      { header: 'Entidad', key: 'entity', width: 16 }, { header: 'Grado (normalizado)', key: 'grade', width: 16 },
      { header: 'Motivo ' + sopL, key: 'reasonSOP', width: 30 }, { header: 'Motivo ' + copL, key: 'reasonCOPLAN', width: 30 },
      { header: 'Fila origen', key: '_row', width: 9 }
    ];
    const prow = res.positions.map((p) => {
      const o = Object.assign({}, p);
      o.start = p.startSerial !== null ? Core.serialToJSDate(p.startSerial) : p.start;
      o.end = p.endSerial !== null ? Core.serialToJSDate(p.endSerial) : p.end;
      return o;
    });
    pcols.forEach((c) => { if (c.key === 'start' || c.key === 'end') c.numFmt = 'dd/mm/yyyy'; });
    Core.writeTable(ws4, 1, pcols.concat(extra), prow, {
      autoFilter: true, headerColor: C.blue,
      rowStyle: (row, p) => { if (!p.countSOP && !p.countCOPLAN) row.eachCell((c) => { c.font = { color: { argb: 'FF808080' } }; }); }
    });

    // Aprobado
    const ws5 = wb.addWorksheet('HC Aprobado');
    Core.writeTable(ws5, 1, [
      { header: 'Fila origen', key: '_row', width: 9 }, { header: 'Grado (original)', key: 'gradeRaw', width: 16 },
      { header: 'Grado (normalizado)', key: 'grade', width: 18 }, { header: 'Función (original)', key: 'funcRaw', width: 22 },
      { header: 'Función (normalizada)', key: 'funcShort', width: 20 }, { header: 'Entidad (original)', key: 'entityRaw', width: 18 },
      { header: 'Entidad', key: 'entity', width: 16 }, { header: 'Aprobado ' + sopL, key: 'sop', width: 13, total: true },
      { header: 'Aprobado ' + copL, key: 'coplan', width: 14, total: true }
    ], res.approved, { autoFilter: true, totals: true });

    // Alertas y parámetros
    const ws6 = wb.addWorksheet('Alertas y parámetros');
    Core.title(ws6, 1, 'Alertas');
    const al = res.alerts.length ? res.alerts : [{ tipo: 'Sin alertas', detalle: 'Todo en orden', accion: '' }];
    const end = Core.writeTable(ws6, 3, [{ header: 'Tipo', key: 'tipo', width: 32 }, { header: 'Detalle', key: 'detalle', width: 80 }, { header: 'Acción sugerida', key: 'accion', width: 60 }], al);
    const pr = end.lastRow + 3;
    Core.title(ws6, pr, 'Parámetros usados');
    Core.writeTable(ws6, pr + 2, [{ header: 'Parámetro', width: 32 }, { header: 'Valor', width: 80 }], [
      ['Mercado', cfg.market || ''], ['Ejercicio SOP', sopL], ['Ejercicio COPLAN', copL],
      ['Corte superior SOP (inicia antes de)', fmtDate(cfg.cutoffs.coplanStart)], ['Corte inferior SOP (vive al)', fmtDate(cfg.cutoffs.sopLastDay)],
      ['Corte superior COPLAN (inicia antes de)', fmtDate(cfg.cutoffs.coplanEndPlus1)], ['Corte inferior COPLAN (vive al)', fmtDate(cfg.cutoffs.coplanLastDay)],
      ['Separa Marketing Field / Office', cfg.splitMarketing ? 'Sí' : 'No'], ['Multi-entidad', cfg.multiEntity ? 'Sí' : 'No'],
      ['Agrupa grados ≤', cfg.gradeGroupMax || 'No'], ['Encabezado HR Input', res.parsed.headerCell], ['Posiciones leídas', res.positions.length],
      ['Filas de HC Aprobado', res.approved.length]
    ]);
    return wb;
  }

  return {
    HR_COLUMNS, MARKETS, defaultCutoffs, parseHRInput, computePositions, gradeKey, sortGrades,
    guessApprovedColumns, parseApproved, compare, alerts, run, buildReport, lookup
  };
});
