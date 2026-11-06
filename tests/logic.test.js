'use strict';
const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const Core = require('../src/js/core.js');
const HC = require('../src/js/hc.js');
const R = require('../src/js/recharges.js');
const RC = require('../src/js/reclass.js');
const F = require('./fixtures.js');

const roundtrip = (wb) => XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellNF: true, cellText: true });
const one = (ws) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'S'); return roundtrip(wb); };

test('core: fechas y números', () => {
  assert.strictEqual(Core.fmtDate(Core.parseDate('31.12.2026')), '31/12/2026');
  assert.strictEqual(Core.fmtDate(Core.parseDate('2026-01-01')), '01/01/2026');
  assert.strictEqual(Core.fmtDate(Core.parseDate('20260812')), '12/08/2026');
  assert.strictEqual(Core.fmtDate(Core.parseDate('12/31/2026')), '31/12/2026');
  assert.strictEqual(Core.fmtDate(Core.parseDate(46022)), '31/12/2025');
  assert.strictEqual(Core.parseNum('1,234.50'), 1234.5);
  assert.strictEqual(Core.parseNum('1.234,50'), 1234.5);
  assert.strictEqual(Core.parseNum('(37,332.43)'), -37332.43);
  assert.strictEqual(Core.parseNum('100%'), 1);
  assert.ok(Core.nameScore('Juan Carlos Perez Lopez', 'Perez Lopez, Juan Carlos') === 1);
  assert.ok(Core.nameScore('Ana Garcia', 'Pedro Garcia') < 0.6);
});

test('core: TXT tabulado en Windows-1252 sin filas vacías', () => {
  const grid = Core.cleanGrid([['a', 'b', ''], ['', '', ''], ['ñ', 'é', ''], [null, null, null]]);
  assert.deepStrictEqual(grid, [['a', 'b'], ['ñ', 'é']]);
  const bytes = Core.encodeCP1252(Core.toTabText(grid));
  assert.deepStrictEqual(Array.from(bytes), [97, 9, 98, 13, 10, 0xF1, 9, 0xE9, 13, 10]);
});

function hcConfig(over) {
  const master = roundtrip(F.masterWorkbook());
  const ff = Core.sheetRows(master.Sheets['For Filters']);
  const funcMapBPC = {}, funcMapApp = {};
  ff.slice(2).forEach((r) => { if (r[0]) funcMapBPC[r[0]] = r[1]; if (r[3]) funcMapApp[r[3]] = r[4]; });
  const ent = Core.sheetRows(master.Sheets['Entidades']);
  const entityMapBPC = {};
  ent.slice(1).forEach((r) => { entityMapBPC[r[0]] = r[2]; });
  return Object.assign({
    market: 'CAR', sopLabel: "SOP9'26", coplanLabel: "COPLAN'27", cutoffs: HC.defaultCutoffs(2026), multiEntity: true, splitMarketing: false,
    funcMapBPC, funcMapApp, entityMapBPC, entityMapApp: { GY: 'Guyana', JM: 'Jamaica', TT: 'Trinidad Comercial', TTO: 'Trinidad Operación' }, gradeGroupMax: null
  }, over || {});
}
function approvedInput() {
  const master = roundtrip(F.masterWorkbook());
  const rows = Core.sheetRows(master.Sheets['HC_YTD (Grade) (HC Tool Approv)']);
  const cols = HC.guessApprovedColumns(rows[0]);
  return { rows, headerIdx: 0, cols };
}

