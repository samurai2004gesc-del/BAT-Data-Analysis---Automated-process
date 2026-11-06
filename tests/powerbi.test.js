'use strict';
/* Valida los proyectos de Power BI generados:
 *  1) Cada JSON del reporte contra los esquemas oficiales de Microsoft (tests/pbir-schemas, licencia MIT).
 *  2) El tema contra el esquema oficial de temas de Power BI.
 *  3) Coherencia del modelo: relaciones, sortByColumn, DAX y campos usados por cada visual existen.
 *  4) Los datos incrustados (M) se descomprimen y tienen las columnas correctas. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const Core = require('../src/js/core.js');
const HC = require('../src/js/hc.js');
const R = require('../src/js/recharges.js');
const RC = require('../src/js/reclass.js');
const B = require('../src/js/bulk.js');
const PBI = require('../src/js/powerbi.js');
const F = require('./fixtures.js');

const { check, ajv, BASE } = require('./pbi-check.js');

async function bulkSample() {
  const xbuf = (wb) => new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  const oneWb = (ws, n) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, n || 'Sheet1'); return wb; };
  const files = [];
  const add = (p, data) => files.push({ path: p, size: data.length, data });
  add('2026/Tracker/Suppliers/06. Junio/K2/K2 MX15.xlsx', xbuf(oneWb(F.supplierK2(), 'MX15')));
  add('2026/Tracker/Suppliers/07. Julio/EY/EY MX15.xlsx', xbuf(oneWb(F.supplierK2(), 'MX15')));
  add('2026/Tracker/Suppliers/06. Junio/K2/Retrieved From HRBPs - MX15 K2.xlsx', xbuf(oneWb(F.supplierK2(), 'MX15')));
  add('2026/Tracker/All CeCos - Approvers.xlsx', xbuf(oneWb(F.allCecos())));
  add('2026/Tracker/Reportes SAP 2026 K2/06-24-2026 EXPORT.XLSX', xbuf(oneWb(F.ksb1())));
  const t = Core.serialToYMD(Core.todaySerial());
  const eb = XLSX.write(F.estimateBenefits(String(t.y) + Core.pad(t.m) + Core.pad(t.d)), { type: 'buffer', bookType: 'xlsx' });
  const pr = await R.processWorkbook({ name: 'EB.xlsx', buffer: eb, wb: XLSX.read(eb, { type: 'buffer' }) });
  (await R.buildFiles([pr], { half: 'H2', year: 2026 })).files.forEach((f) => add('2026/Tracker/' + f.path, f.data));
  return B.aggregate(files.map((f) => B.processFile(f, { year: 2026 })), { sociedad: 'MX15' });
}
function hcSample() {
  const rt = (wb) => XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellNF: true });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, F.hrInput(), 'S');
  const rows = Core.sheetRows(rt(wb).Sheets.S);
  const master = rt(F.masterWorkbook());
  const eq = HC.readEquivalences(master);
  const cfg = { market: 'CAR', sopLabel: "SOP9'26", coplanLabel: "COPLAN'27", cutoffs: HC.defaultCutoffs(2026), multiEntity: true, splitMarketing: false,
    funcMapBPC: eq.funcMapBPC, funcMapApp: eq.funcMapApp, entityMapBPC: eq.entityMapBPC, entityMapApp: { GY: 'Guyana', JM: 'Jamaica', TT: 'Trinidad Comercial', TTO: 'Trinidad Operación' } };
  const app = HC.autoApproved(master, {}, cfg.sopLabel, cfg.coplanLabel);
  return [{ market: 'CAR', res: HC.run(rows, app, cfg), cfg }];
}

test('Power BI: proyecto HRSS (Bulk + Headcount) cumple los esquemas oficiales y es coherente', async () => {
  const A = await bulkSample();
  const { spec, pages } = PBI.hrssSpec(A, hcSample(), { year: 2026, name: 'HRSS 2026' });
  const project = await PBI.buildProject(spec, pages);
  const { errors, bim, files } = check(project);
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(project.pages.map((p) => p.displayName), ['Resumen', 'Recobros', 'CeCos y SAP', 'Calidad de datos', 'Headcount']);
  assert.ok(bim.model.tables.some((t) => t.name === 'Calendario'));
  assert.ok(bim.model.relationships.length >= 7);
  assert.ok(Object.keys(files).some((p) => /Datos\/.*datos\.xlsx$/.test(p)));
  // El Excel de datos se puede abrir y trae las tablas
  const x = XLSX.read(files['Datos/HRSS 2026 - datos.xlsx'], { type: 'array' });
  assert.ok(x.SheetNames.includes('Cargos') && x.SheetNames.includes('Headcount'));
  if (process.env.PBI_OUT) {
    project.files.forEach((f) => { const p = path.join(process.env.PBI_OUT, f.path); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, f.data); });
  }
});

test('Power BI: proyecto genérico desde archivos cualquiera', async () => {
  const rt = (wb) => XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellNF: true, cellText: true });
  const one = (ws, n) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, n); return rt(wb); };
  const profiles = [].concat(
    PBI.profileWorkbook(one(F.ksb1(), 'Movimientos'), 'KSB1.xlsx'),
    PBI.profileWorkbook(one(F.allCecos(), 'CeCos'), 'All CeCos.xlsx'),
    PBI.profileWorkbook(rt(F.consolidado()), 'Consolidado.xlsx')
  );
  assert.strictEqual(profiles.length, 3);
  const mov = profiles[0];
  assert.deepStrictEqual(mov.columns.map((c) => c.type), ['string', 'string', 'string', 'string', 'dateTime', 'double', 'string', 'double', 'string']);
  const { spec, pages } = PBI.genericSpec(profiles, { name: 'Prueba generica' });
  const project = await PBI.buildProject(spec, pages);
  const { errors, bim } = check(project);
  assert.deepStrictEqual(errors, []);
  assert.ok(bim.model.relationships.some((r) => r.toTable === 'Calendario'));
  // Movimientos.Cost Center → CeCos.Cost Center (única en el catálogo)
  assert.ok(bim.model.relationships.some((r) => r.fromTable === 'Movimientos' && r.toTable === 'CeCos'));
  assert.strictEqual(project.pages.length, 3);
  if (process.env.PBI_OUT) project.files.forEach((f) => { const p = path.join(process.env.PBI_OUT, f.path); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, f.data); });
});

test('Power BI: el validador sí detecta archivos mal formados', () => {
  const vc = ajv.getSchema(BASE + 'visualContainer/1.1.0/schema.json');
  assert.ok(vc, 'esquema de visual cargado');
  assert.strictEqual(vc({ $schema: BASE + 'visualContainer/1.1.0/schema.json', name: 'x' }), false); // falta position
  assert.strictEqual(vc({ $schema: BASE + 'visualContainer/1.1.0/schema.json', name: 'x', position: { x: 0, y: 0, width: 10, height: 10 }, visual: { visualType: 'card', query: { queryState: { Values: { projections: [{ field: { Column: { Expression: { SourceRef: { Entity: 'T' } }, Property: 'c' } }, queryRef: 'T.c', inventado: 1 }] } } } } }), false);
  const rp = ajv.getSchema(BASE + 'report/1.1.0/schema.json');
  assert.strictEqual(rp({ $schema: BASE + 'report/1.1.0/schema.json', themeCollection: {} }), false); // falta layoutOptimization
  assert.strictEqual(ajv.getSchema('theme')({ name: 'x', dataColors: 'rojo' }), false);
});
