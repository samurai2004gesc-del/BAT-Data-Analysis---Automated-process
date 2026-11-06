/* Power BI: genera un proyecto de Power BI Desktop (.pbip) listo para abrir:
 *  - Modelo semántico (model.bim / TMSL) en estrella, con relaciones, calendario y medidas DAX.
 *  - Los datos van incrustados en el modelo (como "Escribir datos"), así que abre y actualiza sin rutas de archivo.
 *  - Reporte en formato PBIR (carpetas definition/pages/visuals) con páginas diseñadas y tema propio.
 *  - Además: los datos en Excel, el tema .json, las medidas DAX en texto y un LEEME.
 * Formato tomado de los esquemas oficiales de Microsoft (github.com/microsoft/json-schemas) y de proyectos
 * generados por Power BI Desktop. Versiones de esquema de 2024 para abrir también en Desktop no tan recientes. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('../vendor/pbi-base-theme.js'), true, () => require('./hc.js'));
  else root.PowerBI = factory(root.Core, root.PBI_BASE_THEME, false, () => root.HC);
})(typeof self !== 'undefined' ? self : this, function (Core, BASE_THEME, isNode, getHC) {
  'use strict';
  const { norm, str } = Core;
  const SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/';
  const V = { report: '1.1.0', page: '1.1.0', visual: '1.1.0', pages: '1.0.0', version: '1.0.0' };
  const BASE_THEME_NAME = 'CY24SU06';
  const THEME_FILE = 'HRSS_Tema.json';
  const PALETTE = ['#2A78D6', '#EB6834', '#1BAF7A', '#EDA100', '#E87BA4', '#008300', '#6250D6', '#E34948'];
  const INK = { navy: '#0E2841', text: '#1D2733', muted: '#64707D', line: '#DDE3EA', grid: '#E1E0D9', page: '#F4F6F9' };
  const MES = Core.MESES;
  const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // ---------- Identificadores ----------
  function rnd(n) { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16); return s; }
  function uuid() { const h = rnd(32); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-' + ((parseInt(h[16], 16) & 3) | 8).toString(16) + h.slice(17, 20) + '-' + h.slice(20); }
  function id20() { return rnd(20); }
  /** Nombre seguro para tabla/columna: sin corchetes ni comillas problemáticas, sin repetidos. */
  function cleanName(s, used) {
    let n = String(s || '').replace(/[\[\]{}"'\t\r\n.]/g, ' ').replace(/\s+/g, ' ').trim() || 'Columna';
    if (used) { let k = n, i = 2; while (used.has(norm(k))) k = n + ' ' + i++; used.add(norm(k)); n = k; }
    return n;
  }
  const daxTable = (t) => "'" + t.replace(/'/g, "''") + "'";
  const daxCol = (t, c) => daxTable(t) + '[' + c.replace(/\]/g, ']]') + ']';

  // ---------- Datos incrustados (igual que "Escribir datos" de Power BI) ----------
  async function deflateRaw(bytes) {
    if (isNode) return new Uint8Array(require('zlib').deflateRawSync(Buffer.from(bytes)));
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function cellText(v, type) {
    if (v === null || v === undefined || v === '') return null;
    if (type === 'dateTime') {
      const s = typeof v === 'number' ? v : Core.parseDate(v);
      if (s === null) return null;
      const { y, m, d } = Core.serialToYMD(s);
      return y + '-' + Core.pad(m) + '-' + Core.pad(d);
    }
    if (type === 'double' || type === 'int64') { const n = Core.parseNum(v); return n === null ? null : String(type === 'int64' ? Math.round(n) : n); }
    if (type === 'boolean') return /^(true|1|si|sí|x|yes)$/i.test(String(v).trim()) ? 'true' : 'false';
    return String(v);
  }
  const M_TYPE = { string: 'type text', int64: 'Int64.Type', double: 'type number', dateTime: 'type date', boolean: 'type logical' };
  async function mExpression(t) {
    const rows = t.rows.map((r) => t.columns.map((c, i) => cellText(r[i], c.type)));
    const b64 = Core.bytesToBase64(await deflateRaw(new TextEncoder().encode(JSON.stringify(rows))));
    const q = (n) => '#"' + n.replace(/"/g, '""') + '"';
    const typeTable = 'type table [' + t.columns.map((c) => q(c.name) + ' = _t').join(', ') + ']';
    const types = '{' + t.columns.map((c) => '{"' + c.name.replace(/"/g, '""') + '", ' + M_TYPE[c.type] + '}').join(', ') + '}';
    return [
      'let',
      '    Origen = Table.FromRows(Json.Document(Binary.Decompress(Binary.FromText("' + b64 + '", BinaryEncoding.Base64), Compression.Deflate)), let _t = ((type nullable text) meta [Serialized.Text = true]) in ' + typeTable + '),',
      '    Tipos = Table.TransformColumnTypes(Origen, ' + types + ', "en-US")',
      'in',
      '    Tipos'
    ];
  }

  // ---------- Modelo semántico (TMSL: model.bim) ----------
  async function buildModelBim(spec) {
    const tables = [];
    for (const t of spec.tables) {
      tables.push({
        name: t.name,
        lineageTag: uuid(),
        columns: t.columns.map((c) => {
          const o = { name: c.name, dataType: c.type, sourceColumn: c.name, lineageTag: uuid(), summarizeBy: c.summarize || (c.type === 'double' && !c.key ? 'sum' : 'none') };
          if (c.format) o.formatString = c.format;
          else if (c.type === 'dateTime') o.formatString = 'dd/mm/yyyy';
          else if (c.type === 'double') o.formatString = '#,0.00';
          else if (c.type === 'int64') o.formatString = '0';
          if (c.hidden) o.isHidden = true;
          if (c.sortBy) o.sortByColumn = c.sortBy;
          o.annotations = [{ name: 'SummarizationSetBy', value: 'Automatic' }];
          return o;
        }),
        partitions: [{ name: t.name, mode: 'import', source: { type: 'm', expression: await mExpression(t) } }],
        measures: (t.measures || []).map((m) => Object.assign({ name: m.name, expression: m.expr, lineageTag: uuid() }, m.format ? { formatString: m.format } : {}, m.description ? { description: m.description } : {})),
        annotations: [{ name: 'PBI_ResultType', value: 'Table' }]
      });
      if (!tables[tables.length - 1].measures.length) delete tables[tables.length - 1].measures;
    }
    return {
      compatibilityLevel: 1567,
      model: {
        culture: 'es-MX',
        dataAccessOptions: { legacyRedirects: true, returnErrorValuesAsNull: true },
        defaultPowerBIDataSourceVersion: 'powerBI_V3',
        sourceQueryCulture: 'es-MX',
        tables,
        relationships: (spec.relationships || []).map((r) => ({ name: uuid(), fromTable: r.from[0], fromColumn: r.from[1], toTable: r.to[0], toColumn: r.to[1] })),
        annotations: [
          { name: 'PBI_QueryOrder', value: JSON.stringify(spec.tables.map((t) => t.name)) },
          { name: '__PBI_TimeIntelligenceEnabled', value: '0' },
          { name: 'PBI_ProTooling', value: '["DevMode"]' }
        ]
      }
    };
  }

  // ---------- Reporte (PBIR) ----------
  const lit = (v) => ({ expr: { Literal: { Value: v } } });
  const sLit = (s) => lit("'" + String(s).replace(/'/g, "''") + "'");
  const color = (hex) => ({ solid: { color: sLit(hex) } });
  function fieldOf(f) {
    return f.measure
      ? { Measure: { Expression: { SourceRef: { Entity: f.table } }, Property: f.measure } }
      : { Column: { Expression: { SourceRef: { Entity: f.table } }, Property: f.column } };
  }
  function projection(f, active) {
    const name = f.measure || f.column;
    const p = { field: fieldOf(f), queryRef: f.table + '.' + name, nativeQueryRef: name };
    if (f.label) p.displayName = f.label;
    if (active) p.active = true;
    return p;
  }
  function containerTitle(text, extra) {
    const o = { title: [{ properties: { show: lit('true'), text: sLit(text) } }] };
    return Object.assign(o, extra || {});
  }
  /** Visual genérico. kind: card | columnChart | clusteredColumnChart | clusteredBarChart | lineChart | tableEx | slicer | textbox */
  function visual(kind, pos, o) {
    o = o || {};
    const v = { visualType: kind };
    const qs = {};
    if (kind === 'card') qs.Values = { projections: [projection(o.value)] };
    else if (kind === 'slicer') qs.Values = { projections: [projection(o.field, true)] };
    else if (kind === 'tableEx') qs.Values = { projections: o.columns.map((c) => projection(c)) };
    else if (kind !== 'textbox') {
      qs.Category = { projections: [projection(o.category, true)] };
      qs.Y = { projections: o.values.map((m) => projection(m)) };
      if (o.series) qs.Series = { projections: [projection(o.series)] };
    }
    if (kind !== 'textbox') {
      v.query = { queryState: qs };
      if (o.sort) v.query.sortDefinition = { sort: [{ field: fieldOf(o.sort.field), direction: o.sort.dir || 'Descending' }], isDefaultSort: true };
    }
    if (kind === 'textbox') {
      const paragraphs = [{ textRuns: [{ value: o.title, textStyle: { fontWeight: 'bold', fontSize: '20pt', color: INK.navy } }] }];
      if (o.subtitle) paragraphs.push({ textRuns: [{ value: o.subtitle, textStyle: { fontSize: '10pt', color: INK.muted } }] });
      v.objects = { general: [{ properties: { paragraphs } }] };
      v.visualContainerObjects = { background: [{ properties: { show: lit('false') } }], border: [{ properties: { show: lit('false') } }] };
    } else if (kind === 'slicer') {
      v.objects = { data: [{ properties: { mode: sLit('Dropdown') } }] };
    } else if (kind === 'card') {
      v.objects = { labels: [{ properties: { fontSize: lit('24D'), color: color(INK.navy) } }], categoryLabels: [{ properties: { show: lit('true'), fontSize: lit('10D') } }] };
    } else {
      v.visualContainerObjects = containerTitle(o.title || '');
      if (o.legend === false) v.objects = { legend: [{ properties: { show: lit('false') } }] };
    }
    v.drillFilterOtherVisuals = true;
    return {
      $schema: SCHEMA + 'visualContainer/' + V.visual + '/schema.json',
      name: id20(),
      position: { x: pos[0], y: pos[1], z: pos.z || 1000, height: pos[3], width: pos[2], tabOrder: pos.z || 1000 },
      visual: v
    };
  }
  /** Rejilla 1280×720: encabezado, fila de tarjetas y dos filas de gráficas. */
  const G = { M: 20, gap: 16, W: 1280, H: 720 };
  function layoutPage(def) {
    const vis = [];
    let z = 0;
    const add = (kind, pos, o) => { pos.z = (z += 1000); vis.push(visual(kind, pos, o)); };
    const inner = G.W - 2 * G.M;
    // Encabezado (título a la izquierda, filtros a la derecha en una fila)
    const slicers = def.slicers || [];
    const sw = 200;
    add('textbox', [G.M, 12, inner - slicers.length * (sw + G.gap), 64], { title: def.title, subtitle: def.subtitle });
    slicers.forEach((s, i) => add('slicer', [G.W - G.M - (slicers.length - i) * sw - (slicers.length - 1 - i) * G.gap, 14, sw, 60], { field: s, title: s.label || s.column }));
    let y = 88;
    // Tarjetas
    const cards = def.cards || [];
    if (cards.length) {
      const cw = (inner - (cards.length - 1) * G.gap) / cards.length;
      cards.forEach((c, i) => add('card', [G.M + i * (cw + G.gap), y, cw, 92], { value: c }));
      y += 92 + G.gap;
    }
    // Filas de visuales: cada fila es una lista de {kind, opts, span}
    const rows = def.rows || [];
    const rowH = (G.H - y - G.M - (rows.length - 1) * G.gap) / Math.max(1, rows.length);
    rows.forEach((row) => {
      const total = row.reduce((a, it) => a + (it.span || 1), 0);
      let x = G.M;
      row.forEach((it) => {
        const w = (inner - (row.length - 1) * G.gap) * (it.span || 1) / total;
        add(it.kind, [x, y, w, rowH], it.opts);
        x += w + G.gap;
      });
      y += rowH + G.gap;
    });
    return { name: id20(), displayName: def.name, visuals: vis };
  }
  function theme(name) {
    return {
      name: name || 'HRSS Automatizador',
      dataColors: PALETTE,
      foreground: INK.text, foregroundNeutralSecondary: INK.muted, foregroundNeutralTertiary: '#898781',
      background: '#FFFFFF', backgroundLight: '#F4F6F9', backgroundNeutral: INK.line,
      tableAccent: '#1F4E79', good: '#0CA30C', neutral: '#FAB219', bad: '#D03B3B',
      maximum: '#1F4E79', center: '#DDEBF7', minimum: '#F4F6F9',
      textClasses: {
        callout: { fontSize: 24, fontFace: 'Segoe UI Semibold', color: INK.navy },
        title: { fontSize: 12, fontFace: 'Segoe UI Semibold', color: INK.navy },
        header: { fontSize: 12, fontFace: 'Segoe UI Semibold', color: INK.navy },
        label: { fontSize: 10, fontFace: 'Segoe UI', color: '#52514E' }
      },
      visualStyles: {
        '*': {
          '*': {
            background: [{ show: true, color: { solid: { color: '#FFFFFF' } }, transparency: 0 }],
            border: [{ show: true, color: { solid: { color: INK.line } }, radius: 8 }],
            dropShadow: [{ show: false }],
            title: [{ show: true, fontColor: { solid: { color: INK.navy } }, fontSize: 12, bold: true }],
            valueAxis: [{ gridlineColor: { solid: { color: INK.grid } }, gridlineStyle: 'solid' }]
          }
        },
        page: { '*': { background: [{ color: { solid: { color: INK.page } }, transparency: 0 }], outspace: [{ color: { solid: { color: INK.page } } }] } },
        textbox: { '*': { background: [{ show: false }], border: [{ show: false }] } }
      }
    };
  }
  function reportFiles(spec, pages, name) {
    const R = name + '.Report/';
    const files = {};
    const j = (o) => JSON.stringify(o, null, 2);
    files[R + 'definition.pbir'] = j({ version: '4.0', datasetReference: { byPath: { path: '../' + name + '.SemanticModel' } } });
    files[R + '.platform'] = j({ $schema: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json', metadata: { type: 'Report', displayName: name }, config: { version: '2.0', logicalId: uuid() } });
    files[R + 'definition/version.json'] = j({ $schema: SCHEMA + 'versionMetadata/' + V.version + '/schema.json', version: '2.0.0' });
    files[R + 'definition/report.json'] = j({
      $schema: SCHEMA + 'report/' + V.report + '/schema.json',
      themeCollection: {
        baseTheme: { name: BASE_THEME_NAME, reportVersionAtImport: '5.56', type: 'SharedResources' },
        customTheme: { name: THEME_FILE, reportVersionAtImport: '5.56', type: 'RegisteredResources' }
      },
      layoutOptimization: 'None',
      resourcePackages: [
        { name: 'SharedResources', type: 'SharedResources', items: [{ name: BASE_THEME_NAME, path: 'BaseThemes/' + BASE_THEME_NAME + '.json', type: 'BaseTheme' }] },
        { name: 'RegisteredResources', type: 'RegisteredResources', items: [{ name: THEME_FILE, path: THEME_FILE, type: 'CustomTheme' }] }
      ],
      settings: { useStylableVisualContainerHeader: true, exportDataMode: 'AllowSummarized', defaultDrillFilterOtherVisuals: true, allowChangeFilterTypes: true, useEnhancedTooltips: true }
    });
    files[R + 'definition/pages/pages.json'] = j({ $schema: SCHEMA + 'pagesMetadata/' + V.pages + '/schema.json', pageOrder: pages.map((p) => p.name), activePageName: pages[0].name });
    pages.forEach((p) => {
      files[R + 'definition/pages/' + p.name + '/page.json'] = j({ $schema: SCHEMA + 'page/' + V.page + '/schema.json', name: p.name, displayName: p.displayName, displayOption: 'FitToPage', height: G.H, width: G.W });
      p.visuals.forEach((v) => { files[R + 'definition/pages/' + p.name + '/visuals/' + v.name + '/visual.json'] = j(v); });
    });
    files[R + 'StaticResources/SharedResources/BaseThemes/' + BASE_THEME_NAME + '.json'] = j(BASE_THEME);
    files[R + 'StaticResources/RegisteredResources/' + THEME_FILE] = j(theme(spec.themeName));
    return files;
  }

  // ---------- Proyecto completo ----------
  async function buildProject(spec, pagesDef, opts) {
    opts = opts || {};
    const name = Core.safeFileName(spec.name || 'Reporte HRSS').replace(/[.]/g, ' ').trim();
    const pages = pagesDef.map(layoutPage);
    const files = {};
    const j = (o) => JSON.stringify(o, null, 2);
    files[name + '.pbip'] = j({ version: '1.0', artifacts: [{ report: { path: name + '.Report' } }], settings: { enableAutoRecovery: true } });
    const SM = name + '.SemanticModel/';
    files[SM + 'definition.pbism'] = j({ version: '1.0', settings: {} });
    files[SM + 'model.bim'] = j(await buildModelBim(spec));
    files[SM + '.platform'] = j({ $schema: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json', metadata: { type: 'SemanticModel', displayName: name }, config: { version: '2.0', logicalId: uuid() } });
    Object.assign(files, reportFiles(spec, pages, name));
    files['Tema ' + (spec.themeName || 'HRSS') + '.json'] = j(theme(spec.themeName));
    files['Medidas DAX y relaciones.txt'] = daxDoc(spec);
    files['LEEME.txt'] = readme(name, spec, pages);
    const out = Object.entries(files).map(([path, text]) => ({ path, data: new TextEncoder().encode(text), type: 'text/plain' }));
    if (opts.excel !== false) out.push({ path: 'Datos/' + name + ' - datos.xlsx', data: new Uint8Array(await (await dataWorkbook(spec)).xlsx.writeBuffer()), type: Core.XLSX_MIME });
    return { name, files: out, pages, spec };
  }
  function daxDoc(spec) {
    let s = 'MEDIDAS DAX — ' + spec.name + '\r\n' + '='.repeat(60) + '\r\n\r\n';
    spec.tables.forEach((t) => (t.measures || []).forEach((m) => { s += '[' + m.name + ']  (tabla ' + t.name + ')\r\n    ' + m.expr + '\r\n' + (m.description ? '    · ' + m.description + '\r\n' : '') + '\r\n'; }));
    s += '\r\nRELACIONES (muchos → uno, filtro en un sentido)\r\n' + '-'.repeat(60) + '\r\n';
    (spec.relationships || []).forEach((r) => { s += r.from.join('[') + ']  →  ' + r.to.join('[') + ']\r\n'; });
    s += '\r\nTABLAS\r\n' + '-'.repeat(60) + '\r\n';
    spec.tables.forEach((t) => { s += t.name + ' (' + t.rows.length + ' filas): ' + t.columns.map((c) => c.name + ' [' + c.type + ']').join(', ') + '\r\n'; });
    return s;
  }
  function readme(name, spec, pages) {
    return [
      'PROYECTO DE POWER BI — ' + name,
      '',
      'CÓMO ABRIRLO',
      '1. Descomprime esta carpeta completa (no la muevas por partes).',
      '2. Doble clic en "' + name + '.pbip" (se abre con Power BI Desktop).',
      '   Si Power BI pide activar una función de vista previa, ve a Archivo › Opciones y configuración › Opciones ›',
      '   Características en versión preliminar y activa "Power BI Project (.pbip) save option" y',
      '   "Store reports using enhanced metadata format (PBIR)". Reinicia Power BI Desktop.',
      '3. Pulsa "Actualizar" (Inicio › Actualizar). Los datos van dentro del modelo: no hay rutas que configurar.',
      '4. Para entregarlo como .pbix: Archivo › Guardar como › tipo "Power BI (.pbix)".',
      '',
      'QUÉ TRAE',
      '- Páginas: ' + pages.map((p) => p.displayName).join(', ') + '.',
      '- Modelo en estrella: ' + spec.tables.map((t) => t.name).join(', ') + '.',
      '- Medidas DAX listas (ver "Medidas DAX y relaciones.txt").',
      '- Tema "' + (spec.themeName || 'HRSS') + '" con colores validados para daltonismo (también suelto en "Tema ' + (spec.themeName || 'HRSS') + '.json":',
      '  Vista › Temas › Buscar temas, para aplicarlo a cualquier otro reporte).',
      '- Carpeta Datos: las mismas tablas en Excel, por si quieres revisarlas o usarlas en otro reporte.',
      '',
      'ACTUALIZAR CON DATOS NUEVOS',
      'Vuelve a generar el proyecto en HRSS Automatizador con los archivos nuevos y reemplaza la carpeta.',
      'Si hiciste cambios de diseño en Power BI, guárdalos primero como .pbix o copia la carpeta *.Report.',
      '',
      'Generado por HRSS Automatizador el ' + Core.stamp() + '.'
    ].join('\r\n');
  }
  async function dataWorkbook(spec) {
    const wb = Core.newWorkbook();
    spec.tables.forEach((t) => {
      const ws = wb.addWorksheet(t.name.slice(0, 31));
      Core.writeTable(ws, 1, t.columns.map((c) => ({
        header: c.name, width: Math.min(40, Math.max(10, c.name.length + 4)),
        numFmt: c.type === 'dateTime' ? 'dd/mm/yyyy' : c.type === 'double' ? '#,##0.00' : undefined
      })), t.rows.map((r) => r.map((v, i) => {
        const ty = t.columns[i].type;
        if (v === null || v === undefined || v === '') return null;
        if (ty === 'dateTime') { const s = typeof v === 'number' ? v : Core.parseDate(v); return s === null ? null : Core.serialToJSDate(s); }
        if (ty === 'double' || ty === 'int64') return Core.parseNum(v);
        return v;
      })), { autoFilter: true });
    });
    return wb;
  }

  // ---------- Calendario ----------
  function calendarTable(years) {
    const ys = Array.from(new Set(years.filter(Boolean))).sort();
    if (!ys.length) ys.push(new Date().getFullYear());
    const rows = [];
    for (let y = ys[0]; y <= ys[ys.length - 1]; y++) {
      for (let s = Core.ymdToSerial(y, 1, 1); s <= Core.ymdToSerial(y, 12, 31); s++) {
        const { m } = Core.serialToYMD(s);
        rows.push([s, y, m, MES[m - 1], MES_CORTO[m - 1], 'T' + Math.ceil(m / 3), y * 100 + m, MES_CORTO[m - 1] + ' ' + y]);
      }
    }
    return {
      name: 'Calendario',
      columns: [{ name: 'Fecha', type: 'dateTime' }, { name: 'Año', type: 'int64' }, { name: 'Mes', type: 'int64' }, { name: 'MesNombre', type: 'string', sortBy: 'Mes' },
        { name: 'MesCorto', type: 'string', sortBy: 'Mes' }, { name: 'Trimestre', type: 'string' }, { name: 'AñoMesNum', type: 'int64', hidden: true }, { name: 'AñoMes', type: 'string', sortBy: 'AñoMesNum' }],
      rows
    };
  }

  // ---------- Modelo HRSS (datos de la app) ----------
  /**
   * A: resultado de Bulk.aggregate (opcional). hc: [{market, res}] resultados de Headcount (opcional).
   */
  function hrssSpec(A, hc, opts) {
    opts = opts || {};
    const year = Number(opts.year) || new Date().getFullYear();
    const tables = [], rel = [], pages = [];
    const monthDate = (m) => (m ? Core.ymdToSerial(year, Number(m), 1) : null);
    const years = [year];
    if (A) {
      const provs = Array.from(new Set(A.charges.map((c) => c.provider || '(Sin proveedor)').concat(A.reclass.map((r) => r.provider || '(Sin proveedor)')).concat(A.cecosRows.map((r) => r.provider || '(Sin proveedor)')))).sort();
      tables.push({ name: 'Proveedores', columns: [{ name: 'Proveedor', type: 'string' }], rows: provs.map((p) => [p]) });
      tables.push({
        name: 'Cargos',
        columns: [{ name: 'Fecha', type: 'dateTime' }, { name: 'Proveedor', type: 'string' }, { name: 'Nombre', type: 'string' }, { name: 'Servicio', type: 'string' },
          { name: 'Monto', type: 'double' }, { name: 'Moneda', type: 'string' }, { name: 'HRBP', type: 'string' }, { name: 'HomeFunction', type: 'string' }, { name: 'CeCo', type: 'string' }, { name: 'Fuente', type: 'string' }],
        rows: A.charges.map((c) => [monthDate(c.month), c.provider || '(Sin proveedor)', c.name, c.service, c.amount, c.currency || '(Sin moneda)', c.hrbp || '(Sin HRBP)', c.func, c.ceco, c.fromRetrieved ? 'Retrieved' : 'Proveedor']),
        measures: [
          { name: 'Total cargos', expr: 'SUM(Cargos[Monto])', format: '#,0.00', description: 'Suma de cargos en la moneda filtrada (filtra una sola moneda para no mezclar).' },
          { name: 'Número de cargos', expr: 'COUNTROWS(Cargos)', format: '#,0' },
          { name: 'Personas con cargos', expr: 'DISTINCTCOUNT(Cargos[Nombre])', format: '#,0' }
        ]
      });
      tables.push({
        name: 'Reclasificaciones',
        columns: [{ name: 'Fecha', type: 'dateTime' }, { name: 'Proveedor', type: 'string' }, { name: 'CeCo', type: 'string' }, { name: 'MXN', type: 'double' }, { name: 'MonedaOriginal', type: 'double' }],
        rows: A.reclass.map((r) => [monthDate(r.month), r.provider || '(Sin proveedor)', r.ceco, r.mxn, r.gbp]),
        measures: [{ name: 'Reclasificado MXN', expr: 'SUM(Reclasificaciones[MXN])', format: '#,0.00' }]
      });
      tables.push({
        name: 'CeCosAsignados',
        columns: [{ name: 'Fecha', type: 'dateTime' }, { name: 'Proveedor', type: 'string' }, { name: 'Nombre', type: 'string' }, { name: 'HRBP', type: 'string' }, { name: 'HomeFunction', type: 'string' },
          { name: 'CeCo', type: 'string' }, { name: 'Validacion', type: 'string' }, { name: 'Monto', type: 'double' }],
        rows: A.cecosRows.map((r) => [monthDate(r.month), r.provider || '(Sin proveedor)', r.name, r.hrbp, r.func, r.ceco, A.cecosSource ? r.validation : 'Sin catálogo', r.amount]),
        measures: [{ name: 'CeCos fuera de sociedad', expr: 'CALCULATE(COUNTROWS(CeCosAsignados), CeCosAsignados[Validacion] <> "OK", CeCosAsignados[Validacion] <> "Sin catálogo")', format: '#,0' }]
      });
      tables.push({
        name: 'Recobros',
        columns: [{ name: 'Periodo', type: 'string' }, { name: 'KEY', type: 'string' }, { name: 'Empleado', type: 'string' }, { name: 'ShoppingCart', type: 'double' }, { name: 'Webi', type: 'double' },
          { name: 'JVU', type: 'double' }, { name: 'Accrual', type: 'double' }, { name: 'Moneda', type: 'string' }, { name: 'ICCode', type: 'string' }, { name: 'PO', type: 'string' }, { name: 'Estatus', type: 'string' }],
        rows: A.recharges.map((e) => [e.half || '(Sin periodo)', e.key, e.employee, e.sc, e.webi, e.jvu, e.accrual, e.currency, e.ic, e.po, e.status]),
        measures: [
          { name: 'Asignaciones', expr: 'COUNTROWS(Recobros)', format: '#,0' },
          { name: 'Con JVU o Accrual', expr: 'CALCULATE(COUNTROWS(Recobros), Recobros[Estatus] IN {"JVU generado", "Accrual generado"})', format: '#,0' },
          { name: 'Webi sin JVU', expr: 'CALCULATE(COUNTROWS(Recobros), Recobros[Estatus] = "Webi sin JVU")', format: '#,0' },
          { name: '% con JVU o Accrual', expr: 'DIVIDE([Con JVU o Accrual], [Asignaciones])', format: '0%' },
          { name: 'Monto JVU', expr: 'SUM(Recobros[JVU])', format: '#,0.00' },
          { name: 'Monto Webi', expr: 'SUM(Recobros[Webi])', format: '#,0.00' }
        ]
      });
      tables.push({
        name: 'MovimientosSAP',
        columns: [{ name: 'Documento', type: 'string' }, { name: 'Fecha', type: 'dateTime' }, { name: 'Texto', type: 'string' }, { name: 'Valor', type: 'double' }, { name: 'Moneda', type: 'string' }, { name: 'ValorMXN', type: 'double' }, { name: 'CeCo', type: 'string' }],
        rows: A.sap.map((l) => [l.doc, l.date, l.text, l.tran, l.tcur, l.obj, l.ceco]),
        measures: [{ name: 'Valor SAP MXN', expr: 'SUM(MovimientosSAP[ValorMXN])', format: '#,0.00' }]
      });
      A.sap.forEach((l) => { if (l.date) years.push(Core.serialToYMD(l.date).y); });
      tables.push({
        name: 'Alertas',
        columns: [{ name: 'Tipo', type: 'string' }, { name: 'Detalle', type: 'string' }, { name: 'Ruta', type: 'string' }],
        rows: A.alerts.map((a) => [a.tipo, a.detalle, a.ruta]),
        measures: [{ name: 'Total alertas', expr: 'COUNTROWS(Alertas)', format: '#,0' }]
      });
      ['Cargos', 'Reclasificaciones', 'CeCosAsignados'].forEach((t) => { rel.push({ from: [t, 'Fecha'], to: ['Calendario', 'Fecha'] }); rel.push({ from: [t, 'Proveedor'], to: ['Proveedores', 'Proveedor'] }); });
      rel.push({ from: ['MovimientosSAP', 'Fecha'], to: ['Calendario', 'Fecha'] });
      const F = (table, column, label) => ({ table, column, label });
      const Mz = (table, measure, label) => ({ table, measure, label });
      pages.push({
        name: 'Resumen', title: 'Resumen HRSS ' + year, subtitle: 'Cargos de proveedores, reclasificaciones, recobros y alertas · ' + A.records.length + ' archivos analizados',
        slicers: [F('Proveedores', 'Proveedor'), F('Cargos', 'Moneda')],
        cards: [Mz('Cargos', 'Total cargos'), Mz('Reclasificaciones', 'Reclasificado MXN'), Mz('Recobros', 'Asignaciones', 'Asignaciones con recobro'), Mz('Alertas', 'Total alertas')],
        rows: [
          [{ kind: 'columnChart', span: 3, opts: { title: 'Cargos de proveedores por mes', category: F('Calendario', 'MesCorto'), series: F('Proveedores', 'Proveedor'), values: [Mz('Cargos', 'Total cargos')], sort: { field: F('Calendario', 'MesCorto'), dir: 'Ascending' } } },
            { kind: 'clusteredBarChart', span: 2, opts: { title: 'Cargos por HRBP', category: F('Cargos', 'HRBP'), values: [Mz('Cargos', 'Total cargos')], sort: { field: Mz('Cargos', 'Total cargos') }, legend: false } }],
          [{ kind: 'clusteredBarChart', span: 2, opts: { title: 'Reclasificado (MXN) por CeCo', category: F('Reclasificaciones', 'CeCo'), values: [Mz('Reclasificaciones', 'Reclasificado MXN')], sort: { field: Mz('Reclasificaciones', 'Reclasificado MXN') }, legend: false } },
            { kind: 'tableEx', span: 3, opts: { title: 'Detalle de cargos', columns: [F('Cargos', 'Nombre'), F('Cargos', 'Proveedor'), F('Cargos', 'Servicio'), F('Cargos', 'CeCo'), F('Cargos', 'Monto'), F('Cargos', 'Moneda')], sort: { field: F('Cargos', 'Monto') } } }]
        ]
      });
      pages.push({
        name: 'Recobros', title: 'Recobros intercompañía', subtitle: 'Documentos de recobro por asignación (Shopping Cart, Webi, JVU y Accrual)',
        slicers: [F('Recobros', 'Periodo'), F('Recobros', 'Estatus')],
        cards: [Mz('Recobros', 'Asignaciones'), Mz('Recobros', 'Con JVU o Accrual'), Mz('Recobros', 'Webi sin JVU'), Mz('Recobros', '% con JVU o Accrual')],
        rows: [
          [{ kind: 'clusteredBarChart', span: 2, opts: { title: 'Asignaciones por estatus', category: F('Recobros', 'Estatus'), values: [Mz('Recobros', 'Asignaciones')], sort: { field: Mz('Recobros', 'Asignaciones') }, legend: false } },
            { kind: 'clusteredColumnChart', span: 3, opts: { title: 'Monto Webi vs JVU por periodo', category: F('Recobros', 'Periodo'), values: [Mz('Recobros', 'Monto Webi'), Mz('Recobros', 'Monto JVU')], sort: { field: F('Recobros', 'Periodo'), dir: 'Ascending' } } }],
          [{ kind: 'tableEx', opts: { title: 'Detalle por asignación', columns: [F('Recobros', 'Periodo'), F('Recobros', 'KEY'), F('Recobros', 'Empleado'), F('Recobros', 'Webi'), F('Recobros', 'JVU'), F('Recobros', 'Accrual'), F('Recobros', 'Moneda'), F('Recobros', 'PO'), F('Recobros', 'Estatus')] } }]
        ]
      });
      pages.push({
        name: 'CeCos y SAP', title: 'CeCos y movimientos en SAP', subtitle: 'CeCos devueltos por los HRBPs y movimientos de KSB1 (sin duplicados)',
        slicers: [F('Proveedores', 'Proveedor'), F('CeCosAsignados', 'Validacion', 'Validación')],
        cards: [Mz('CeCosAsignados', 'CeCos fuera de sociedad'), Mz('Cargos', 'Personas con cargos'), Mz('Cargos', 'Número de cargos'), Mz('MovimientosSAP', 'Valor SAP MXN')],
        rows: [
          [{ kind: 'clusteredBarChart', span: 2, opts: { title: 'Cargos por CeCo', category: F('Cargos', 'CeCo'), values: [Mz('Cargos', 'Total cargos')], sort: { field: Mz('Cargos', 'Total cargos') }, legend: false } },
            { kind: 'lineChart', span: 3, opts: { title: 'Movimientos SAP (MXN) por mes', category: F('Calendario', 'MesCorto'), values: [Mz('MovimientosSAP', 'Valor SAP MXN')], sort: { field: F('Calendario', 'MesCorto'), dir: 'Ascending' } } }],
          [{ kind: 'tableEx', opts: { title: 'CeCos devueltos por los HRBPs', columns: [F('CeCosAsignados', 'Proveedor'), F('CeCosAsignados', 'Nombre'), F('CeCosAsignados', 'HRBP'), F('CeCosAsignados', 'CeCo'), F('CeCosAsignados', 'Validacion', 'Validación'), F('CeCosAsignados', 'Monto')] } }]
        ]
      });
      pages.push({
        name: 'Calidad de datos', title: 'Calidad de datos y pendientes', subtitle: 'Alertas detectadas: faltantes, montos que no cuadran, duplicados y archivos no reconocidos',
        slicers: [F('Alertas', 'Tipo')],
        cards: [Mz('Alertas', 'Total alertas'), Mz('Recobros', 'Webi sin JVU'), Mz('CeCosAsignados', 'CeCos fuera de sociedad')],
        rows: [[{ kind: 'clusteredBarChart', span: 2, opts: { title: 'Alertas por tipo', category: F('Alertas', 'Tipo'), values: [Mz('Alertas', 'Total alertas')], sort: { field: Mz('Alertas', 'Total alertas') }, legend: false } },
          { kind: 'tableEx', span: 3, opts: { title: 'Detalle de alertas', columns: [F('Alertas', 'Tipo'), F('Alertas', 'Detalle'), F('Alertas', 'Ruta')] } }]]
      });
    }
    if (hc && hc.length) {
      const HCm = getHC();
      const rows = [];
      hc.forEach((it) => {
        const res = it.res;
        const ents = it.cfg && it.cfg.multiEntity ? res.entities : [null];
        ents.forEach((e) => res.funcs.forEach((f) => HCm.compare(res.positions, res.approved, { entity: e, func: f }).rows.forEach((r) => {
          const m = r.grade.match(/(\d+)/);
          rows.push([it.market, e || (it.cfg && it.cfg.entityName) || 'Total', f, r.grade, m ? -Number(m[1]) + (/below/.test(r.grade) ? 0.5 : 0) : (r.grade === '(Sin grado)' ? 1000 : -1000), r.bpcSOP, r.appSOP, r.bpcCOPLAN, r.appCOPLAN]);
        })));
      });
      const sopL = (hc[0].cfg && hc[0].cfg.sopLabel) || 'SOP', copL = (hc[0].cfg && hc[0].cfg.coplanLabel) || 'COPLAN';
      tables.push({
        name: 'Headcount',
        columns: [{ name: 'Mercado', type: 'string' }, { name: 'Entidad', type: 'string' }, { name: 'Funcion', type: 'string' }, { name: 'Grado', type: 'string', sortBy: 'OrdenGrado' },
          { name: 'OrdenGrado', type: 'double', hidden: true, summarize: 'none' }, { name: 'BPC_SOP', type: 'double' }, { name: 'Aprobado_SOP', type: 'double' }, { name: 'BPC_COPLAN', type: 'double' }, { name: 'Aprobado_COPLAN', type: 'double' }],
        rows,
        measures: [
          { name: 'HC BPC ' + sopL, expr: 'SUM(Headcount[BPC_SOP])', format: '#,0.##' },
          { name: 'HC Aprobado ' + sopL, expr: 'SUM(Headcount[Aprobado_SOP])', format: '#,0.##' },
          { name: 'Diferencia ' + sopL, expr: "[HC BPC " + sopL.replace(/]/g, ']]') + "] - [HC Aprobado " + sopL.replace(/]/g, ']]') + ']', format: '+#,0.##;-#,0.##;0' },
          { name: 'HC BPC ' + copL, expr: 'SUM(Headcount[BPC_COPLAN])', format: '#,0.##' },
          { name: 'HC Aprobado ' + copL, expr: 'SUM(Headcount[Aprobado_COPLAN])', format: '#,0.##' },
          { name: 'Diferencia ' + copL, expr: "[HC BPC " + copL.replace(/]/g, ']]') + "] - [HC Aprobado " + copL.replace(/]/g, ']]') + ']', format: '+#,0.##;-#,0.##;0' },
          { name: 'Grados con diferencia ' + sopL, expr: "COUNTROWS(FILTER(VALUES(Headcount[Grado]), [Diferencia " + sopL.replace(/]/g, ']]') + "] <> 0))", format: '#,0' }
        ]
      });
      const F = (table, column, label) => ({ table, column, label });
      const Mz = (table, measure, label) => ({ table, measure, label });
      pages.push({
        name: 'Headcount', title: 'HC in BPC vs HC Approved', subtitle: sopL + ' y ' + copL + ' por grado · positivo = sobran posiciones en BPC, negativo = faltan',
        slicers: [F('Headcount', 'Mercado'), F('Headcount', 'Entidad'), F('Headcount', 'Funcion', 'Función')],
        cards: [Mz('Headcount', 'HC BPC ' + sopL), Mz('Headcount', 'HC Aprobado ' + sopL), Mz('Headcount', 'Diferencia ' + sopL), Mz('Headcount', 'Grados con diferencia ' + sopL)],
        rows: [
          [{ kind: 'clusteredColumnChart', opts: { title: 'HC BPC vs Aprobado por grado · ' + sopL, category: F('Headcount', 'Grado'), values: [Mz('Headcount', 'HC BPC ' + sopL), Mz('Headcount', 'HC Aprobado ' + sopL)], sort: { field: F('Headcount', 'Grado'), dir: 'Ascending' } } },
            { kind: 'clusteredColumnChart', opts: { title: 'HC BPC vs Aprobado por grado · ' + copL, category: F('Headcount', 'Grado'), values: [Mz('Headcount', 'HC BPC ' + copL), Mz('Headcount', 'HC Aprobado ' + copL)], sort: { field: F('Headcount', 'Grado'), dir: 'Ascending' } } }],
          [{ kind: 'tableEx', opts: { title: 'Detalle por entidad, función y grado', columns: [F('Headcount', 'Mercado'), F('Headcount', 'Entidad'), F('Headcount', 'Funcion', 'Función'), F('Headcount', 'Grado'), Mz('Headcount', 'HC BPC ' + sopL), Mz('Headcount', 'HC Aprobado ' + sopL), Mz('Headcount', 'Diferencia ' + sopL), Mz('Headcount', 'Diferencia ' + copL)] } }]
        ]
      });
    }
    if (A) tables.push(calendarTable(years));
    return { spec: { name: opts.name || 'HRSS ' + year, themeName: 'HRSS', tables, relationships: rel }, pages };
  }

  // ---------- Modelo genérico (cualquier Excel / CSV) ----------
  /** Lee las hojas de un libro y propone tablas con tipos de columna. */
  function profileWorkbook(wb, fileName) {
    const XLSX = Core.lib('XLSX');
    const out = [];
    wb.SheetNames.forEach((sn) => {
      const ws = wb.Sheets[sn];
      if (!ws || !ws['!ref']) return;
      const rows = Core.sheetRows(ws);
      // fila de encabezado: la primera con al menos 2 textos y que tenga datos debajo
      let h = -1;
      for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const r = rows[i] || [];
        const texts = r.filter((c) => typeof c === 'string' && c.trim()).length;
        if (texts >= 2 && texts >= r.filter((c) => c !== null && c !== '').length * 0.6) { h = i; break; }
      }
      if (h < 0) return;
      const range = XLSX.utils.decode_range(ws['!ref']);
      const header = rows[h] || [];
      const used = new Set();
      const cols = [];
      header.forEach((name, j) => { if (!Core.isBlank(name)) cols.push({ j, name: cleanName(name, used) }); });
      if (cols.length < 2) return;
      const idx = [];
      rows.forEach((r, i) => { if (i > h && r && cols.some((c) => !Core.isBlank(r[c.j]))) idx.push(i); });
      const data = idx.map((i) => rows[i]);
      if (!data.length) return;
      cols.forEach((c) => {
        let n = 0, nums = 0, ints = 0, dates = 0, bools = 0;
        for (let i = 0; i < data.length && n < 400; i++) {
          const v = data[i][c.j];
          if (Core.isBlank(v)) continue;
          n++;
          const cell = ws[XLSX.utils.encode_cell({ r: range.s.r + idx[i], c: range.s.c + c.j })];
          if (typeof v === 'number') {
            if (cell && cell.z && XLSX.SSF.is_date(cell.z)) dates++;
            else { nums++; if (Number.isInteger(v)) ints++; }
          } else if (typeof v === 'boolean') bools++;
          else if (Core.parseDate(v) !== null && /\d{1,4}[-\/.]\d{1,2}[-\/.]\d{1,4}/.test(String(v))) dates++;
          else if (Core.parseNum(v) !== null && /^[\s$£€(-]*[\d.,]+\)?\s*%?$/.test(String(v))) { nums++; if (Number.isInteger(Core.parseNum(v))) ints++; }
        }
        const nn = norm(c.name);
        const id = /(^|[^a-z])(id|key|clave|codigo|code|num|number|numero|no|payroll|numnom|ceco|cost cent(er|re)?|document|documento|doc|po|invoice|factura)([^a-z]|$)/.test(nn);
        // Números de serie de Excel sin formato en columnas de fecha (exports de SAP)
        const looksDate = /(fecha|date|dia|day|desde|hasta|inicio|fin|start|end)/.test(nn) && nums && ints === nums &&
          data.every((r) => Core.isBlank(r[c.j]) || (typeof r[c.j] === 'number' && r[c.j] > 20000 && r[c.j] < 80000));
        c.type = !n ? 'string' : (dates / n > 0.8 || looksDate) ? 'dateTime' : bools / n > 0.8 ? 'boolean' : nums / n > 0.9 ? (id ? 'string' : ints === nums ? 'int64' : 'double') : 'string';
        if (c.type === 'int64' && /mes|month|año|year|grade|grado/i.test(c.name)) c.key = true;
        c.distinct = new Set(data.map((r) => r[c.j]).filter((v) => !Core.isBlank(v)).map(String)).size;
      });
      out.push({ include: true, file: fileName, sheet: sn, name: cleanName(sn), headerRow: h + 1, columns: cols, rows: data.map((r) => cols.map((c) => (Core.isBlank(r[c.j]) ? null : r[c.j]))) });
    });
    return out;
  }
  /** Construye modelo y páginas a partir de tablas perfiladas. */
  function genericSpec(profiles, opts) {
    opts = opts || {};
    const used = new Set(['calendario']);
    const tables = profiles.filter((p) => p.include !== false).map((p) => ({
      name: cleanName(p.name, used), source: p,
      columns: p.columns.map((c) => ({ name: c.name, type: c.type, key: c.key, distinct: c.distinct })),
      rows: p.rows
    }));
    const rel = [];
    // Relaciones: columna con el mismo nombre; la tabla donde es única hace de dimensión
    for (let a = 0; a < tables.length; a++) for (let b = 0; b < tables.length; b++) {
      if (a === b) continue;
      const A = tables[a], B = tables[b];
      if (rel.some((r) => (r.from[0] === A.name && r.to[0] === B.name) || (r.from[0] === B.name && r.to[0] === A.name))) continue;
      for (const ca of A.columns) {
        const cb = B.columns.find((x) => norm(x.name) === norm(ca.name) && x.type === ca.type && x.type !== 'double');
        if (!cb) continue;
        const ib = B.columns.indexOf(cb);
        const vals = B.rows.map((r) => r[ib]).filter((v) => v !== null && v !== '');
        const uniqB = new Set(vals.map(String)).size === vals.length && vals.length > 0;
        const ia = A.columns.indexOf(ca);
        const valsA = A.rows.map((r) => r[ia]).filter((v) => v !== null && v !== '');
        const uniqA = new Set(valsA.map(String)).size === valsA.length;
        if (uniqB && !uniqA) { rel.push({ from: [A.name, ca.name], to: [B.name, cb.name] }); break; }
      }
    }
    // Calendario si hay fechas
    const dateCols = [];
    const years = [];
    tables.forEach((t) => {
      const i = t.columns.findIndex((c) => c.type === 'dateTime');
      if (i < 0) return;
      dateCols.push([t, t.columns[i]]);
      t.rows.forEach((r) => { const s = typeof r[i] === 'number' ? r[i] : Core.parseDate(r[i]); if (s) years.push(Core.serialToYMD(s).y); });
    });
    if (dateCols.length && years.length) {
      const span = Math.max(...years) - Math.min(...years);
      const cal = calendarTable(span <= 30 ? [Math.min(...years), Math.max(...years)] : [Math.max(...years)]);
      tables.push(cal);
      dateCols.forEach(([t, c]) => rel.push({ from: [t.name, c.name], to: ['Calendario', 'Fecha'] }));
    }
    // Medidas por tabla
    const F = (table, column) => ({ table, column });
    const Mz = (table, measure) => ({ table, measure });
    const usedNames = new Set();
    tables.forEach((t) => { t.columns.forEach((c) => usedNames.add(norm(c.name))); usedNames.add(norm(t.name)); });
    const mname = (s) => { let n = s, i = 2; while (usedNames.has(norm(n))) n = s + ' ' + i++; usedNames.add(norm(n)); return n; };
    tables.forEach((t) => {
      if (t.name === 'Calendario') return;
      t.measures = [{ name: mname('Filas ' + t.name), expr: 'COUNTROWS(' + daxTable(t.name) + ')', format: '#,0' }];
      t.columns.filter((c) => (c.type === 'double' || c.type === 'int64') && !c.key).slice(0, 4).forEach((c) => {
        t.measures.push({ name: mname('Total ' + c.name), expr: 'SUM(' + daxCol(t.name, c.name) + ')', format: c.type === 'int64' ? '#,0' : '#,0.00' });
      });
    });
    // Páginas: una por tabla (máximo 8)
    const pages = [];
    tables.filter((t) => t.name !== 'Calendario').slice(0, 8).forEach((t) => {
      const cats = t.columns.filter((c) => c.type === 'string' && c.distinct >= 2 && c.distinct <= 40 && c.distinct < t.rows.length);
      const measures = t.measures.map((m) => Mz(t.name, m.name));
      const main = measures[1] || measures[0];
      const hasDate = rel.some((r) => r.from[0] === t.name && r.to[0] === 'Calendario');
      const rowsDef = [];
      const r1 = [];
      if (hasDate) r1.push({ kind: 'columnChart', span: 3, opts: { title: main.measure + ' por mes', category: F('Calendario', 'AñoMes'), values: [main], series: cats[0] && cats[0].distinct <= 8 ? F(t.name, cats[0].name) : undefined, sort: { field: F('Calendario', 'AñoMes'), dir: 'Ascending' } } });
      if (cats[0]) r1.push({ kind: 'clusteredBarChart', span: 2, opts: { title: main.measure + ' por ' + cats[0].name, category: F(t.name, cats[0].name), values: [main], sort: { field: main }, legend: false } });
      if (!hasDate && cats[1]) r1.push({ kind: 'clusteredBarChart', span: 2, opts: { title: main.measure + ' por ' + cats[1].name, category: F(t.name, cats[1].name), values: [main], sort: { field: main }, legend: false } });
      if (r1.length) rowsDef.push(r1);
      rowsDef.push([{ kind: 'tableEx', opts: { title: 'Detalle de ' + t.name, columns: t.columns.slice(0, 8).map((c) => F(t.name, c.name)) } }]);
      pages.push({
        name: t.name.slice(0, 40), title: t.name, subtitle: 'Fuente: ' + (t.source ? t.source.file + ' › ' + t.source.sheet : '') + ' · ' + t.rows.length + ' filas',
        slicers: cats.filter((c) => c.distinct <= 30).slice(0, 2).map((c) => F(t.name, c.name)),
        cards: measures.slice(0, 4),
        rows: rowsDef
      });
    });
    return { spec: { name: opts.name || 'Reporte', themeName: 'HRSS', tables: tables.map((t) => ({ name: t.name, columns: t.columns.map((c) => ({ name: c.name, type: c.type, key: c.key })), rows: t.rows, measures: t.measures })), relationships: rel }, pages };
  }

  return { PALETTE, theme, buildProject, buildModelBim, hrssSpec, genericSpec, profileWorkbook, calendarTable, layoutPage, uuid, cleanName, deflateRaw, mExpression };
});
