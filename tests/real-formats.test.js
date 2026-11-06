'use strict';
/* Pruebas con la ESTRUCTURA de los archivos reales del área (encabezados, hojas y acomodo idénticos),
 * pero con datos ficticios. Los archivos reales no se guardan en el repositorio.
 * Calibrado en noviembre 2026 con: Webi/JVU/Accrual aceptados por SAP, K2 y Deloitte MX15, Retrieved,
 * All CeCos - Approvers, Reclasificación por CeCo, Listado de Recharges con Tracker, y el maestro de HC de CAR. */
const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const Core = require('../src/js/core.js');
const HC = require('../src/js/hc.js');
const R = require('../src/js/recharges.js');
const RC = require('../src/js/reclass.js');
const B = require('../src/js/bulk.js');

const rt = (wb) => XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellNF: true, cellText: true });
const book = (sheets, hidden) => {
  const wb = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([n, aoa]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n));
  if (hidden) { wb.Workbook = { Sheets: wb.SheetNames.map((n) => ({ name: n, Hidden: hidden.includes(n) ? 1 : 0 })) }; }
  return rt(wb);
};

test('TXT para SAP: igual al de Excel, con comillas en textos que llevan coma (JVU real)', () => {
  const grid = [
    ['Serial Number', 'Simulation', 'Document Date<YYYYMMDD>', 'Document Type'],
    [null, null, 'Post Key', 'Account(GL, AP, AR)'],
    ['1', '', '50', '5003120100']
  ];
  const txt = Core.toTabText(Core.cleanGrid(grid));
  assert.strictEqual(txt.split('\r\n')[1], '\t\tPost Key\t"Account(GL, AP, AR)"');
  assert.ok(txt.endsWith('\r\n'));
  // Todas las filas con el mismo número de columnas (Excel guarda el rango rectangular)
  assert.deepStrictEqual(txt.trim().split('\r\n').map((l) => l.split('\t').length), [4, 4, 4]);
});

test('Deloitte MX15: monto en GBP con IVA, servicio por tarifa, sin tomar el CeCo del país destino', () => {
  const H = ['Period', 'Billing Country', 'Deloitte Number', 'Success Factors ID', 'Assignee Name\r\n(Surname, first name)', 'Relationship', 'Full Name', 'Host GMSP',
    'Home Region', 'Host Region', 'Home Country', 'Host Country', 'Home Entity (Employing)', 'Host Entity (Sponsoring)', 'Host Cost Centre', 'Company Code', 'Rechage Type',
    'Home cost Center', 'Host Success Factor ID', 'Assignment Type(e_x002e_g_x002e_, Permanent, LTA, STA, repatriation)', 'Case Type Category', 'Case Type', 'Case Sub Type',
    'Fee Code as per rate card', 'Service Type', 'Fee Type', 'Fee Type as per rate card', 'Local Currency', 'Legal Amount in Local currency', 'Local Sales Tax in Local Currency',
    'FX rate to GBP', 'Legal amount+Local Sales Tax(GBP)', 'Discount Percent', 'Disbursement description', 'Disbursements Currency', 'Total Disbursements Amount (Local currency)',
    'Total Disbursements Amount (GBP)', '3rd Party Expenses description', 'Total 3rd Party Expenses Amount (Local Currency)', 'Total 3rd Party Expenses Amount (GBP)',
    'Total Amount (excl VAT) in GBP', 'VAT', 'Total Amount(inc_x002e_VAT) in GBP', 'Type of Charge', 'Category'];
  const row = (name, fee, amt) => { const r = H.map(() => null); r[0] = 'June'; r[4] = name; r[14] = 'HOSTCC01'; r[24] = 'Core service'; r[26] = fee; r[27] = 'MXN'; r[28] = 9200; r[31] = amt; r[40] = amt; r[41] = amt * 0.2; r[42] = amt * 1.2; return r; };
  const wb = book({ MX15: [H, row('Lopez, Ana', 'Standard Assessment', 400), row('Perez, Juan', 'Renewal: Temporary Residence Permit', 600)] });
  const s = RC.detectSupplier(Core.sheetRows(wb.Sheets.MX15));
  assert.strictEqual(Core.norm(s.header[s.cols.amount]), 'total amount(inc.vat) in gbp');
  assert.strictEqual(s.header[s.cols.service], 'Fee Type as per rate card');
  assert.strictEqual(s.cols.ceco, -1);
  assert.strictEqual(s.data.length, 2);
});

