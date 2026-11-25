/* Reclasificación: MAE, número de empleado, nombres, códigos de función, HRBP por función y formato del Sent.
 * Datos ficticios con la misma estructura que los archivos reales (Deloitte MX15, MAE de SAP HR, Sent corregido). */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const Core = require('../src/js/core.js');
const RC = require('../src/js/reclass.js');
const F = require('./fixtures.js');

const rowsOf = (ws) => Core.sheetRows(XLSX.read(XLSX.write((() => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'S'); return wb; })(), { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' }).Sheets.S);
const roundtrip = (wb) => XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });

test('Nombres: no se confunden personas que solo comparten nombres de pila', () => {
  assert.strictEqual(Core.nameScore('Navarro, Luis Fernando', 'Robles Vega, Luis Fernando'), 0);
  assert.strictEqual(Core.nameScore('Luis Fernando Navarro', 'Luis Fernando Robles Vega'), 0);
  assert.strictEqual(Core.nameScore('Ibarra, Tomas', 'Salinas Ibarra, Pablo Ivan'), 0);
  assert.strictEqual(Core.nameScore('Garcia, Maria', 'Garcia, Mario'), 0);
  // Mismas personas escritas distinto
  assert.strictEqual(Core.nameScore('Duran, Hector Vidal', 'Vidal Duran, Hector'), 1);
  assert.strictEqual(Core.nameScore('Rivera Carrillo, Jorge Ivan', 'Rivera Carillo, Jorge Ivan'), 1);
  assert.strictEqual(Core.nameScore('Soto Rivera, Raul Alonso', 'Soto Rivera, Raul Alfonso'), 1);
  assert.ok(Core.nameScore('Quintana De Souza, Gilberto', 'Quintana De Souza Prado, Gilberto') >= 0.9);
  assert.ok(Core.nameScore('Cardenas, Ernesto', 'Cardenas Lopez, Ernesto') >= 0.9);
});

test('MAE: se lee CeCo (Ce.coste), número y unidad; no se conservan datos sensibles', () => {
  const res = RC.readSources(rowsOf(F.mae()), 'MAE');
  assert.strictEqual(res.kind, 'mae');
  assert.strictEqual(res.records.length, 5);
  const r = res.records[0];
  assert.deepStrictEqual([r.name, r.ids[0], r.ceco, r.cecoDesc, r.uo], ['Perez Lopez, Juan Carlos', '10000001', 'MXCB2H2011', 'MKT Fin BP', 'MARKETING FINANCE']);
  const txt = JSON.stringify(res.records);
  assert.ok(!/XAXX010101000|XEXX010101HNEXXXA4|000000000000000000/.test(txt), 'no guarda RFC, CURP ni cuentas');
  assert.ok(!/00000000/.test(res.records.map((x) => x.func || '').join('')), 'la columna "Función" (código 00000000) no es la función');
});

test('Funciones: códigos, sugerencia por la MAE y tabla Función → HRBP', () => {
  const t = RC.functionTable([{ code: 'FIN', hrbp: 'Laura Mendez Ruiz' }]);
  assert.strictEqual(RC.normFunction('Marketing Office', t), 'MKT Office');
  assert.strictEqual(RC.normFunction('Exec & Corp Services', t), 'EXEC');
  assert.strictEqual(RC.normFunction('Operations', t), 'OPS');
  assert.strictEqual(RC.normFunction('00000000', t), '');
  assert.strictEqual(RC.hrbpFor('FIN', t), 'Laura Mendez Ruiz');
  assert.strictEqual(RC.suggestFunction({ uo: 'OPERATIONS HUMAN RESOURCES' }), 'HR');
  assert.strictEqual(RC.suggestFunction({ uo: 'MARKETING FINANCE' }), 'FIN');
  assert.strictEqual(RC.suggestFunction({ uo: 'IDT Analytics' }), 'DBS');
  assert.strictEqual(RC.suggestFunction({ uo: 'INFORMATION TECHNOLOGY' }), 'IDT');
  assert.strictEqual(RC.suggestFunction({ uo: 'LEAF', cecoDesc: 'Ops - GLT - Leaf Cost' }), 'OPS');
  assert.strictEqual(RC.suggestFunction({ uo: 'MEXICO DIRECTORY' }), 'EXEC');
  assert.strictEqual(RC.suggestFunction({ uo: 'Head of TM&D' }), 'MKT Office');
  // La tabla explícita (hoja Homefunction / HRBP) manda sobre la mayoría
  const prev = roundtrip(F.sentAnterior());
  const all = prev.SheetNames.map((sn) => RC.readSources(Core.sheetRows(prev.Sheets[sn]), 'Sent anterior'));
  assert.deepStrictEqual(all.map((x) => x.kind), ['people', 'map']);
  const learned = RC.learnFunctionHrbp(all[0].records, all[1].pairs);
  assert.strictEqual(learned.HR.hrbp, 'Elena Torres Vega');
  assert.strictEqual(learned.FIN.hrbp, 'Laura Mendez Ruiz');
});

