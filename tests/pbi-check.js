'use strict';
/* Validador de proyectos Power BI generados (lo usan las pruebas unitarias y la e2e). */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Ajv = require('ajv');
const SDIR = path.join(__dirname, 'pbir-schemas');
const BASE = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/';
function makeAjv() {
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    if (!/schema\.json$/.test(e.name)) return;
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    const id = BASE + path.relative(SDIR, p).split(path.sep).join('/');
    delete s.$schema;
    s.$id = id;
    ajv.addSchema(s, id);
  });
  walk(SDIR);
  const theme = JSON.parse(fs.readFileSync(path.join(SDIR, 'reportThemeSchema-2.130.json'), 'utf8'));
  delete theme.$schema; delete theme.$id;
  ajv.addSchema(theme, 'theme');
  return ajv;
}
const ajv = makeAjv();

function check(project) {
  const files = {};
  project.files.forEach((f) => { files[f.path] = f.data; });
  const txt = (p) => new TextDecoder().decode(files[p]);
  const name = project.name;
  const errors = [];
  // 1) Esquemas del reporte
  Object.keys(files).filter((p) => p.startsWith(name + '.Report/definition/') && p.endsWith('.json')).forEach((p) => {
    const doc = JSON.parse(txt(p));
    const v = ajv.getSchema(doc.$schema);
    if (!v) { errors.push(p + ': esquema no disponible ' + doc.$schema); return; }
    if (!v(doc)) errors.push(p + ': ' + ajv.errorsText(v.errors));
  });
  // 2) Tema
  const theme = JSON.parse(txt(name + '.Report/StaticResources/RegisteredResources/HRSS_Tema.json'));
  const tv = ajv.getSchema('theme');
  if (!tv(theme)) errors.push('Tema: ' + ajv.errorsText(tv.errors));
  // 3) Modelo
  const bim = JSON.parse(txt(name + '.SemanticModel/model.bim'));
  const T = {};
  bim.model.tables.forEach((t) => { T[t.name] = { cols: new Set(t.columns.map((c) => c.name)), meas: new Set((t.measures || []).map((m) => m.name)), t }; });
  const allMeasures = new Set(bim.model.tables.flatMap((t) => (t.measures || []).map((m) => m.name)));
  bim.model.relationships.forEach((r) => {
    if (!T[r.fromTable] || !T[r.fromTable].cols.has(r.fromColumn)) errors.push('Relación: no existe ' + r.fromTable + '[' + r.fromColumn + ']');
    if (!T[r.toTable] || !T[r.toTable].cols.has(r.toColumn)) errors.push('Relación: no existe ' + r.toTable + '[' + r.toColumn + ']');
  });
  bim.model.tables.forEach((t) => {
    t.columns.forEach((c) => { if (c.sortByColumn && !T[t.name].cols.has(c.sortByColumn)) errors.push('sortBy inexistente ' + t.name + '.' + c.name); });
    (t.measures || []).forEach((m) => {
      (m.expression.match(/'([^']+)'\[|(?<![\w'])([A-Za-z_][\w]*)\[/g) || []).forEach((ref) => {
        const tn = ref.replace(/\[$/, '').replace(/^'|'$/g, '');
        if (!T[tn]) errors.push('DAX ' + m.name + ': tabla ' + tn + ' no existe');
      });
      (m.expression.match(/(?:'[^']+'|[A-Za-z_]\w*)?\[[^\]]+\]/g) || []).forEach((ref) => {
        const mm = ref.match(/^(?:'([^']+)'|([A-Za-z_]\w*))?\[([^\]]+)\]$/);
        const tn = mm[1] || mm[2], cn = mm[3];
        if (tn) { if (!T[tn] || !(T[tn].cols.has(cn) || T[tn].meas.has(cn))) errors.push('DAX ' + m.name + ': ' + ref + ' no existe'); }
        else if (!allMeasures.has(cn)) errors.push('DAX ' + m.name + ': medida [' + cn + '] no existe');
      });
    });
    // 4) Datos incrustados
    const expr = t.partitions[0].source.expression.join('\n');
    const b64 = expr.match(/Binary\.FromText\("([^"]+)"/)[1];
    const rows = JSON.parse(zlib.inflateRawSync(Buffer.from(b64, 'base64')).toString('utf8'));
    rows.forEach((r, i) => { if (r.length !== t.columns.length) errors.push(t.name + ' fila ' + i + ' con ' + r.length + ' valores (esperado ' + t.columns.length + ')'); });
    t.columns.forEach((c, j) => rows.forEach((r) => {
      const v = r[j];
      if (v === null) return;
      if (c.dataType === 'dateTime' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors.push(t.name + '.' + c.name + ' fecha inválida ' + v);
      if ((c.dataType === 'double' || c.dataType === 'int64') && !isFinite(Number(v))) errors.push(t.name + '.' + c.name + ' número inválido ' + v);
    }));
    // La columna "uno" de cada relación debe ser única
  });
  bim.model.relationships.forEach((r) => {
    const t = bim.model.tables.find((x) => x.name === r.toTable);
    const j = t.columns.findIndex((c) => c.name === r.toColumn);
    const b64 = t.partitions[0].source.expression.join('\n').match(/Binary\.FromText\("([^"]+)"/)[1];
    const vals = JSON.parse(zlib.inflateRawSync(Buffer.from(b64, 'base64')).toString('utf8')).map((x) => x[j]).filter((v) => v !== null);
    if (new Set(vals).size !== vals.length) errors.push('Relación a ' + r.toTable + '[' + r.toColumn + ']: valores repetidos en el lado "uno"');
  });
  // Campos de cada visual
  Object.keys(files).filter((p) => p.endsWith('/visual.json')).forEach((p) => {
    const v = JSON.parse(txt(p));
    const q = v.visual.query;
    if (!q) return;
    Object.values(q.queryState).forEach((st) => st.projections.forEach((pr) => {
      const f = pr.field.Column || pr.field.Measure;
      const ent = f.Expression.SourceRef.Entity;
      if (!T[ent]) errors.push(p + ': tabla ' + ent + ' no existe');
      else if (pr.field.Column && !T[ent].cols.has(f.Property)) errors.push(p + ': columna ' + ent + '.' + f.Property + ' no existe');
      else if (pr.field.Measure && !T[ent].meas.has(f.Property)) errors.push(p + ': medida ' + ent + '.' + f.Property + ' no existe');
    }));
  });
  // Estructura mínima
  ['.pbip', '.SemanticModel/definition.pbism', '.SemanticModel/model.bim', '.Report/definition.pbir', '.Report/definition/report.json', '.Report/definition/version.json', '.Report/definition/pages/pages.json', '.Report/StaticResources/SharedResources/BaseThemes/CY24SU06.json']
    .forEach((s) => { if (!files[name + s]) errors.push('Falta ' + name + s); });
  const pbir = JSON.parse(txt(name + '.Report/definition.pbir'));
  if (pbir.datasetReference.byPath.path !== '../' + name + '.SemanticModel') errors.push('definition.pbir apunta mal');
  return { errors, bim, files };
}

module.exports = { check, ajv, BASE };
