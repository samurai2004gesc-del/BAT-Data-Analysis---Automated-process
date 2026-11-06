/* Procesamiento y Reclasificación de Costos de Movilidad Internacional (K2, EY, Deloitte, SIRVA...).
 *  Paso 2: completa HRBP / Home Function / CeCo desde el Histórico y genera "Sent to HRBPs".
 *  Paso 4: valida que cada CeCo devuelto por los HRBPs pertenezca a la sociedad (MX15) con "All CeCos - Approvers".
 *  Paso 5: calcula el tipo de cambio con el export de KSB1, genera las filas para "Histórico K2" y la
 *          "Reclasificacion por CeCo".
 *  Checklist: verifica que la carpeta del mes/proveedor tenga las 6 evidencias. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.Reclass = factory(root.Core);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';
  const { norm, isBlank, str, parseNum } = Core;

  // ---------- Archivo del proveedor / Retrieved ----------
  function detectSupplier(rows) {
    const h = Core.findHeaderRow(rows, ['Assignee Name', 'Employee', 'Name', 'Nombre', 'Amount', 'Gross', 'Invoice', 'Service', 'Currency'], 30);
    if (h < 0) throw new Error('No encontré la fila de encabezados en el archivo (busqué "Assignee Name", "Amount", etc.).');
    const hd = rows[h] || [];
    const cols = {
      name: Core.findCol(hd, ['Assignee Name', 'Employee Name', 'Assignee', 'Nombre del colaborador', 'Nombre', /(^| )name$/], ['manager', 'contact', 'company', 'hrbp', 'vendor', 'supplier']),
      amount: Core.findCol(hd, [/gross amount/, /total amount/, /amount/, /importe/, /monto/, /^total/, /fee/], ['mxn', 'tax', 'vat', 'iva', 'net']),
      currency: Core.findCol(hd, [/currency/, /moneda/, /^curr/]),
      service: Core.findCol(hd, [/servicio/, /service/, /description/, /descripcion/, /concept/, /activity/, /^item/]),
      hrbp: Core.findCol(hd, ['HRBP']),
      func: Core.findCol(hd, ['Home Function', 'Function', 'Funcion', 'Area'], ['sub']),
      ceco: Core.findCol(hd, [/^ce ?co$/, /ceco/, /cost cent/, /centro de cost/]),
      validation: Core.findCol(hd, ['Validation', 'Validacion', 'Sociedad'])
    };
    if (cols.name < 0) throw new Error('No encontré la columna con el nombre del colaborador (ej. "Assignee Name").');
    const data = [];
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      if (Core.rowIsEmpty(r)) continue;
      const nm = str(r[cols.name]);
      if (!nm || /^(grand )?total/.test(norm(nm))) continue;
      data.push({ _row: i + 1, raw: r, name: nm });
    }
    return { headerIdx: h, header: hd, cols, data };
  }

  // ---------- Fuentes de información (Histórico / Directorio) ----------
  function readSource(rows, label) {
    const h = Core.findHeaderRow(rows, ['CeCo', 'Ceco', 'HRBP', 'Home Function', 'Gross Amount', 'Tipo', 'Servicio', 'Nombre', 'Name', 'Year', 'Mes'], 30);
    if (h < 0) return [];
    const hd = rows[h] || [];
    let name = Core.findCol(hd, ['Assignee Name', 'Nombre', 'Name', 'Colaborador', 'Employee'], ['hrbp', 'manager']);
    if (name < 0) name = 0;
    const c = {
      hrbp: Core.findCol(hd, ['HRBP']),
      func: Core.findCol(hd, ['Home Function', 'Function', 'Funcion', 'Area'], ['sub']),
      ceco: Core.findCol(hd, [/^ce ?co$/, /ceco/, /cost cent/, /centro de cost/]),
      year: Core.findCol(hd, ['Year', 'Año', 'Ano']),
      mes: Core.findCol(hd, ['Mes', 'Month'])
    };
    const out = [];
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const nm = str(r[name]);
      if (!nm) continue;
      const rec = {
        name: nm, hrbp: c.hrbp >= 0 ? str(r[c.hrbp]) : '', func: c.func >= 0 ? str(r[c.func]) : '', ceco: c.ceco >= 0 ? str(r[c.ceco]) : '',
        order: (c.year >= 0 ? (parseNum(r[c.year]) || 0) * 100 : 0) + (c.mes >= 0 ? parseNum(r[c.mes]) || 0 : 0), seq: i, source: label
      };
      if (/^#n\/?a|^0$/.test(norm(rec.func))) rec.func = '';
      if (rec.hrbp || rec.func || rec.ceco) out.push(rec);
    }
    return out;
  }
  /** Mejor coincidencia por nombre (sin importar orden "Nombre Apellido" / "Apellido, Nombre"); toma el registro más reciente. */
  function findPerson(name, sources) {
    let best = null;
    for (const s of sources) {
      const sc = Core.nameScore(name, s.name);
      if (sc < 0.6) continue;
      if (!best || sc > best.score || (sc === best.score && (s.priority > best.rec.priority || (s.priority === best.rec.priority && (s.order > best.rec.order || (s.order === best.rec.order && s.seq > best.rec.seq)))))) best = { score: sc, rec: s };
    }
    return best;
  }
  /** Para cada campo toma el valor más reciente no vacío entre los registros de la persona. */
  function enrich(supplier, histRecords, dirRecords) {
    const all = (dirRecords || []).map((r) => Object.assign({ priority: 2 }, r)).concat((histRecords || []).map((r) => Object.assign({ priority: 1 }, r)));
    return supplier.data.map((d) => {
      const out = { hrbp: '', func: '', ceco: '', score: 0, matchedName: '', from: {} };
      ['hrbp', 'func', 'ceco'].forEach((f) => {
        const cands = all.filter((s) => s[f]);
        const m = findPerson(d.name, cands);
        if (m) { out[f] = m.rec[f]; out.from[f] = m.rec.source; out.score = Math.max(out.score, m.score); out.matchedName = out.matchedName || m.rec.name; }
      });
      // Si el archivo ya trae los datos (p. ej. Retrieved), respétalos
      const c = supplier.cols;
      if (c.hrbp >= 0 && str(d.raw[c.hrbp])) { out.hrbp = str(d.raw[c.hrbp]); out.from.hrbp = 'archivo'; }
      if (c.func >= 0 && str(d.raw[c.func])) { out.func = str(d.raw[c.func]); out.from.func = 'archivo'; }
      if (c.ceco >= 0 && str(d.raw[c.ceco])) { out.ceco = str(d.raw[c.ceco]).toUpperCase(); out.from.ceco = 'archivo'; }
      return out;
    });
  }

  // ---------- All CeCos - Approvers ----------
  function readCecos(rows) {
    const h = Core.findHeaderRow(rows, ['Cost Center', 'CeCo', 'Company Code', 'Sociedad', 'Approver', 'Kostl', 'Bukrs'], 30);
    let hi = h >= 0 ? h : 0;
    const hd = rows[hi] || [];
    let ceco = Core.findCol(hd, [/^ce ?co$/, /^cost cent(er|re)$/, /ceco/, /cost cent/, /centro de cost/, /kostl/], ['name', 'desc', 'nombre', 'group', 'function']);
    let soc = Core.findCol(hd, [/^sociedad$/, /company code/, /^comp\.? ?code/, /^bukrs/, /^soc/, /company/]);
    // Respaldo: fórmula del manual usa G (CeCo) y B (Sociedad)
    if (ceco < 0) ceco = 6;
    if (soc < 0) soc = 1;
    const map = {};
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const k = str(r[ceco]).toUpperCase();
      if (!k) continue;
      if (!map[k]) map[k] = str(r[soc]).toUpperCase();
    }
    return { map, cecoCol: ceco, socCol: soc, count: Object.keys(map).length };
  }
  function validateCeco(ceco, cecos, sociedad) {
    const k = str(ceco).toUpperCase();
    if (!k) return { status: 'VACIO', text: 'Sin CeCo', soc: '' };
    if (!cecos) return { status: 'SIN_CATALOGO', text: 'Sin catálogo', soc: '' };
    const soc = cecos.map[k];
    if (soc === undefined) return { status: 'NO_EXISTE', text: 'No existe en All CeCos', soc: '' };
    if (soc !== String(sociedad).toUpperCase()) return { status: 'OTRA_SOC', text: 'Pertenece a ' + soc + ' (debe ser ' + sociedad + ')', soc };
    return { status: 'OK', text: soc, soc };
  }

  // ---------- Libros de salida ----------
  function colWidthsFromHeader(header) { return header.map((h) => Math.min(40, Math.max(10, String(h || '').length + 4))); }

  /** "Sent to HRBPs - MX15 [Proveedor].xlsx": archivo original + 3 columnas (HRBP, Home Function, CeCo) a la derecha del nombre. */
  async function buildSentToHRBP(supplier, enriched, p) {
    const wb = Core.newWorkbook();
    const C = Core.COLORS;
    const ws = wb.addWorksheet(p.sociedad || 'MX15', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
    const nameCol = supplier.cols.name;
    const skip = new Set([supplier.cols.hrbp, supplier.cols.func, supplier.cols.ceco, supplier.cols.validation].filter((i) => i >= 0));
    const origIdx = supplier.header.map((_, i) => i).filter((i) => !skip.has(i));
    const header = [];
    const plan = [];
    origIdx.forEach((i) => {
      header.push(Core.isBlank(supplier.header[i]) ? '' : supplier.header[i]); plan.push({ src: i });
      if (i === nameCol) { header.push('HRBP', 'Home Function', 'CeCo'); plan.push({ add: 'hrbp' }, { add: 'func' }, { add: 'ceco' }); }
    });
    const hr = ws.getRow(1);
    header.forEach((h, j) => { hr.getCell(j + 1).value = h; });
    Core.styleHeader(hr, C.blue);
    plan.forEach((pl, j) => { if (pl.add) hr.getCell(j + 1).fill = Core.fill('FFC00000'); });
    supplier.data.forEach((d, k) => {
      const row = ws.getRow(k + 2);
      const e = enriched[k];
      plan.forEach((pl, j) => {
        const cell = row.getCell(j + 1);
        if (pl.add) {
          cell.value = e[pl.add] || null;
          cell.fill = Core.fill(e[pl.add] ? C.orange : C.yellow);
        } else {
          let v = d.raw[pl.src];
          cell.value = v === undefined ? null : v;
        }
        cell.border = Core.BORDER;
      });
    });
    const widths = colWidthsFromHeader(header);
    widths.forEach((w, j) => { ws.getColumn(j + 1).width = plan[j].add ? (plan[j].add === 'hrbp' ? 28 : 20) : w; });
    ws.getColumn(nameCol + 1).width = 32;
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: supplier.data.length + 1, column: header.length } };
    const legend = ws.getRow(supplier.data.length + 3);
    legend.getCell(1).value = 'Naranja = dato tomado del histórico (validar) · Amarillo = falta el dato, favor de completar. Los CeCos deben pertenecer a la sociedad ' + (p.sociedad || 'MX15') + '.';
    legend.getCell(1).font = { italic: true, size: 9 };
    return wb;
  }

  /** Archivo validado: agrega la columna Validation (sociedad) y Estatus con colores. */
  async function buildValidated(supplier, enriched, cecos, p) {
    const wb = Core.newWorkbook();
    const C = Core.COLORS;
    const ws = wb.addWorksheet('Validación', { views: [{ state: 'frozen', ySplit: 1 }] });
    const cols = [
      { header: 'Assignee Name', width: 32 }, { header: 'HRBP', width: 28 }, { header: 'Home Function', width: 22 }, { header: 'CeCo', width: 14 },
      { header: 'Validation', width: 12 }, { header: 'Estatus', width: 34 }, { header: 'Monto', width: 13, numFmt: '#,##0.00' }, { header: 'Servicio', width: 40 }
    ];
    const rows = supplier.data.map((d, k) => {
      const e = enriched[k];
      const v = validateCeco(e.ceco, cecos, p.sociedad);
      return [d.name, e.hrbp, e.func, e.ceco, v.soc, v.status === 'OK' ? 'OK' : v.text, supplier.cols.amount >= 0 ? parseNum(d.raw[supplier.cols.amount]) : null, supplier.cols.service >= 0 ? str(d.raw[supplier.cols.service]) : '', v.status];
    });
    Core.writeTable(ws, 1, cols, rows, {
      autoFilter: true,
      rowStyle: (row, r) => {
        const ok = r[8] === 'OK';
        [5, 6].forEach((c) => { const cell = row.getCell(c); cell.fill = Core.fill(ok ? C.green : C.red); cell.font = { color: { argb: ok ? C.greenTx : C.redTx }, bold: !ok }; });
      }
    });
    return wb;
  }

  // ---------- KSB1 ----------
  function readKSB1(rows) {
    const h = Core.findHeaderRow(rows, ['Document Number', 'DocumentNo', 'Cost Center', 'Posting Date', 'Value TranCurr', 'TCurr', 'ObjCur', 'Val/ObjCur', 'Document Header Text', 'Name'], 30);
    if (h < 0) throw new Error('No reconocí el reporte de KSB1 (busqué "Document Number", "Value TranCurr", etc.).');
    const hd = rows[h] || [];
    const c = {
      doc: Core.findCol(hd, [/document ?n(o|umber)/, /^doc/]),
      date: Core.findCol(hd, [/posting date/, /fecha/]),
      tran: Core.findCol(hd, [/value ?trancurr/, /value in transaction/, /val\.? ?trancurr/, /in transaction cur/]),
      tcur: Core.findCol(hd, [/^tcurr$/, /transaction currency/, /^trans\.? ?curr/]),
      obj: Core.findCol(hd, [/val\/? ?objcur/, /value ?objcur/, /value in obj/, /obj\.? ?curr.*val/, /in object cur/]),
      ocur: Core.findCol(hd, [/^objcur$/, /object currency/, /^obj\.? ?curr$/]),
      text: Core.findCol(hd, [/document header text/, /^text$/, /^name$/, /cost element name/, /descrip/]),
      ceco: Core.findCol(hd, [/cost cent/, /^ceco/])
    };
    if (c.tran < 0 || c.obj < 0) throw new Error('El reporte KSB1 no tiene las columnas de importe (Value TranCurr y Val/ObjCur).');
    const out = [];
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const tran = parseNum(r[c.tran]), obj = parseNum(r[c.obj]);
      if (tran === null && obj === null) continue;
      out.push({
        _row: i + 1, doc: c.doc >= 0 ? str(r[c.doc]) : '', date: c.date >= 0 ? Core.parseDate(r[c.date]) : null,
        tran: tran || 0, tcur: c.tcur >= 0 ? str(r[c.tcur]).toUpperCase() : '', obj: obj || 0, ocur: c.ocur >= 0 ? str(r[c.ocur]).toUpperCase() : 'MXN',
        text: c.text >= 0 ? str(r[c.text]) : '', ceco: c.ceco >= 0 ? str(r[c.ceco]) : ''
      });
    }
    return out;
  }
  function exRateFrom(lines) {
    const t = lines.reduce((a, l) => a + Math.abs(l.tran), 0);
    const o = lines.reduce((a, l) => a + Math.abs(l.obj), 0);
    return t ? o / t : null;
  }

  // ---------- Reclasificación ----------
  function buildHistoricRows(supplier, enriched, cecos, p) {
    const ok = [], excluded = [];
    supplier.data.forEach((d, k) => {
      const e = enriched[k];
      const amt = supplier.cols.amount >= 0 ? parseNum(d.raw[supplier.cols.amount]) : null;
      const v = validateCeco(e.ceco, cecos, p.sociedad);
      const rec = {
        name: d.name, gbp: amt, ceco: e.ceco, tipo: p.provider, servicio: supplier.cols.service >= 0 ? str(d.raw[supplier.cols.service]) : '',
        exRate: p.exRate, mxn: amt !== null && p.exRate ? amt * p.exRate : null, mes: Number(p.month), year: Number(p.year), validation: v
      };
      if (amt === null || amt === 0) excluded.push(Object.assign(rec, { motivo: 'Sin monto' }));
      else if (cecos && v.status !== 'OK') excluded.push(Object.assign(rec, { motivo: v.text }));
      else if (!e.ceco) excluded.push(Object.assign(rec, { motivo: 'Sin CeCo' }));
      else ok.push(rec);
    });
    return { ok, excluded };
  }
  function pivotByCeco(recs) {
    const m = {};
    recs.forEach((r) => { const k = r.ceco; m[k] = m[k] || { ceco: k, mxn: 0, gbp: 0, n: 0 }; m[k].mxn += r.mxn || 0; m[k].gbp += r.gbp || 0; m[k].n++; });
    return Object.values(m).sort((a, b) => a.ceco.localeCompare(b.ceco));
  }
  async function buildReclassWorkbook(result, p) {
    const wb = Core.newWorkbook();
    const C = Core.COLORS;
    const ws = wb.addWorksheet('Reclasificacion por CeCo', { views: [{ showGridLines: false }] });
    const lbl = (r, a, b) => { const x = ws.getCell(r, 1); x.value = a; x.font = { bold: true, color: { argb: 'FFC00000' } }; ws.getCell(r, 2).value = b; };
    lbl(1, 'Sociedad', p.sociedad || 'MX15');
    lbl(2, 'Cuenta', p.account || '5001208100 Other Staff Costs - Expat Recharge Exp');
    lbl(3, 'Centro de costo origen', p.sourceCeco || 'MXCB7B0016 HR Recharges');
    lbl(4, 'Proveedor', p.provider);
    lbl(5, 'Periodo', Core.MESES[Number(p.month) - 1] + ' ' + p.year);
    lbl(6, 'Tipo de cambio', p.exRate ? Core.round(p.exRate, 6) : 'N/D');
    const piv = pivotByCeco(result.ok);
    Core.writeTable(ws, 8, [
      { header: 'Row Labels (CeCo destino)', width: 26 }, { header: 'Sum of Gross-Amount MXN', width: 24, numFmt: '"$"#,##0.00', total: true },
      { header: 'Sum of Gross Amount (GBP)', width: 24, numFmt: '"£"#,##0.00', total: true }, { header: 'Cargos', width: 9, total: true }
    ], piv.map((r) => [r.ceco, Core.round(r.mxn, 2), Core.round(r.gbp, 2), r.n]), { totals: true, totalsLabel: 'Grand Total' });
    ws.getColumn(1).width = 26;
    ws.getColumn(2).width = 48;

    const ws2 = wb.addWorksheet('Detalle');
    Core.writeTable(ws2, 1, [
      { header: 'Nombre', width: 32 }, { header: 'Gross Amount (GBP)', width: 16, numFmt: '#,##0.00', total: true }, { header: 'CeCo', width: 14 },
      { header: 'Tipo', width: 10 }, { header: 'Servicio', width: 44 }, { header: 'ExRate', width: 11, numFmt: '0.0000' },
      { header: 'Gross Amount MXN', width: 18, numFmt: '#,##0.00', total: true }, { header: 'Mes', width: 6 }, { header: 'Year', width: 7 }
    ], result.ok.map((r) => [r.name, r.gbp, r.ceco, r.tipo, r.servicio, r.exRate, r.mxn === null ? null : Core.round(r.mxn, 2), r.mes, r.year]), { totals: true, autoFilter: true });
    if (result.excluded.length) {
      const ws3 = wb.addWorksheet('Excluidos');
      Core.title(ws3, 1, 'Cargos NO incluidos en la reclasificación', 'Corrige con el HRBP y vuelve a generar.');
      Core.writeTable(ws3, 3, [{ header: 'Nombre', width: 32 }, { header: 'Monto', width: 14, numFmt: '#,##0.00' }, { header: 'CeCo', width: 14 }, { header: 'Motivo', width: 40 }, { header: 'Servicio', width: 40 }],
        result.excluded.map((r) => [r.name, r.gbp, r.ceco, r.motivo, r.servicio]), {
          rowStyle: (row) => { row.getCell(4).fill = Core.fill(C.red); }
        });
    }
    return wb;
  }
  /** Filas listas para pegar en la hoja "Histórico K2" (columnas A a I del Consolidado). */
  async function buildHistoricPaste(result) {
    const wb = Core.newWorkbook();
    const ws = wb.addWorksheet('Para Histórico K2');
    const t = Core.writeTable(ws, 1, [
      { header: 'Nombre', width: 32 }, { header: 'Gross Amount (GBP)', width: 16, numFmt: '#,##0.00' }, { header: 'Ceco', width: 14 },
      { header: 'Tipo', width: 10 }, { header: 'Servicio', width: 44 }, { header: 'ExRate', width: 11, numFmt: '0.0000' },
      { header: 'Gross Amount MXN', width: 18, numFmt: '#,##0.00' }, { header: 'Mes', width: 6 }, { header: 'Year', width: 7 }
    ], result.ok.map((r) => [r.name, r.gbp, r.ceco, r.tipo, r.servicio, r.exRate, null, r.mes, r.year]));
    for (let r = 2; r <= t.lastRow; r++) {
      const rec = result.ok[r - 2];
      ws.getCell(r, 7).value = { formula: 'B' + r + '*F' + r, result: rec.mxn === null ? 0 : Core.round(rec.mxn, 2) };
    }
    return wb;
  }

  // ---------- Correos ----------
  function emailToHRBPs(p) {
    const mes = Core.MESES[Number(p.month) - 1];
    return {
      subject: p.provider + ' Expats ' + mes + ' ' + p.sociedad,
      body: '¡Hola Team!\n\nEspero este correo los encuentre bien.\n\nAdjunto los cargos por servicios de expatriados que ' + p.provider + ' nos está facturando este mes de ' + mes + '. Solicito de su valioso y acostumbrado apoyo con lo siguiente por favor:\n\n' +
        '1. Validar: De acuerdo con su función, revisar si el servicio que nos están cargando es correcto.\n' +
        '2. CeCo: Devolver el archivo con el CeCo para cargar el costo del servicio.\n\n' +
        'La fecha límite para completar estos pasos es ' + (p.deadline || '{fecha límite}') + '. De no recibir la información en ese plazo, el costo se asignará al centro de costos de HR, independientemente de si corresponde a México o no.\n\n' +
        'Nota: He agregado los CeCos que tenemos como histórico, por favor revisen si estos están correctos; por otro lado, si planean proporcionarnos otros CeCos, favor de validar que pertenezcan a la Sociedad ' + p.sociedad + '.\n\nQuedo atento a cualquier duda.\n\nSaludos.'
    };
  }
  function emailInvalidCecos(hrbp, items, p) {
    const lines = items.map((i) => '• ' + i.name + ' — CeCo ' + (i.ceco || '(vacío)') + ': ' + i.text).join('\n');
    return {
      subject: 'RE: ' + p.provider + ' Expats ' + Core.MESES[Number(p.month) - 1] + ' ' + p.sociedad + ' — CeCo por corregir',
      body: 'Hola ' + (hrbp || '') + ',\n\nGracias por tu apoyo. Al validar los CeCos contra el catálogo oficial (All CeCos - Approvers), los siguientes no pertenecen a la sociedad ' + p.sociedad + ' (BAT Servicios) o no existen:\n\n' + lines +
        '\n\n¿Me ayudas por favor a confirmar la clave correcta dentro de la sociedad ' + p.sociedad + '?\n\nSaludos.'
    };
  }

  function emailReclass(result, p) {
    const mes = Core.MESES[Number(p.month) - 1];
    const piv = pivotByCeco(result.ok);
    const tot = piv.reduce((a, r) => a + r.mxn, 0);
    const fmt = (n) => Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return {
      subject: 'Reclasificación por CeCo - ' + p.provider + ' ' + mes + ' ' + p.year + ' ' + p.sociedad,
      body: 'Hola,\n\nAdjunto la reclasificación por CeCo de los cargos de ' + p.provider + ' correspondientes a ' + mes + ' ' + p.year + ', ya validados por los HRBPs (todos los CeCos pertenecen a la sociedad ' + p.sociedad + ').\n\n' +
        '• Sociedad: ' + p.sociedad + '\n• Cuenta: ' + (p.account || '5001208100 Other Staff Costs - Expat Recharge Exp') + '\n• CeCo origen: ' + (p.sourceCeco || 'MXCB7B0016 HR Recharges') + '\n' +
        '• Tipo de cambio: ' + (p.exRate ? Core.round(p.exRate, 4) : 'N/D') + '\n• Total a reclasificar: $' + fmt(tot) + ' MXN en ' + piv.length + ' CeCo(s)\n\n' +
        piv.map((r) => r.ceco + ': $' + fmt(r.mxn) + ' MXN').join('\n') +
        '\n\n¿Me apoyas por favor con la reclasificación y me confirmas cuando quede registrada?\n\nSaludos.'
    };
  }

  // ---------- Checklist de evidencia ----------
  function evidenceChecklist(fileNames, provider, sociedad) {
    const prov = norm(provider), soc = norm(sociedad || 'MX15');
    const N = fileNames.map((f) => ({ f, n: norm(f).replace(/^\d+\.\s*/, '') }));
    const has = (test) => N.filter((x) => test(x.n)).map((x) => x.f);
    const items = [
      { id: 1, label: 'Correo original de Global', pattern: prov + ' costs - Non-PO billing ... .msg', files: has((n) => n.endsWith('.msg') && !/^re[_:\s]/.test(n) && (n.includes('non-po') || n.includes(prov))) },
      { id: 2, label: 'Reporte del proveedor', pattern: provider + ' ' + sociedad + '.xlsx', files: has((n) => /\.xls[xm]?$/.test(n) && n.includes(prov) && n.includes(soc) && !/sent to|retrieved|reclasific/.test(n)) },
      { id: 3, label: 'Archivo enviado a HRBPs', pattern: 'Sent to HRBPs - ' + sociedad + ' ' + provider + '.xlsx', files: has((n) => n.includes('sent to hrbp')) },
      { id: 4, label: 'Respuesta de HRBPs', pattern: 'Retrieved From HRBPs - ' + sociedad + ' ' + provider + '.xlsx', files: has((n) => n.includes('retrieved from hrbp')) },
      { id: 5, label: 'Correo de confirmación HRBP', pattern: 'RE_ ' + provider + ' Expats [Mes] ' + sociedad + '.msg', files: has((n) => n.endsWith('.msg') && /^re[_:\s]/.test(n)) },
      { id: 6, label: 'Reclasificación final', pattern: 'Reclasificacion por CeCo.xlsx', files: has((n) => n.includes('reclasificacion por ceco')) }
    ];
    items.forEach((i) => { i.ok = i.files.length > 0; });
    return items;
  }
  /** Ruta relativa a "{Año}\\Tracker": Suppliers/06. Junio/K2 */
  function supplierRelPath(month, provider) {
    return 'Suppliers/' + Core.pad(Number(month)) + '. ' + Core.MESES[Number(month) - 1] + '/' + Core.safeFileName(provider);
  }
  function supplierFolder(oneId, year, month, provider) {
    return 'C:\\Users\\' + (oneId || '{OneID}') + '\\BAT\\Gerencia HRSS-Organización - General\\' + year + '\\Tracker\\Suppliers\\' + Core.pad(Number(month)) + '. ' + Core.MESES[Number(month) - 1] + '\\' + provider;
  }

  return {
    detectSupplier, readSource, findPerson, enrich, readCecos, validateCeco, buildSentToHRBP, buildValidated,
    readKSB1, exRateFrom, buildHistoricRows, pivotByCeco, buildReclassWorkbook, buildHistoricPaste,
    emailToHRBPs, emailInvalidCecos, emailReclass, evidenceChecklist, supplierFolder, supplierRelPath
  };
});