test('HC: lee el HR Input (encabezado en H33) y aplica la regla de conteo', () => {
  const rows = Core.sheetRows(one(F.hrInput()).Sheets.S);
  const cfg = hcConfig();
  const res = HC.run(rows, approvedInput(), cfg);
  assert.strictEqual(res.parsed.headerCell, 'H33');
  assert.strictEqual(res.positions.length, 12);
  const ap = approvedInput();
  assert.deepStrictEqual([ap.cols.grade, ap.cols.func, ap.cols.entity, ap.cols.sop, ap.cols.coplan], [3, 2, 1, 6, 7]);
  const p = res.positions;
  assert.strictEqual(p[0].countSOP, 1); // vigente
  assert.strictEqual(p[3].countSOP, 0); // termina en junio
  assert.match(p[3].reasonSOP, /Termina antes/);
  assert.strictEqual(p[5].total, 0); // FTE 50%
  assert.strictEqual(p[6].countSOP, 0); // inicia 2027
  assert.strictEqual(p[6].countCOPLAN, 1);
  assert.strictEqual(p[7].countSOP, 2); // multiplicador 2
  assert.strictEqual(p[10].countSOP, 0); // sin fecha fin
  assert.strictEqual(p[10].reasonSOP, 'Sin fecha de fin');
  assert.strictEqual(p[0].entity, 'Guyana');
  assert.strictEqual(p[0].funcShort, 'FIN');
  assert.strictEqual(p[11].entity, 'ZZC00L_ZZ10'); // sin equivalencia
  assert.ok(res.alerts.some((a) => a.tipo === 'Unidad BPC sin entidad'));
  assert.ok(res.alerts.some((a) => a.tipo === 'Posiciones sin fecha de fin'));
});

test('HC: comparación por grado, semáforo por grado y filtros', () => {
  const rows = Core.sheetRows(one(F.hrInput()).Sheets.S);
  const cfg = hcConfig();
  const res = HC.run(rows, approvedInput(), cfg);
  const all = res.overall;
  const g = (k) => all.rows.find((r) => r.grade === k);
  assert.strictEqual(g('Grade 31').bpcSOP, 1); // solo el Field cuenta
  assert.strictEqual(g('Grade 31').appSOP, 2);
  assert.strictEqual(g('Grade 31').diffSOP, -1);
  assert.strictEqual(g('Grade 34').bpcSOP, 1);
  assert.strictEqual(g('Grade 36').bpcSOP, 2);
  assert.strictEqual(all.statusSOP.ok, false);
  const gy = HC.compare(res.positions, res.approved, { entity: 'Guyana' });
  assert.strictEqual(gy.total.bpcSOP, 3);
  assert.strictEqual(gy.total.appSOP, 4);
  const tto = HC.compare(res.positions, res.approved, { entity: 'Trinidad Operación' });
  assert.strictEqual(tto.total.bpcSOP, 1);
  assert.strictEqual(tto.total.appSOP, 2);
  // Agrupación de grados
  const res2 = HC.run(rows, approvedInput(), hcConfig({ gradeGroupMax: 30 }));
  assert.ok(res2.overall.rows.some((r) => r.grade === 'Grade 30 and below'));
});

test('HC: compensación de diferencias no se marca como alineado', () => {
  const pos = [{ grade: 'Grade 33', countSOP: 4, countCOPLAN: 0, entity: 'T', funcShort: 'F' }, { grade: 'Grade 32', countSOP: 0, countCOPLAN: 0, entity: 'T', funcShort: 'F' }];
  const app = [{ grade: 'Grade 33', sop: 1, coplan: 0, entity: 'T', funcShort: 'F' }, { grade: 'Grade 32', sop: 3, coplan: 0, entity: 'T', funcShort: 'F' }];
  const c = HC.compare(pos, app, {});
  assert.strictEqual(c.total.diffSOP, 0);
  assert.strictEqual(c.statusSOP.ok, false);
  assert.match(c.statusSOP.detail, /se compensan/);
});

test('HC: genera el reporte de Excel', async () => {
  const rows = Core.sheetRows(one(F.hrInput()).Sheets.S);
  const cfg = hcConfig();
  const res = HC.run(rows, approvedInput(), cfg);
  const wb = await HC.buildReport(res, cfg, {});
  const buf = await wb.xlsx.writeBuffer();
  const back = XLSX.read(buf, { type: 'buffer' });
  assert.deepStrictEqual(back.SheetNames, ['Resumen', 'Detalle por función', 'Resumen por función', 'Posiciones BPC', 'HC Aprobado', 'Alertas y parámetros']);
});