test('Sent to HRBPs: número de empleado, MAE, historial y el formato que se envía', async () => {
  global.ExcelJS = ExcelJS;
  const sup = RC.detectSupplier(rowsOf(F.supplierDeloitte()));
  assert.deepStrictEqual(sup.cols.ids.map((i) => sup.header[i]), ['Success Factors ID', 'HOST SUCCES FACTOR ID']);
  assert.strictEqual(sup.header[sup.cols.period], 'Invoice Perioud');
  const mae = RC.readSources(rowsOf(F.mae()), 'MAE').records;
  const prev = roundtrip(F.sentAnterior());
  const srcs = prev.SheetNames.map((sn) => RC.readSources(Core.sheetRows(prev.Sheets[sn]), 'Sent anterior'));
  const dir = srcs.flatMap((x) => x.records);
  const learned = RC.learnFunctionHrbp(dir, srcs.flatMap((x) => x.pairs));
  const functions = Object.entries(learned).map(([code, v]) => ({ code, hrbp: v.hrbp }));
  const cecos = RC.readCecos(rowsOf(F.allCecos()));
  const en = RC.enrich(sup, [], dir, { mae, functions, cecos, sociedad: 'MX15' });
  const by = (n) => en[sup.data.findIndex((d) => d.name.startsWith(n))];
  // Juan Carlos: MAE por número de empleado; función, HRBP y CeCo del Sent anterior
  assert.strictEqual(by('Perez').mae.how, 'número de empleado');
  assert.deepStrictEqual([by('Perez').func, by('Perez').hrbp, by('Perez').ceco, by('Perez').cecoOf], ['FIN', 'Laura Mendez Ruiz', 'MXCB2H2011', 'MXCB2H2011']);
  // Ana: por nombre; no se confunde con "Robles Garcia, Ana"
  assert.strictEqual(by('Garcia').cecoOf, 'MXCB8D0045');
  assert.deepStrictEqual([by('Garcia').func, by('Garcia').hrbp], ['EXEC', 'Carlos Ortega Paz']);
  // Persona nueva: función sugerida por la MAE (aviso en la app), HRBP por la tabla, CeCo de la MAE por confirmar
  const n = by('Sin Historico');
  assert.deepStrictEqual([n.func, n.hrbp, n.ceco, n.from.ceco], ['HR', 'Elena Torres Vega', 'MXCB2J0001', 'MAE']);
  assert.ok(n.flags.some((f) => f.field === 'func' && f.file === false));
  assert.ok(n.flags.some((f) => f.field === 'ceco' && /Confirmar CeCo/.test(f.text) && f.file !== false));
  // Sin datos en ningún lado
  const p = by('Romero');
  assert.deepStrictEqual([p.func, p.hrbp, p.ceco], ['', '', '']);

  const wb = await RC.buildSentToHRBP(sup, en, { sociedad: 'MX15', functions });
  const buf = await wb.xlsx.writeBuffer();
  const x = new ExcelJS.Workbook();
  await x.xlsx.load(buf);
  assert.deepStrictEqual(x.worksheets.map((w) => w.name), ['MX15', 'HRBP por funcion']);
  const ws = x.getWorksheet('MX15');
  const hdr = ws.getRow(1).values.slice(1);
  assert.deepStrictEqual(hdr.slice(2, 8), ['Success Factors ID', 'Assignee Name\n(Surname, first name)', 'Home Function', 'HRBP', 'CeCo', 'Ceco Oficial']);
  assert.strictEqual(ws.rowCount, 6, 'sin renglones de leyenda al final');
  // Orden: HRBP, periodo, nombre (sin HRBP al final)
  const names = [2, 3, 4, 5, 6].map((r) => ws.getCell(r, 4).value);
  assert.deepStrictEqual(names, ['Garcia Ruiz, Ana', 'Sin Historico, Persona Nueva', 'Perez Lopez, Juan Carlos', 'Perez Lopez, Juan Carlos', 'Romero Diaz, Pedro']);
  assert.deepStrictEqual([4, 5].map((r) => ws.getCell(r, 13).value), ['August', 'Sept']); // Invoice Perioud se recorre 4 columnas
  // HRBP sigue a la función (fórmula) y guarda el valor calculado
  const h = ws.getCell(2, 6).value;
  assert.match(h.formula, /INDEX\('HRBP por funcion'!\$B\$2:\$B\$\d+,MATCH\(E2,/);
  assert.strictEqual(h.result, 'Carlos Ortega Paz');
  // Amarillo + nota solo en lo pendiente; la función sugerida por la MAE no se pinta
  const yellow = (c) => c.fill && c.fill.fgColor && c.fill.fgColor.argb === 'FFFFFF00';
  assert.ok(yellow(ws.getCell(3, 7)) && /Confirmar CeCo/.test(ws.getCell(3, 7).note.texts ? ws.getCell(3, 7).note.texts.map((t) => t.text).join('') : ws.getCell(3, 7).note));
  assert.ok(!yellow(ws.getCell(3, 5)), 'función sugerida sin amarillo');
  assert.ok(yellow(ws.getCell(6, 5)) && yellow(ws.getCell(6, 6)) && yellow(ws.getCell(6, 7)), 'sin datos: función, HRBP y CeCo en amarillo');
  assert.ok(!yellow(ws.getCell(2, 7)) && !yellow(ws.getCell(4, 7)));
  assert.strictEqual(ws.getCell(4, 8).value, 'MXCB2H2011');
});

test('Retrieved con las columnas nuevas: se respetan y se valida la sociedad', () => {
  const H = ['Assignee Name', 'Home Function', 'HRBP', 'CeCo', 'Ceco Oficial', 'Gross Amount (GBP)'];
  const rows = [H, ['Perez Lopez, Juan Carlos', 'FIN', 'Laura Mendez Ruiz', 'MXCB2H2011', 'MXCB2H2011', 100], ['Garcia Ruiz, Ana', 'EXEC', 'Carlos Ortega Paz', 'MXMA1D3H33', 'MXCB8D0045', 50]];
  const ret = RC.detectSupplier(rows);
  assert.deepStrictEqual([ret.cols.func, ret.cols.hrbp, ret.cols.ceco, ret.cols.cecoOf], [1, 2, 3, 4]);
  const cecos = RC.readCecos(rowsOf(F.allCecos()));
  const en = RC.enrich(ret, [], [], { cecos, sociedad: 'MX15' });
  assert.deepStrictEqual(en.map((e) => [e.func, e.hrbp, e.ceco, e.cecoOf]), [['FIN', 'Laura Mendez Ruiz', 'MXCB2H2011', 'MXCB2H2011'], ['EXEC', 'Carlos Ortega Paz', 'MXMA1D3H33', 'MXCB8D0045']]);
  assert.ok(en[1].flags.some((f) => /MX10/.test(f.text)));
  assert.strictEqual(RC.validateCeco(en[1].ceco, cecos, 'MX15').status, 'OTRA_SOC');
});
