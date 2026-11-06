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
    'Recharges H226/Accruals/1. Perez Lopez Juan Carlos/1. Accrual Perez Lopez Juan Carlos.txt',
    'Recharges H226/Accruals/1. Perez Lopez Juan Carlos/1. Accrual Perez Lopez Juan Carlos.xlsx',
    'Recharges H226/JVUs/1. Perez Lopez Juan Carlos/1. JVU Perez Lopez Juan Carlos.txt',
    'Recharges H226/JVUs/1. Perez Lopez Juan Carlos/1. JVU Perez Lopez Juan Carlos.xlsx',
    'Recharges H226/Webis/1. Perez Lopez Juan Carlos/1. SC Perez Lopez Juan Carlos.xlsx',
    'Recharges H226/Webis/1. Perez Lopez Juan Carlos/1. Webi Perez Lopez Juan Carlos.txt',
    'Recharges H226/Webis/1. Perez Lopez Juan Carlos/1. Webi Perez Lopez Juan Carlos.xlsx'
  ]);
  const txt = await zip.file('Recharges H226/Webis/1. Perez Lopez Juan Carlos/1. Webi Perez Lopez Juan Carlos.txt').async('string');
  const lines = txt.split('\r\n');
  assert.strictEqual(lines.length, 5); // 4 líneas + final vacío
  assert.strictEqual(lines[1].split('\t')[2], '9057.03');
  // El xlsx copiado conserva los valores
  const x = XLSX.read(await zip.file('Recharges H226/JVUs/1. Perez Lopez Juan Carlos/1. JVU Perez Lopez Juan Carlos.xlsx').async('nodebuffer'));
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
  assert.strictEqual(en[0].hrbp, 'HRBP Ficticio A');
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