test('HC: variante Colombia separa Marketing Field/Office', () => {
  const rows = Core.sheetRows(one(F.hrInput()).Sheets.S);
  const res = HC.run(rows, null, hcConfig({ splitMarketing: true, multiEntity: false, funcMapBPC: {} }));
  assert.strictEqual(res.positions[2].func, 'Marketing Field');
  assert.strictEqual(res.positions[3].func, 'Marketing Office');
});

test('Recobros: lee asignaciones de varias hojas y arma el Tracker', async () => {
  const wb = roundtrip(F.assignmentsWorkbook());
  const { assignments } = R.readAssignments(wb);
  assert.strictEqual(assignments.length, 4);
  assert.strictEqual(assignments[0].area, 'OPERACIONES');
  assert.strictEqual(assignments[3].area, 'MARKETING');
  assert.strictEqual(assignments[0].key, '1');
  assert.strictEqual(R.noteTitle(assignments[0], 'H2', 2026), "Recharge H2'26 Perez J.");
  assert.strictEqual(R.noteTitle(assignments[3], 'H2', 2026), "Recharge H2'26 Martinez L.");
  assert.strictEqual(R.seCompanyCode('MX15'), 'IC-00-MX15');
  const tr = await R.buildTracker(assignments, { half: 'H2', year: 2026, oneId: '12345678' });
  const back = XLSX.read(await tr.xlsx.writeBuffer(), { type: 'buffer' });
  assert.ok(back.SheetNames.includes('Resumen por área'));
  const miss = Core.sheetRows(back.Sheets['Datos faltantes']);
  assert.ok(miss.some((r) => r && r[1] === 'Lopez Diaz Maria Fernanda'));
});

test('Recobros: formatos SAP desde Estimate Benefits → ZIP con TXT y nomenclatura', async () => {
  const today = Core.serialToYMD(Core.todaySerial());
  const ds = String(today.y) + Core.pad(today.m) + Core.pad(today.d);
  const buf = XLSX.write(F.estimateBenefits(ds), { type: 'buffer', bookType: 'xlsx' });
  const wb = XLSX.read(buf, { type: 'buffer', cellNF: true, cellText: true });
  const pr = await R.processWorkbook({ name: 'Estimate Benefits.xlsx', buffer: buf, wb });
  assert.deepStrictEqual(pr.items.map((i) => i.kind), ['SC', 'Webi', 'JVU', 'Accrual']);
  assert.strictEqual(pr.ctx.key, '1');
  assert.strictEqual(pr.ctx.nombre, 'Perez Lopez Juan Carlos');
  assert.strictEqual(pr.ctx.tipo, 'Recharge');
  const webi = pr.items.find((i) => i.kind === 'Webi');
  assert.strictEqual(webi.grid.length, 4); // sin filas vacías
  assert.strictEqual(webi.analysis.total, 22586.23);
  const jvu = pr.items.find((i) => i.kind === 'JVU');
  assert.strictEqual(jvu.analysis.credit, 22586.23);
  assert.strictEqual(jvu.analysis.debit, 22586.23);
  assert.strictEqual(jvu.analysis.warnings.length, 0);
  const { blob, log } = await R.buildZip([pr], { half: 'H2', year: 2026 });
  assert.ok(log.every((l) => l.ok));
  const zip = await JSZip.loadAsync(blob);
  const names = Object.keys(zip.files).filter((n) => !n.endsWith('/')).sort();
  assert.deepStrictEqual(names, [
    'Recharges/H2\'26/Accruals/1. Perez Lopez Juan Carlos/1. Accrual Perez Lopez Juan Carlos.txt',
    'Recharges/H2\'26/Accruals/1. Perez Lopez Juan Carlos/1. Accrual Perez Lopez Juan Carlos.xlsx',
    'Recharges/H2\'26/JVUs/1. Perez Lopez Juan Carlos/1. JVU Perez Lopez Juan Carlos.txt',
    'Recharges/H2\'26/JVUs/1. Perez Lopez Juan Carlos/1. JVU Perez Lopez Juan Carlos.xlsx',
    'Recharges/H2\'26/Webis/1. Perez Lopez Juan Carlos/1. SC Perez Lopez Juan Carlos.xlsx',
    'Recharges/H2\'26/Webis/1. Perez Lopez Juan Carlos/1. Webi Perez Lopez Juan Carlos.txt',
    'Recharges/H2\'26/Webis/1. Perez Lopez Juan Carlos/1. Webi Perez Lopez Juan Carlos.xlsx'
  ]);
  const txt = await zip.file('Recharges/H2\'26/Webis/1. Perez Lopez Juan Carlos/1. Webi Perez Lopez Juan Carlos.txt').async('string');
  const lines = txt.split('\r\n');
  assert.strictEqual(lines.length, 5); // 4 líneas + final vacío
  assert.strictEqual(lines[1].split('\t')[2], '9057.03');
  // El xlsx copiado conserva los valores
  const x = XLSX.read(await zip.file('Recharges/H2\'26/JVUs/1. Perez Lopez Juan Carlos/1. JVU Perez Lopez Juan Carlos.xlsx').async('nodebuffer'));
  assert.strictEqual(Core.sheetRows(x.Sheets[x.SheetNames[0]])[5][6], 9057.03);
});