test('K2 / Retrieved MX15 reales: columnas y validación con CeCos en más de una sociedad', () => {
  const H = ['Assignee Name', 'HRBP', 'Home Function', 'CeCo', 'K2 Number', 'Invoice Number', 'Regional Manager', 'GMSP Contact', 'Host Region', 'Home Region', 'Success Factors ID',
    'Host Entity Name', 'Company Code', 'Home Entity Name', 'Assignment Type', 'Description', 'BAT Product Category', 'Net Amount (GBP)', 'Tax Amount (GBP)', 'Gross Amount (GBP)', 'Type of Charge', 'Category'];
  const r = (n, h, f, c, g) => [n, h, f, c, 'K2-1', 'SI1', 'RM', 'GC', 'LATAM', 'LATAM', 'SF1', 'Host', 'MX15', 'Home', 'LTA', 'Airport Transfer', 'Moving', g * 0.8, g * 0.2, g, 'Non-PO', 'K2'];
  const wb = book({ MX15: [H, r('Persona Uno', 'HRBP Uno', 'Finance', 'AKSB0X0X01', 180), r('Persona Dos', 'HRBP Dos', 'HR', 'XXDUAL01', 50)] });
  const s = RC.detectSupplier(Core.sheetRows(wb.Sheets.MX15));
  assert.deepStrictEqual([s.cols.name, s.cols.hrbp, s.cols.func, s.cols.ceco, s.cols.amount, s.cols.service], [0, 1, 2, 3, 19, 15]);
  // All CeCos: columna G = Cost Center From, B = Company Code; un CeCo dado de alta en dos sociedades
  const C = [['No', 'Company Code', 'Approval Level', 'User Mapping Object ID', 'Counter', 'Expense Type', 'Cost Center From', 'Cost Center To', 'WBS Element From', 'WBS Element To', 'G/L account From', 'G/L account To'],
    [1, 'MX15', '002 - Approval Level 1', 'USR', '1', 'ST', 'AKSB0X0X01', '', '', '', '', ''], [2, 'MX20', '002', 'USR', '1', 'ST', 'XXDUAL01', '', '', '', '', ''], [3, 'MX15', '002', 'USR', '1', 'ST', 'XXDUAL01', '', '', '', '', '']];
  const cat = RC.readCecos(C);
  assert.deepStrictEqual([cat.cecoCol, cat.socCol], [6, 1]);
  assert.strictEqual(cat.map.XXDUAL01, 'MX20/MX15');
  assert.strictEqual(RC.validateCeco('XXDUAL01', cat, 'MX15').status, 'OK');
  assert.strictEqual(RC.validateCeco('AKSB0X0X01', cat, 'MX15').status, 'OK');
});

test('Histórico K2 real: nombre en columna sin título y función en Area2', () => {
  const rows = [[' ', 'Gross Amount (GBP)', 'Ceco', 'Tipo', 'Servicio', 'ExRate', 'Gross-Amount MXN', 'Mes', 'Year', 'Area', 'Area2'],
    ['Lopez Diaz, Ana', 100, 'MXCB2H2011', 'K2', 'Tax return', 23, 2300, 5, 2026, '1', 'Finance']];
  const src = RC.readSource(rows, 'H');
  assert.strictEqual(src[0].name, 'Lopez Diaz, Ana');
  assert.strictEqual(src[0].func, 'Finance');
  assert.strictEqual(src[0].ceco, 'MXCB2H2011');
});