test('Recobros: avisa si el JVU no es de hoy', async () => {
  const buf = XLSX.write(F.estimateBenefits('20200101'), { type: 'buffer', bookType: 'xlsx' });
  const wb = XLSX.read(buf, { type: 'buffer' });
  const pr = await R.processWorkbook({ name: 'x.xlsx', buffer: buf, wb });
  assert.ok(pr.items.find((i) => i.kind === 'JVU').analysis.warnings.some((w) => /mismo día/.test(w)));
  assert.strictEqual(pr.items.find((i) => i.kind === 'Webi').analysis.warnings.length, 0);
});

test('Reclasificación: completa desde histórico, valida MX15 y arma la reclasificación', async () => {
  const sup = RC.detectSupplier(Core.sheetRows(one(F.supplierK2()).Sheets.S));
  assert.strictEqual(sup.cols.name, 0);
  assert.strictEqual(sup.cols.amount, 6);
  assert.strictEqual(sup.cols.service, 5);
  const cons = roundtrip(F.consolidado());
  const hist = RC.readSource(Core.sheetRows(cons.Sheets[cons.SheetNames[0]]), 'Histórico');
  const en = RC.enrich(sup, hist, []);
  assert.strictEqual(en[0].ceco, 'MXCB2H2011'); // el más reciente (mes 5)
  assert.strictEqual(en[0].hrbp, 'Laura Mendez Ruiz');
  assert.strictEqual(en[1].func, 'Exec & Corp Services');
  assert.strictEqual(en[3].ceco, ''); // sin histórico
  const cecos = RC.readCecos(Core.sheetRows(one(F.allCecos()).Sheets.S));
  assert.strictEqual(cecos.map.MXCB2H2011, 'MX15');
  assert.strictEqual(RC.validateCeco('MXMA1D3H33', cecos, 'MX15').status, 'OTRA_SOC');
  assert.strictEqual(RC.validateCeco('XXXX', cecos, 'MX15').status, 'NO_EXISTE');
  const sent = await RC.buildSentToHRBP(sup, en, { sociedad: 'MX15' });
  const sb = XLSX.read(await sent.xlsx.writeBuffer(), { type: 'buffer' });
  const sr = Core.sheetRows(sb.Sheets.MX15);
  assert.deepStrictEqual(sr[0].slice(0, 5), ['Assignee Name', 'HRBP', 'Home Function', 'CeCo', 'K2 Number']);
  const ks = RC.readKSB1(Core.sheetRows(one(F.ksb1()).Sheets.S));
  assert.strictEqual(ks.length, 3);
  const rate = RC.exRateFrom([ks[0]]);
  assert.ok(Math.abs(rate - 23.1) < 0.01);
  const res = RC.buildHistoricRows(sup, en, cecos, { provider: 'K2', month: 6, year: 2026, exRate: rate, sociedad: 'MX15' });
  assert.strictEqual(res.ok.length, 2);
  assert.strictEqual(res.excluded.length, 2); // MX10 + sin CeCo
  const piv = RC.pivotByCeco(res.ok);
  assert.strictEqual(piv.length, 2);
  const wb = await RC.buildReclassWorkbook(res, { provider: 'K2', month: 6, year: 2026, exRate: rate, sociedad: 'MX15' });
  const back = XLSX.read(await wb.xlsx.writeBuffer(), { type: 'buffer' });
  assert.deepStrictEqual(back.SheetNames, ['Reclasificacion por CeCo', 'Detalle', 'Excluidos']);
});

test('Reclasificación: checklist de evidencia', () => {
  const items = RC.evidenceChecklist(['01. K2 costs - Non-PO billing MX15 — June 2026.msg', '02. K2 MX15.xlsx', '03. Sent to HRBPs - MX15 K2.xlsx', 'RE_ K2 Expats Junio MX15.msg'], 'K2', 'MX15');
  assert.deepStrictEqual(items.map((i) => i.ok), [true, true, true, false, true, false]);
});

test('Correo: .eml como borrador con adjunto', () => {
  const eml = Core.buildEml({ to: 'a@x.com; b@x.com', cc: 'c@x.com', subject: 'K2 Expats Junio MX15', text: 'Hola\n\nLínea', attachments: [{ name: 'Sent to HRBPs - MX15 K2.xlsx', data: new Uint8Array([80, 75, 3, 4]), type: Core.XLSX_MIME }] });
  assert.match(eml, /^X-Unsent: 1/);
  assert.match(eml, /To: a@x.com, b@x.com/);
  assert.match(eml, /Cc: c@x.com/);
  assert.match(eml, /filename="Sent to HRBPs - MX15 K2.xlsx"/);
  assert.match(eml, /UEsDBA==/); // base64 del adjunto
});

test('Tracker: conserva lo capturado, agrega nuevos y marca los que ya no vienen', async () => {
  const wb = roundtrip(F.assignmentsWorkbook());
  const { assignments } = R.readAssignments(wb);
  // Tracker "anterior" con datos capturados a mano
  const first = R.mergeTracker(assignments, []);
  first.assignments[0].manual = { rid: '000002052572', ap1: 'Coder Uno', estatus: 'En aprobación (1/3)' };
  first.assignments[1].manual = { rid: '000002052573', po: 'RRBP.MX15GB51/6001116082', jvu: '1234', estatus: 'JVU cargado' };
  const trWb = await R.buildTracker(first.assignments, { half: 'H2', year: 2026 });
  const prevBook = XLSX.read(await trWb.xlsx.writeBuffer(), { type: 'buffer' });
  const prev = R.readPreviousTracker(prevBook);
  assert.strictEqual(prev.rows.length, 4);
  assert.strictEqual(prev.rows[0].rid, '000002052572');
  // Lista nueva: se va Garcia Ruiz Ana, entra una persona nueva, y cambia el orden
  const nueva = [assignments[3], assignments[0], assignments[2], { nombre: 'Nueva Persona Ejemplo', payroll: '90000009', host: 'Brasil', key: '1', _autoKey: true }];
  nueva[1] = Object.assign({}, nueva[1], { key: '2', _autoKey: true }); // el KEY automático cambiaría por el orden
  const m = R.mergeTracker(nueva, prev.rows);
  assert.deepStrictEqual(m.stats, { kept: 3, nuevos: 1, soloAnterior: 1 });
  const perez = m.assignments.find((a) => a.nombre === 'Perez Lopez Juan Carlos');
  assert.strictEqual(perez.key, '1'); // conserva su KEY
  assert.strictEqual(perez.manual.rid, '000002052572');
  assert.strictEqual(perez.manual.ap1, 'Coder Uno');
  const nuevo = m.assignments.find((a) => a.nombre === 'Nueva Persona Ejemplo');
  assert.ok(nuevo._new && !['1', '3', '4', '2'].includes(nuevo.key));
  const ida = m.assignments.find((a) => a.nombre === 'Garcia Ruiz Ana');
  assert.ok(ida._onlyPrev && /No viene/.test(ida.manual.com));
  assert.strictEqual(R.nextStep(Object.assign({}, ida.manual)), 'Esperar BATCH ID');
  assert.strictEqual(R.nextStep({}), 'Crear y cargar Webi');
  assert.strictEqual(R.nextStep({ rid: '1' }), 'Seguir aprobaciones (RRB PO Dashboard)');
  assert.strictEqual(R.nextStep({ rid: '1', po: 'x' }), 'Generar y cargar JVU (mismo día)');
  assert.strictEqual(R.nextStep({ rid: '1', po: 'x', jvu: 'j', batch: 'b' }), 'Validar en FBL5N');
  assert.strictEqual(R.nextStep({ fbl: 'OK' }), '✔ Terminado');
  // Regenerar no duplica la marca "[No viene…]"
  const again = R.readPreviousTracker(XLSX.read(await (await R.buildTracker(m.assignments, { half: 'H2', year: 2026 })).xlsx.writeBuffer(), { type: 'buffer' }));
  const ida2 = again.rows.find((r) => r.nombre === 'Garcia Ruiz Ana');
  assert.ok(!/^\[No viene/.test(ida2.com));
});

test('HC: detecta el mercado, toma columnas solas y compara contra la corrida anterior', async () => {
  const rows = Core.sheetRows(one(F.hrInput()).Sheets.S);
  const parsed = HC.parseHRInput(rows);
  assert.strictEqual(HC.detectMarket(parsed), 'CAR');
  assert.strictEqual(HC.marketOfUnit('MXO02L_X'), 'México Operaciones');
  assert.strictEqual(HC.marketOfUnit('C00MVE'), 'Venezuela');
  assert.strictEqual(HC.marketOfUnit('CTC03L_PA13'), 'CAM');
  assert.strictEqual(HC.detectMarketFromName('HC in BPC vs HC Approved - Mexico Operaciones.xlsm'), 'México Operaciones');
  const master = roundtrip(F.masterWorkbook());
  const eq = HC.readEquivalences(master);
  assert.strictEqual(eq.funcMapBPC.Finance, 'FIN');
  assert.strictEqual(eq.entityMapBPC.GYC00L_GY10, 'Guyana');
  const app = HC.autoApproved(master, {}, "COPLAN'26", "COPLAN'27");
  assert.strictEqual(app.cols.coplan, 7);
  const app2 = HC.autoApproved(master, {}, "SOP9'26", "COPLAN'27");
  assert.strictEqual(app2.cols.sop, 6);
  const cfg = hcConfig();
  const res1 = HC.run(rows, app2, cfg);
  const snap = HC.snapshot(res1, cfg);
  // Segunda corrida: se corrigió la posición de Marketing que terminaba en junio
  const rows2 = rows.map((r) => (r ? r.slice() : r));
  rows2[36][30] = F.d(9999, 12, 31);
  const res2 = HC.run(rows2, app2, cfg);
  const ch = HC.changes(res2, snap);
  const g31 = ch.rows.find((r) => r.grade === 'Grade 31');
  assert.strictEqual(g31.chSOP, '✔ Corregido');
  assert.strictEqual(ch.fixed, 1);
  const wb = await HC.buildReport(res2, cfg, {}, ch);
  assert.ok(wb.worksheets.some((w) => w.name === 'Cambios vs anterior'));
  const batch = await HC.buildBatchReport([{ market: 'CAR', res: res2, changes: ch }, { market: 'Colombia', res: res1 }], cfg);
  assert.deepStrictEqual(batch.worksheets.map((w) => w.name), ['Resumen mercados', 'CAR', 'Colombia', 'Alertas']);
  const mail = HC.emailText(res2, cfg, { entity: 'Guyana' });
  assert.match(mail.subject, /CAR \(Guyana\)/);
});

test('Reclasificación: correo para Planning y ruta de la carpeta del proveedor', () => {
  const res = { ok: [{ ceco: 'MXCB2H2011', mxn: 1000, gbp: 43.3 }, { ceco: 'MXCB8D0045', mxn: 500.5, gbp: 21.7 }] };
  const m = RC.emailReclass(res, { provider: 'K2', month: 6, year: 2026, sociedad: 'MX15', exRate: 23.1 });
  assert.match(m.subject, /K2 Junio 2026 MX15/);
  assert.match(m.body, /1,500\.50/);
  assert.strictEqual(RC.supplierRelPath(6, 'K2'), 'Suppliers/06. Junio/K2');
});

test('Bulk: reconoce archivos de todo el año y arma el consolidado con alertas', async () => {
  const B = require('../src/js/bulk.js');
  const xbuf = (wb) => new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  const oneWb = (ws, name) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, name || 'Sheet1'); return wb; };
  const files = [];
  const add = (path, data) => files.push({ path, size: data.length, lastModified: Date.UTC(2026, 5, 1), data });
  // Proveedor junio (completo salvo Reclasificación) y julio (solo el reporte)
  add('2026/Tracker/Suppliers/06. Junio/K2/K2 MX15.xlsx', xbuf(oneWb(F.supplierK2(), 'MX15')));
  const sup = RC.detectSupplier(Core.sheetRows(one(F.supplierK2()).Sheets.S));
  const cons = roundtrip(F.consolidado());
  const en = RC.enrich(sup, RC.readSource(Core.sheetRows(cons.Sheets[cons.SheetNames[0]]), 'H'), []);
  const sentWb = await RC.buildSentToHRBP(sup, en, { sociedad: 'MX15' });
  const sentBuf = new Uint8Array(await sentWb.xlsx.writeBuffer());
  add('2026/Tracker/Suppliers/06. Junio/K2/Sent to HRBPs - MX15 K2.xlsx', sentBuf);
  add('2026/Tracker/Suppliers/06. Junio/K2/Retrieved From HRBPs - MX15 K2.xlsx', sentBuf);
  add('2026/Tracker/Suppliers/06. Junio/K2/K2 costs - Non-PO billing MX15 — June 2026.msg', new Uint8Array(F.msgFile('K2 costs - Non-PO billing MX15 — June 2026', 'Global Mobility', Date.UTC(2026, 5, 24, 13), ['K2 MX15.xlsx'])));
  add('2026/Tracker/Suppliers/07. Julio/K2/K2 MX15.xlsx', xbuf(oneWb(F.supplierK2(), 'MX15')));
  // Recobros generados por la app
  const today = Core.serialToYMD(Core.todaySerial());
  const ebBuf = XLSX.write(F.estimateBenefits(String(today.y) + Core.pad(today.m) + Core.pad(today.d)), { type: 'buffer', bookType: 'xlsx' });
  const pr = await R.processWorkbook({ name: 'EB.xlsx', buffer: ebBuf, wb: XLSX.read(ebBuf, { type: 'buffer' }) });
  const { files: rf } = await R.buildFiles([pr], { half: 'H2', year: 2026 });
  rf.filter((f) => !/Accrual/.test(f.path)).forEach((f) => add('2026/Tracker/' + f.path, f.data));
  // Webi sin JVU de otra persona
  add("2026/Tracker/Recharges/H2'26/Webis/2. Garcia Ruiz Ana/2. Webi Garcia Ruiz Ana.xlsx", rf.find((f) => /Webi .*xlsx$/.test(f.path)).data);
  // Catálogos y SAP (KSB1 repetido en dos descargas)
  add('2026/Tracker/All CeCos - Approvers.xlsx', xbuf(oneWb(F.allCecos())));
  add('2026/Tracker/Reportes SAP 2026 K2/06-24-2026 EXPORT.XLSX', xbuf(oneWb(F.ksb1())));
  add('2026/Tracker/Reportes SAP 2026 K2/06-29-2026 EXPORT.XLSX', xbuf(oneWb(F.ksb1())));
  add('2026/HC/HR Input CAR.xlsx', xbuf(oneWb(F.hrInput(), 'HR Input')));
  add('2026/Varios/Notas.pdf', new Uint8Array([37, 80, 68, 70]));
  add('2026/Varios/Basura.xlsx', new Uint8Array([1, 2, 3, 4, 5]));

  const recs = files.map((f) => B.processFile(f, { year: 2026 }));
  const type = (p) => recs.find((r) => r.path.endsWith(p)).type;
  assert.strictEqual(type('06. Junio/K2/K2 MX15.xlsx'), 'supplier');
  assert.strictEqual(type('Sent to HRBPs - MX15 K2.xlsx'), 'sent');
  assert.strictEqual(type('Retrieved From HRBPs - MX15 K2.xlsx'), 'retrieved');
  assert.strictEqual(type('June 2026.msg'), 'msg-global');
  assert.strictEqual(type('1. Webi Perez Lopez Juan Carlos.txt'), 'webi');
  assert.strictEqual(type('1. JVU Perez Lopez Juan Carlos.xlsx'), 'jvu');
  assert.strictEqual(type('1. SC Perez Lopez Juan Carlos.xlsx'), 'sc');
  assert.strictEqual(type('All CeCos - Approvers.xlsx'), 'cecos');
  assert.strictEqual(type('06-24-2026 EXPORT.XLSX'), 'ksb1');
  assert.strictEqual(type('HR Input CAR.xlsx'), 'hrinput');
  assert.strictEqual(type('Notas.pdf'), 'otro');
  const msg = recs.find((r) => r.type === 'msg-global').data;
  assert.strictEqual(msg.from, 'Global Mobility');
  assert.deepStrictEqual(msg.attachments, ['K2 MX15.xlsx']);
  assert.strictEqual(Core.fmtDate(msg.date), '24/06/2026');
  const ctx = recs.find((r) => r.path.endsWith('June 2026.msg')).ctx;
  assert.deepStrictEqual([ctx.month, ctx.provider], [6, 'K2']);

  const A = B.aggregate(recs, { sociedad: 'MX15' });
  const perez = A.recharges.find((e) => e.key === '1');
  assert.strictEqual(perez.jvu, 22586.23);
  assert.strictEqual(perez.webi, 22586.23);
  assert.strictEqual(perez.half, 'H2');
  assert.strictEqual(A.docs.find((d) => d.type === 'webi' && d.key === '1').hasTxt, true);
  const tipos = A.alerts.map((a) => a.tipo);
  assert.ok(tipos.includes('Webi sin JVU ni Accrual')); // Garcia Ruiz Ana
  assert.ok(tipos.includes('CeCo fuera de MX15'));
  assert.ok(tipos.includes('Archivo duplicado')); // las dos descargas idénticas de KSB1
  assert.ok(tipos.includes('Cargos sin reclasificación'));
  assert.ok(tipos.includes('Evidencia incompleta'));
  assert.ok(tipos.includes('No se pudo leer') || tipos.includes('Excel no reconocido'));
  assert.strictEqual(A.sap.length, 3); // las dos descargas de KSB1 no se duplican
  assert.strictEqual(A.charges.filter((c) => c.month === 6).length, 4);
  assert.strictEqual(A.evidence.find((e) => e.month === 6).ok, 4);
  assert.strictEqual(A.hc[0].market, 'CAR');
  const wb = await B.buildWorkbook(A, { year: 2026 });
  const names = wb.worksheets.map((w) => w.name);
  ['Resumen', 'Recobros por asignación', 'Cargos proveedores', 'Cargos por mes', 'CeCos asignados', 'Movimientos SAP', 'Evidencia por mes', 'Correos', 'Alertas', 'Inventario'].forEach((n) => assert.ok(names.includes(n), n));
  await wb.xlsx.writeBuffer();
});