test('Reclasificación por CeCo: mismo acomodo que la real y Bulk lee Tipo / Mes del archivo', async () => {
  const res = { ok: [{ ceco: 'MXCB8D0045', mxn: 1000, gbp: 43 }], excluded: [] };
  const wb = await RC.buildReclassWorkbook(res, { provider: 'Deloitte', month: 8, year: 2026, sociedad: 'MX15', exRate: 23.2, sourceCeco: 'MXLB0X0X01   GM IA Recharge' });
  const buf = new Uint8Array(await wb.xlsx.writeBuffer());
  const x = XLSX.read(buf, { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(x.Sheets['Reclasificacion por CeCo'], { header: 1, defval: null, range: 0 });
  const find = (k) => rows.find((r) => r && r[0] === k);
  assert.strictEqual(find('Tipo')[1], 'Deloitte');
  assert.strictEqual(find('Mes')[1], 8);
  assert.deepStrictEqual(find('Row Labels').slice(0, 2), ['Row Labels', 'Sum of Gross-Amount MXN']);
  // Bulk: aunque la carpeta no diga el proveedor, lo toma del filtro "Tipo"
  const rec = B.processFile({ path: '2026/Varios/06. Reclasificación por Ceco.xlsx', size: buf.length, data: buf }, { year: 2026 });
  assert.strictEqual(rec.type, 'reclass');
  assert.deepStrictEqual([rec.ctx.provider, rec.ctx.month], ['Deloitte', 8]);
  assert.strictEqual(rec.data.rows[0].ceco, 'MXCB8D0045');
});

test('Listado de Recharges real: ignora Trackers (incluido uno oculto) y tablas dinámicas', () => {
  const L = ['Status', 'Key', 'Payroll Num.', 'Name', 'Column1', 'Mark up', 'Recharge Detail', 'HRBP Host Market', 'Area', 'HRBP', 'Grade ', 'Host Country', 'Tipo Asignación', 'CeCo',
    'Estimate B. CeCo', 'This excel Inicio', 'This excel Termino', 'Estimate B. Inicio 2', 'Estimate B. Termino', 'Currency', 'Estimate B. Currency', 'IC CODE', 'Estimate B. IC CODE', 'Coder',
    'Estimate B. Coder', 'Coder email', 'Estimate B. Coder Email'];
  const a = (k, n, host) => [null, k, '9000000' + k, n, null, 0, 'Recharge', 'HRBP Host', 'Marketing', 'HRBP Home', 37, host, 'LTA', 'MXCB0E1B07', 'MXCB0E1B07', 'Julio', 'Dic', null, null,
    'USD', 'USD', 'IC-00-CO14', 'IC-00-CO14', 'Coder Ficticio', 'Coder Ficticio', 'coder@example.com', 'coder@example.com'];
  const T = ['Status', 'Key', 'Name', 'Costo Total', 'Area', 'Country', 'Webi', 'Webi Upload \r\nmm/dd/yyyy', 'Webi Approval\r\nmm/dd/yyyy', 'SE Approver', 'Coder', 'RE Approver', 'PO', 'JVU',
    'JVU Approval\r\nmm/dd/yyyy', 'Status JVU', 'Accrual', 'Contabilidad', 'Comment', 'Registered in SAP'];
  const t = (st, k, n, webi, po, jvu, sj, reg) => [st, k, n, 1000, 'MKT', 'Colombia', webi, '06/10/26', '06/12/26', 'SE Ficticio', 'Coder Ficticio', 'RE Ficticio', po, jvu, '07/01/26', sj, null, null, 'ok', reg];
  const wb = book({
    'Tracker Colombia': [T, t('Complete', 1, 'Perez Lopez Juan', '50001', 'RRBP.MX15CO14/1', '1800001', 'Approved', 'Done')],
    Tracker: [T, t('Complete', 1, 'Perez Lopez Juan', '50001', 'RRBP.MX15CO14/1', '1800001', 'Approved', 'Done'), t('Rejected-Reuploaded', 2, 'Garcia Ruiz Ana', '50002', 'RRBP.MX15GB51/2', null, 'NA', 'N/A'),
      [null, null, null], ['Row Labels', null, 'Total'], ['Colombia', null, null, 1000], ['Grand Total', null, null, 1000]],
    'Listado Recharges H2 2025': [L, a(1, 'Perez Lopez Juan', 'Colombia'), a(3, 'Diaz Soto Luis', 'Germany'), [null, null, null, 'Total']]
  }, ['Tracker Colombia']);
  const res = R.readAssignments(wb);
  assert.deepStrictEqual(res.sheets.map((s) => s.sheet), ['Listado Recharges H2 2025']);
  assert.strictEqual(res.assignments.length, 2);
  const p = res.assignments[0];
  assert.deepStrictEqual([p.host, p.ic, p.coderEmail, p.currency, p.hrbp, p.hasta], ['Colombia', 'IC-00-CO14', 'coder@example.com', 'USD', 'HRBP Home', 'Dic']);
  // Su Tracker (no el oculto) se usa como "Tracker anterior"
  const prev = R.readPreviousTracker(wb);
  assert.strictEqual(prev.sheet, 'Tracker');
  assert.strictEqual(prev.rows.length, 2);
  assert.deepStrictEqual([prev.rows[0].rid, prev.rows[0].ap1, prev.rows[0].ap3, prev.rows[0].batch, prev.rows[0].fbl], ['50001', 'SE Ficticio', 'RE Ficticio', 'Approved', 'Done']);
  assert.strictEqual(R.nextStep(prev.rows[0]), '✔ Terminado');
  assert.strictEqual(R.nextStep(prev.rows[1]), 'Generar y cargar JVU (mismo día)'); // "NA" / "N/A" no cuentan como hecho
  const m = R.mergeTracker(res.assignments, prev.rows);
  assert.deepStrictEqual(m.stats, { kept: 1, nuevos: 1, soloAnterior: 1 });
});

test('Maestro de HC real: usa la columna Entidad y lee la tabla GRUPO / ENTIDAD', () => {
  const H = ['Categoria', 'Grupo', 'Country', 'Entidad', 'Entidad2', 'Sub-funtion', 'Function', 'Local / IA', 'Grado', 'Orden grado', 'Type', 'Grade Group', 'Orden grado group', 'Orden categoría',
    "2.3 - COPLAN'26", "SOP6'26", "SOP9'26", "COPLAN'27", null, 'GRUPO', 'ENTIDAD'];
  const wb = book({
    'HC_YTD (Grade) (HC Tool Approv)': [H, ['BHI', 'CAR', 'JAM', 'Jamaica', 'EXEC & SERVICES', 'x', 'EXEC', 'Local', 'Grade 35', 1, 'X', 'Mgrs', 1, 1, 1, 1, 1, 1, null, 'GUY', 'Guyana'],
      ['BHI', 'CAR', 'T&T OPS', 'Trinidad Operación', 'OPS', 'x', 'OPS', 'Local', 'Grade 30', 2, 'X', '30', 2, 2, 2, 2, 3, 3, null, 'T&T OPS', 'Trinidad Operación']],
    'For Filters': [['HR INPUT', null, null, 'HC APROBADO'], ['Home Function', 'Function', null, 'Home Function', 'Function'], ['Marketing', 'MKT ', null, 'EXEC & SERVICES', 'EXEC']]
  });
  const app = HC.autoApproved(wb, {}, "SOP9'26", "COPLAN'27");
  const hd = Core.headerLabels(app.rows[0]);
  assert.deepStrictEqual([hd[app.cols.grade], hd[app.cols.func], hd[app.cols.entity], hd[app.cols.sop], hd[app.cols.coplan]], ['Grado', 'Function', 'Entidad', "SOP9'26", "COPLAN'27"]);
  const eq = HC.readEquivalences(wb);
  assert.strictEqual(eq.entityMapApp['T&T OPS'], 'Trinidad Operación');
  assert.strictEqual(eq.funcMapBPC.Marketing, 'MKT'); // se quita el espacio sobrante del catálogo
  // Los valores que ya son nombres cortos (EXEC, OPS) no generan alertas de "sin equivalencia"
  const al = HC.alerts([{ func: 'Marketing', funcShort: 'MKT', entity: 'Jamaica', entityCode: 'X', total: 1, fteNum: 1, startSerial: 1, endSerial: 1, grade: 'Grade 35' }],
    [{ funcRaw: 'EXEC', funcShort: 'EXEC', entityRaw: 'Jamaica', entity: 'Jamaica' }], { multiEntity: true, funcMapBPC: eq.funcMapBPC, funcMapApp: eq.funcMapApp, entityMapBPC: { X: 'Jamaica' }, entityMapApp: eq.entityMapApp });
  assert.ok(!al.some((a) => /sin equivalencia \(Aprobado\)/.test(a.tipo)));
  assert.ok(!al.some((a) => /Entidad del Aprobado/.test(a.tipo)));
});

test('Bulk: nombres reales con guiones bajos y patrón "16. Nombre H1 2026"', () => {
  const a = B.pathContext('2026/x/2._Webi_Ramos_Vega_Pedro_Antonio.txt');
  assert.deepStrictEqual([a.key, a.docKind, a.employee], ['2', 'Webi', 'Ramos Vega Pedro Antonio']);
  const b = B.pathContext('2026/x/16._Soto_Ruiz_Laura_Elena_H1_2026.xlsx');
  assert.deepStrictEqual([b.key, b.employee, b.half], ['16', 'Soto Ruiz Laura Elena', 'H1']);
});
