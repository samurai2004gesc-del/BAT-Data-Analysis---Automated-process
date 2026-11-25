/* Procesamiento y Reclasificación de Costos de Movilidad Internacional (K2, EY, Deloitte, SIRVA...).
 *  Paso 2: completa Home Function / HRBP / CeCo (historial, MAE y tabla Función → HRBP) y genera "Sent to HRBPs".
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

  // ---------- Utilidades de encabezados ----------
  /** Encabezado comparable: sin acentos, espacios ni puntuación ("Home Function" = "Homefunction"). */
  const hkey = (s) => norm(s).replace(/[^a-z0-9&º°]/g, '');
  /** Columnas con número de empleado (Success Factors / OneID / Nº pers.). */
  function idCols(hd) {
    const out = [];
    hd.forEach((h, i) => {
      const n = norm(h), k = hkey(h);
      if (!n || /regional|manager|gmsp|contact|invoice|deloitte|k2 number|case|fee|number of/.test(n)) return;
      if (/succes+ ?factors? ?id|^sf ?id$|employee ?(id|number)|^one ?id$|personnel|numero de empleado|^n[º°o]?\.? ?pers|^id empleado/.test(n) || /^(sfid|oneid|employeeid)$/.test(k)) out.push(i);
    });
    return out;
  }
  /** Números de empleado de un renglón (ignora "N/A", "TBC", textos). */
  function rowIds(raw, cols) {
    const out = [];
    (cols || []).forEach((c) => {
      const v = str(raw[c]).replace(/\.0+$/, '');
      if (/^\d{5,10}$/.test(v)) out.push(v.replace(/^0+/, ''));
    });
    return out;
  }
  const MONTH_KEYS = ['ene|jan', 'feb', 'mar', 'abr|apr', 'may', 'jun', 'jul', 'ago|aug', 'sep|set', 'oct', 'nov', 'dic|dec'];
  /** "August" / "Sept" / "Agosto" / 8 → 8 (0 si no se reconoce). */
  function monthOf(v) {
    const n = parseNum(v);
    if (n !== null && n >= 1 && n <= 12 && Math.round(n) === n) return n;
    const s = norm(v).slice(0, 3);
    const i = MONTH_KEYS.findIndex((k) => k.split('|').includes(s));
    return i + 1;
  }

  // ---------- Archivo del proveedor / Retrieved ----------
  /** Columna del monto en libras: "Gross Amount (GBP)" (K2), "Total Amount (inc.VAT) in GBP" (Deloitte)… */
  function pickAmount(hd) {
    let best = -1, bestScore = 0;
    hd.forEach((h, i) => {
      const n = norm(h);
      if (!n || !/amount|importe|monto|total|fee/.test(n)) return;
      if (/local|tax amount|^net|net amount|mxn|disburse|3rd|fx|rate|discount|excl|^vat$|^iva$|number|count/.test(n)) return;
      let sc = 1;
      if (/gbp|£/.test(n)) sc += 3;
      if (/gross/.test(n)) sc += 4;
      if (/total/.test(n)) sc += 2;
      if (/inc/.test(n)) sc += 2;
      if (/amount|importe|monto/.test(n)) sc += 1;
      if (sc > bestScore) { bestScore = sc; best = i; }
    });
    return best;
  }
  /** CeCo asignado (no el de host/home ni el "oficial" de la MAE). */
  function cecoCol(hd) {
    const H = hd.map(norm);
    const exact = H.findIndex((h) => /^ce ?co$/.test(h));
    if (exact >= 0) return exact;
    return Core.findCol(hd, [/ceco/, /cost cent/, /centro de cost/], ['host', 'home', 'oficial', 'official', 'mae', 'sap']);
  }
  function funcCol(hd) {
    const i = hd.findIndex((h) => ['homefunction', 'function', 'funcion'].includes(hkey(h)));
    return i >= 0 ? i : Core.findCol(hd, ['Home Function', 'Function', 'Funcion'], ['sub', 'position', 'posicion']);
  }
  function detectSupplier(rows) {
    const h = Core.findHeaderRow(rows, ['Assignee Name', 'Employee', 'Name', 'Nombre', 'Amount', 'Gross', 'Invoice', 'Service', 'Currency'], 30);
    if (h < 0) throw new Error('No encontré la fila de encabezados en el archivo (busqué "Assignee Name", "Amount", etc.).');
    const hd = rows[h] || [];
    const cols = {
      name: Core.findCol(hd, ['Assignee Name', 'Employee Name', 'Assignee', 'Nombre del colaborador', 'Nombre', /(^| )name$/], ['manager', 'contact', 'company', 'hrbp', 'vendor', 'supplier', 'full name']),
      amount: pickAmount(hd),
      currency: Core.findCol(hd, [/^currency$/, /^moneda$/, /currency/, /moneda/, /^curr/], ['local', 'disburse']),
      service: Core.findCol(hd, [/fee type as per rate card/, /^description$/, /^servicio$/, /^service$/, /servicio/, /descripcion/, /concept/, /fee type/, /service type/, /description/, /activity/, /^item/], ['disburse', '3rd party']),
      hrbp: Core.findCol(hd, ['HRBP']),
      func: funcCol(hd),
      ceco: cecoCol(hd),
      cecoOf: Core.findCol(hd, [/ceco oficial/, /ceco official/, /ceco mae/, /ceco sap/]),
      ids: idCols(hd),
      period: Core.findCol(hd, [/invoice peri/, /^period$/, /^periodo$/, /^mes$/, /^month$/]),
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

  // ---------- Funciones y HRBP ----------
  /** Códigos de función que se usan en "Sent to HRBPs" y cómo pueden venir escritos en otros archivos. */
  const FUNCTIONS = [
    { code: 'HR', aliases: ['HR', 'Human Resources', 'Recursos Humanos', 'People & Culture'] },
    { code: 'IDT', aliases: ['IDT', 'IT', 'Information Technology', 'Information & Digital Technology', 'Digital Technology'] },
    { code: 'LEX', aliases: ['LEX', 'Legal', 'Legal & External Affairs', 'Legal and External Affairs'] },
    { code: 'CORA', aliases: ['CORA', 'Corporate Affairs', 'Corporate & Regulatory Affairs'] },
    { code: 'FIN', aliases: ['FIN', 'Finance', 'Finanzas'] },
    { code: 'EXEC', aliases: ['EXEC', 'Exec & Corp Services', 'Executive', 'GM', 'General Management'] },
    { code: 'OPS', aliases: ['OPS', 'Operations', 'Operaciones', 'OPS PROCUREMENT', 'Procurement', 'Supply Chain'] },
    { code: 'MKT Office', aliases: ['MKT Office', 'Marketing Office', 'MKT', 'Marketing', 'TM&D'] },
    { code: 'MKT Field', aliases: ['MKT Field', 'Marketing Field'] },
    { code: 'DBS', aliases: ['DBS', 'Digital Business Solutions'] }
  ];
  /** Tabla Función → HRBP: los códigos de arriba + lo que el usuario guardó/aprendió (HRBP y alias extra). */
  function functionTable(saved) {
    const out = FUNCTIONS.map((f) => ({ code: f.code, hrbp: '', aliases: f.aliases.slice() }));
    (saved || []).forEach((s) => {
      if (!s || !str(s.code)) return;
      let e = out.find((x) => hkey(x.code) === hkey(s.code));
      if (!e) { e = { code: str(s.code), hrbp: '', aliases: [str(s.code)] }; out.push(e); }
      if (str(s.hrbp)) e.hrbp = str(s.hrbp);
      (s.aliases || []).forEach((a) => { if (str(a) && !e.aliases.some((x) => hkey(x) === hkey(a))) e.aliases.push(str(a)); });
    });
    return out;
  }
  /** "Marketing Office" → "MKT Office"; "00000000" / "#N/A" → ''; una función desconocida se deja tal cual. */
  function normFunction(raw, table) {
    const k = hkey(raw);
    if (!k || /^0+$/.test(k) || /^#?na$/.test(k) || /^\d+$/.test(k)) return '';
    const e = (table || functionTable()).find((x) => hkey(x.code) === k || x.aliases.some((a) => hkey(a) === k));
    return e ? e.code : str(raw);
  }
  function hrbpFor(code, table) {
    if (!code) return '';
    const e = (table || []).find((x) => hkey(x.code) === hkey(code));
    return e ? e.hrbp : '';
  }
  /** Función sugerida a partir de la unidad organizativa / centro de coste de la MAE (se marca para confirmar). */
  const FUNCTION_HINTS = [
    ['HR', /human res|recursos humanos|\bhr\b|nomina|payroll|compensac|talent/],
    ['LEX', /legal|juridic/],
    ['CORA', /corporate affairs|asuntos corp|regulator|comunicacion/],
    ['DBS', /analytics|\bdbs\b|business solution/],
    ['IDT', /information tech|\bidt\b|\bit\b|tecnologia|sistemas/],
    ['FIN', /financ|finanz|\bfin\b|contab|accounting|tesorer|treasury|\btax\b|fiscal|controller/],
    ['EXEC', /directory|direccion general|general manag|managing director|\bgm\b/],
    ['OPS', /operation|operacion|leaf|manufact|planta|warehouse|almacen|logist|supply|procure|indirect|export|mainten|quality|calidad|\bglt\b|\blgt\b|desvenado/],
    ['MKT Office', /marketing|tm&d|trade|brand|commercial|comercial|ventas|sales|expats|central ?america|\brtm\b/]
  ];
  function suggestFunction(m) {
    if (!m) return '';
    const txt = norm([m.uo, m.cecoDesc, m.pos, m.sub].filter(Boolean).join(' | ')).replace(/´/g, "'");
    const hit = FUNCTION_HINTS.find(([, re]) => re.test(txt));
    return hit ? hit[0] : '';
  }
  /** HRBP por función a partir de archivos ya trabajados (mayoría por función) y de tablas Función → HRBP explícitas. */
  function learnFunctionHrbp(records, pairs, table) {
    const t = table || functionTable();
    const votes = {};
    (records || []).forEach((r) => {
      if (!r.hrbp || !r.func || r.funcWeak) return;
      const code = normFunction(r.func, t);
      if (!code) return;
      const h = str(r.hrbp);
      if (/\//.test(h)) return; // "Nombre A / Nombre B": no es un solo HRBP
      votes[code] = votes[code] || {};
      votes[code][h] = (votes[code][h] || 0) + 1 + (r.order || 0) / 1e7; // a igualdad, el más reciente
    });
    const out = {};
    Object.entries(votes).forEach(([code, v]) => { out[code] = { hrbp: Object.keys(v).sort((a, b) => v[b] - v[a])[0], from: 'archivos' }; });
    (pairs || []).forEach((p) => { const code = normFunction(p.func, t); if (code && str(p.hrbp)) out[code] = { hrbp: str(p.hrbp), from: 'tabla' }; });
    return out;
  }

  // ---------- Fuentes de información (Histórico / Directorio / MAE) ----------
  /** MAE (reporte de personal de SAP HR): solo se conservan nombre, número, CeCo y unidad organizativa. */
  function readMae(rows, h, label) {
    const H = (rows[h] || []).map(norm);
    const find = (re) => H.findIndex((x) => re.test(x));
    const posCols = H.map((x, i) => (x === 'posicion' ? i : -1)).filter((i) => i >= 0);
    const c = {
      id: find(/^n[º°o]?\.? ?pers/), full: find(/^numero de personal$/), nombre: H.indexOf('nombre'), ap1: find(/^apellido pat/), ap2: find(/^segundo apellido/),
      ceco: H.indexOf('ce.coste') >= 0 ? H.indexOf('ce.coste') : find(/^ce\.? ?coste$|^kostl$/), cecoDesc: find(/^centro de coste$/),
      soc: find(/^soc\.?$/), uo: find(/^unidad organizativa$/), sub: find(/^subdivision de persona/), pos: posCols.length > 1 ? posCols[1] : posCols[0] === undefined ? -1 : posCols[0]
    };
    const v = (r, i) => (i >= 0 ? str(r[i]) : '');
    const out = [];
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const id = v(r, c.id).replace(/\.0+$/, '').replace(/^0+/, '');
      const sur = [v(r, c.ap1), v(r, c.ap2)].filter(Boolean).join(' ');
      const given = v(r, c.nombre);
      const name = sur && given ? sur + ', ' + given : v(r, c.full);
      if (!name) continue;
      out.push({
        kind: 'mae', name, ids: id ? [id] : [], ceco: v(r, c.ceco).toUpperCase(), cecoDesc: v(r, c.cecoDesc), soc: v(r, c.soc),
        uo: v(r, c.uo), sub: v(r, c.sub), pos: v(r, c.pos), seq: i, source: label
      });
    }
    return out;
  }
  /**
   * Lee un archivo de apoyo y dice qué es:
   *  - MAE: { kind: 'mae', records } (CeCo oficial y unidad organizativa por persona)
   *  - Tabla Función → HRBP (como la "Sheet1" del Sent): { kind: 'map', pairs }
   *  - Histórico / Retrieved / Sent ya trabajado: { kind: 'people', records }
   */
  function readSources(rows, label) {
    const h = Core.findHeaderRow(rows, ['CeCo', 'Ceco', 'HRBP', 'Home Function', 'Homefunction', 'Gross Amount', 'Tipo', 'Servicio', 'Nombre', 'Name', 'Year', 'Mes', 'Ce.coste', 'Nº pers.', 'Assignee Name'], 30);
    if (h < 0) return { kind: 'none', records: [], pairs: [] };
    const hd = rows[h] || [];
    const H = hd.map(norm);
    if (H.includes('ce.coste') || (H.some((x) => /^n[º°o]?\.? ?pers/.test(x)) && H.some((x) => /^centro de coste$/.test(x)))) {
      return { kind: 'mae', records: readMae(rows, h, label), pairs: [] };
    }
    const hrbp = Core.findCol(hd, ['HRBP']);
    const func = funcCol(hd);
    let name = Core.findCol(hd, ['Assignee Name', 'Nombre', 'Name', 'Colaborador', 'Employee'], ['hrbp', 'manager', 'superior', 'reporta', 'full name']);
    // Tabla Función → HRBP: solo esas dos columnas, sin nombres de colaboradores
    if (hrbp >= 0 && func >= 0 && name < 0) {
      const pairs = [];
      for (let i = h + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        if (str(r[func]) && str(r[hrbp])) pairs.push({ func: str(r[func]), hrbp: str(r[hrbp]) });
      }
      if (pairs.length && pairs.length <= 60) return { kind: 'map', records: [], pairs };
    }
    if (name < 0) name = 0;
    const weakFunc = func < 0 ? Core.findCol(hd, ['Area2', 'Area']) : -1;
    const c = {
      hrbp, func: func >= 0 ? func : weakFunc, weak: func < 0 && weakFunc >= 0, ceco: cecoCol(hd), cecoOf: Core.findCol(hd, [/ceco oficial/, /ceco mae/]),
      ids: idCols(hd), year: Core.findCol(hd, ['Year', 'Año', 'Ano']), mes: Core.findCol(hd, ['Mes', 'Month'])
    };
    const out = [];
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const nm = str(r[name]);
      if (!nm || /^(grand )?total/.test(norm(nm))) continue;
      const rec = {
        kind: 'people', name: nm, ids: rowIds(r, c.ids), hrbp: c.hrbp >= 0 ? str(r[c.hrbp]) : '', func: c.func >= 0 ? str(r[c.func]) : '', funcWeak: c.weak,
        ceco: c.ceco >= 0 ? str(r[c.ceco]).toUpperCase() : '', cecoOf: c.cecoOf >= 0 ? str(r[c.cecoOf]).toUpperCase() : '',
        order: (c.year >= 0 ? (parseNum(r[c.year]) || 0) * 100 : 0) + (c.mes >= 0 ? parseNum(r[c.mes]) || 0 : 0), seq: i, source: label
      };
      if (/^#n\/?a|^0+$/.test(norm(rec.func))) rec.func = '';
      if (/^#n\/?a|^0$/.test(norm(rec.ceco))) rec.ceco = '';
      if (rec.hrbp || rec.func || rec.ceco) out.push(rec);
    }
    return { kind: 'people', records: out, pairs: [] };
  }
  /** Compatibilidad: solo los registros de personas. */
  function readSource(rows, label) { return readSources(rows, label).records; }

  /** Puntaje de coincidencia: el número de empleado manda (si además comparte un nombre o apellido); si no, el nombre. */
  function matchScore(name, ids, rec) {
    if (ids && ids.length && rec.ids && rec.ids.length && rec.ids.some((x) => ids.includes(x))) {
      const a = new Set(Core.nameTokens(name));
      if (Core.nameTokens(rec.name).some((t) => a.has(t))) return { score: 1.05, how: 'número de empleado' };
    }
    const sc = Core.nameScore(name, rec.name);
    return { score: sc, how: sc >= 1 ? 'nombre' : 'nombre (parcial)' };
  }
  /** Índice por palabra del nombre y por número de empleado (la MAE tiene miles de personas). */
  function indexPeople(recs) {
    const byTok = new Map(), byId = new Map();
    recs.forEach((r) => {
      Core.nameTokens(r.name).forEach((t) => { if (!byTok.has(t)) byTok.set(t, []); byTok.get(t).push(r); });
      (r.ids || []).forEach((x) => { if (!byId.has(x)) byId.set(x, []); byId.get(x).push(r); });
    });
    return { recs, byTok, byId };
  }
  /** Candidatos: comparten al menos una palabra exacta del nombre o el número de empleado. */
  function candidates(ix, name, ids) {
    if (!ix || !ix.byTok) return ix || [];
    const set = new Set();
    Core.nameTokens(name).forEach((t) => (ix.byTok.get(t) || []).forEach((r) => set.add(r)));
    (ids || []).forEach((x) => (ix.byId.get(x) || []).forEach((r) => set.add(r)));
    return Array.from(set);
  }
  /** Mejor coincidencia; a igualdad, la fuente con más prioridad y luego el registro más reciente. */
  function findPerson(name, sources, ids) {
    let best = null;
    for (const s of candidates(sources, name, ids)) {
      const m = matchScore(name, ids, s);
      if (m.score < 0.6) continue;
      const better = !best || m.score > best.score || (m.score === best.score && ((s.priority || 0) > (best.rec.priority || 0) ||
        ((s.priority || 0) === (best.rec.priority || 0) && ((s.order || 0) > (best.rec.order || 0) || ((s.order || 0) === (best.rec.order || 0) && (s.seq || 0) > (best.rec.seq || 0))))));
      if (better) best = { score: m.score, how: m.how, rec: s };
    }
    return best;
  }
  /** En la MAE solo se acepta una persona: si dos empatan por nombre, no se adivina. */
  function findMae(name, mae, ids) {
    let best = null, tie = false;
    for (const s of candidates(mae, name, ids)) {
      const m = matchScore(name, ids, s);
      if (m.score < 0.85) continue;
      if (!best || m.score > best.score) { best = { score: m.score, how: m.how, rec: s }; tie = false; } else if (m.score === best.score && s.ids[0] !== best.rec.ids[0]) tie = true;
    }
    return best && !(tie && best.score <= 1) ? best : null;
  }

  /**
   * Completa Home Function, HRBP, CeCo y Ceco Oficial para cada cargo.
   *  - Función: la del archivo, si no la del historial (Retrieved / Sent anteriores / Histórico), convertida a código
   *    (Marketing Office → MKT Office); si no hay, se sugiere con la MAE y se marca para confirmar.
   *  - HRBP: según la tabla Función → HRBP; si la función no está en la tabla, el del historial.
   *  - CeCo: el del archivo o el más reciente del historial; si no hay, el de la MAE marcado "Confirmar CeCo".
   *  - Ceco Oficial: el de la MAE (para comparar).
   * opts: { mae: [], functions: tabla guardada, cecos, sociedad }
   */
  function enrich(supplier, histRecords, dirRecords, opts) {
    opts = opts || {};
    const table = functionTable(opts.functions);
    const people = (dirRecords || []).filter((r) => r.kind !== 'mae').map((r) => Object.assign({ priority: 2 }, r))
      .concat((histRecords || []).filter((r) => r.kind !== 'mae').map((r) => Object.assign({ priority: 1 }, r)));
    const mae = (opts.mae || []).concat((dirRecords || []).filter((r) => r.kind === 'mae'));
    // Descripción de cada CeCo según la MAE ("Ops - Finance") para sugerir la función de quien no está en la MAE
    const cecoDesc = {};
    mae.forEach((m) => { if (m.ceco && m.cecoDesc && !cecoDesc[m.ceco]) cecoDesc[m.ceco] = m.cecoDesc; });
    const ixMae = indexPeople(mae);
    const ixField = {
      hrbp: indexPeople(people.filter((s) => s.hrbp)), func: indexPeople(people.filter((s) => s.func && !s.funcWeak)),
      ceco: indexPeople(people.filter((s) => s.ceco)), weak: indexPeople(people.filter((s) => s.func && s.funcWeak))
    };
    const c = supplier.cols;
    const cache = {};
    return supplier.data.map((d) => {
      const ids = rowIds(d.raw, c.ids);
      const key = d.name + '|' + ids.join(',');
      if (!cache[key]) {
        const o = { hrbp: '', func: '', ceco: '', cecoOf: '', weakFunc: '', weakFrom: '', score: 0, matchedName: '', how: '', from: {}, mae: null };
        ['hrbp', 'func', 'ceco'].forEach((f) => {
          const m = findPerson(d.name, ixField[f], ids);
          if (m) { o[f] = m.rec[f]; o.from[f] = m.rec.source; o.score = Math.max(o.score, m.score); o.matchedName = o.matchedName || m.rec.name; o.how = o.how || m.how; }
        });
        // La columna "Area2" del Histórico se calcula con el CeCo y no está actualizada: solo como último recurso
        const w = findPerson(d.name, ixField.weak, ids);
        if (w) { o.weakFunc = w.rec.func; o.weakFrom = w.rec.source; }
        const mm = mae.length ? findMae(d.name, ixMae, ids) : null;
        if (mm) { o.mae = { name: mm.rec.name, id: mm.rec.ids[0] || '', how: mm.how, uo: mm.rec.uo, cecoDesc: mm.rec.cecoDesc, rec: mm.rec }; o.cecoOf = mm.rec.ceco; }
        cache[key] = o;
      }
      const base = cache[key];
      const out = Object.assign({}, base, { from: Object.assign({}, base.from), flags: [] });
      // Lo que ya trae el propio archivo (Retrieved / Sent trabajado) se respeta
      if (c.hrbp >= 0 && str(d.raw[c.hrbp])) { out.hrbp = str(d.raw[c.hrbp]); out.from.hrbp = 'archivo'; }
      if (c.func >= 0 && str(d.raw[c.func])) { out.func = str(d.raw[c.func]); out.from.func = 'archivo'; }
      if (c.ceco >= 0 && str(d.raw[c.ceco])) { out.ceco = str(d.raw[c.ceco]).toUpperCase(); out.from.ceco = 'archivo'; }
      if (c.cecoOf >= 0 && str(d.raw[c.cecoOf])) out.cecoOf = str(d.raw[c.cecoOf]).toUpperCase();
      // Función como código; si no hay historial: MAE de la persona → descripción del CeCo en la MAE → "Area2" del Histórico
      out.func = normFunction(out.func, table);
      if (!out.func) {
        const ce = out.ceco || out.cecoOf;
        const viaMae = out.mae ? suggestFunction(out.mae.rec) : '';
        const viaCeco = !viaMae && ce && cecoDesc[ce] ? suggestFunction({ cecoDesc: cecoDesc[ce] }) : '';
        const viaWeak = !viaMae && !viaCeco ? normFunction(out.weakFunc, table) : '';
        const sug = viaMae || viaCeco || (table.some((x) => x.code === viaWeak) ? viaWeak : '');
        if (sug) {
          out.func = sug;
          out.from.func = viaMae ? 'MAE (sugerida)' : viaCeco ? 'CeCo en la MAE (sugerida)' : out.weakFrom + ' (Area)';
          // La de la MAE/CeCo se revisa en la app (no se pinta en el Excel); la del "Area2" del Histórico sí se marca
          out.flags.push({ field: 'func', file: !viaMae && !viaCeco, text: 'Confirmar función (' + (viaMae ? 'sugerida por la MAE' : viaCeco ? 'según el CeCo ' + ce + ': ' + cecoDesc[ce] : 'según el Area2 del Histórico') + ')' });
        }
      }
      // HRBP según la función
      const byFn = hrbpFor(out.func, table);
      out.hrbpByTable = false;
      if (byFn && out.from.hrbp !== 'archivo') { out.hrbp = byFn; out.from.hrbp = 'tabla Función → HRBP'; out.hrbpByTable = true; }
      // CeCo: si no hay historial, el oficial de la MAE, pendiente de confirmar
      if (!out.ceco && out.cecoOf) { out.ceco = out.cecoOf; out.from.ceco = 'MAE'; out.flags.push({ field: 'ceco', text: 'Confirmar CeCo (tomado de la MAE, no hay historial)' }); }
      if (!out.ceco) out.flags.push({ field: 'ceco', text: 'Confirmar CeCo (no hay historial ni MAE)' });
      else if (opts.cecos) {
        const v = validateCeco(out.ceco, opts.cecos, opts.sociedad || 'MX15');
        if (v.status !== 'OK') out.flags.push({ field: 'ceco', text: 'Confirmar CeCo: ' + v.text });
      }
      out.cecoDiff = !!(out.ceco && out.cecoOf && out.ceco !== out.cecoOf);
      // Coincidencia con la MAE solo por parte del nombre (p. ej. falta un apellido): se revisa en la app, no se pinta
      if (out.mae && out.mae.how === 'nombre (parcial)' && !(c.cecoOf >= 0 && str(d.raw[c.cecoOf]))) {
        out.flags.push({ field: 'cecoOf', file: false, text: 'Ceco Oficial de la MAE por nombre parecido: ' + out.mae.name + ' (verifica que sea la misma persona)' });
      }
      if (!out.func) out.flags.push({ field: 'func', text: 'Falta la función' });
      if (!out.hrbp) out.flags.push({ field: 'hrbp', text: 'Falta el HRBP' });
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
      const sv = str(r[soc]).toUpperCase();
      if (!map[k]) map[k] = sv;
      else if (sv && !map[k].split('/').includes(sv)) map[k] += '/' + sv; // CeCo dado de alta en más de una sociedad
    }
    return { map, cecoCol: ceco, socCol: soc, count: Object.keys(map).length };
  }
  function validateCeco(ceco, cecos, sociedad) {
    const k = str(ceco).toUpperCase();
    if (!k) return { status: 'VACIO', text: 'Sin CeCo', soc: '' };
    if (!cecos) return { status: 'SIN_CATALOGO', text: 'Sin catálogo', soc: '' };
    const soc = cecos.map[k];
    if (soc === undefined) return { status: 'NO_EXISTE', text: 'No existe en All CeCos', soc: '' };
    const target = String(sociedad).toUpperCase();
    if (!soc.split('/').includes(target)) return { status: 'OTRA_SOC', text: 'Pertenece a ' + soc + ' (debe ser ' + sociedad + ')', soc };
    return { status: 'OK', text: target, soc: target };
  }

  // ---------- Libros de salida ----------
  /**
   * "Sent to HRBPs - MX15 [Proveedor].xlsx" con el formato que se envía a los HRBPs:
   *  - el archivo original del proveedor con 4 columnas a la derecha del nombre: Home Function, HRBP, CeCo y Ceco Oficial;
   *  - HRBP calculado con la hoja "HRBP por funcion" (si cambias la función, cambia el HRBP);
   *  - ordenado por HRBP, periodo y nombre;
   *  - amarillo + nota solo en lo que falta confirmar (sin colores ni leyendas extra). La función sugerida por la MAE
   *    no se pinta: se revisa en la vista previa de la app antes de enviar.
   */
  const SENT_COLS = [
    { add: 'func', header: 'Home Function', width: 16 },
    { add: 'hrbp', header: 'HRBP', width: 20 },
    { add: 'ceco', header: 'CeCo', width: 14 },
    { add: 'cecoOf', header: 'Ceco Oficial', width: 14 }
  ];
  const MAP_SHEET = 'HRBP por funcion';
  function sentOrder(supplier, enriched) {
    const c = supplier.cols;
    const idx = supplier.data.map((_, k) => k);
    const per = (k) => (c.period >= 0 ? monthOf(supplier.data[k].raw[c.period]) : 0);
    return idx.sort((a, b) => {
      const ha = norm(enriched[a].hrbp), hb = norm(enriched[b].hrbp);
      if (ha !== hb) return !ha ? 1 : !hb ? -1 : ha.localeCompare(hb);
      const pa = per(a), pb = per(b);
      if (pa !== pb) return pa - pb;
      const na = norm(supplier.data[a].name), nb = norm(supplier.data[b].name);
      if (na !== nb) return na.localeCompare(nb);
      return a - b;
    });
  }
  async function buildSentToHRBP(supplier, enriched, p) {
    p = p || {};
    const wb = Core.newWorkbook();
    const C = Core.COLORS;
    const ws = wb.addWorksheet(p.sociedad || 'MX15', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
    const nameCol = supplier.cols.name;
    const sc = supplier.cols;
    const skip = new Set([sc.hrbp, sc.func, sc.ceco, sc.cecoOf, sc.validation].filter((i) => i >= 0));
    const origIdx = supplier.header.map((_, i) => i).filter((i) => !skip.has(i));
    const plan = [];
    origIdx.forEach((i) => {
      plan.push({ src: i, header: Core.isBlank(supplier.header[i]) ? '' : supplier.header[i] });
      if (i === nameCol) SENT_COLS.forEach((x) => plan.push(Object.assign({}, x)));
    });
    // Tabla Función → HRBP (para que el HRBP siga a la función)
    const table = functionTable(p.functions).filter((f) => f.hrbp);
    const mapRows = table.length + 1;
    const col = (key) => plan.findIndex((x) => x.add === key) + 1;
    const fnLetter = Core.colLetter(col('func') - 1);
    const SEL = 'FFFFFF00', LOOK = 'FF93CDDD', GREY = 'FFF2F2F2', ADDHEAD = 'FF1F497D';
    const hr = ws.getRow(1);
    plan.forEach((x, j) => { hr.getCell(j + 1).value = x.header; });
    Core.styleHeader(hr, C.blue);
    plan.forEach((x, j) => { if (x.add) hr.getCell(j + 1).fill = Core.fill(ADDHEAD); });
    hr.height = 29;
    const order = p.sort === false ? supplier.data.map((_, k) => k) : sentOrder(supplier, enriched);
    order.forEach((k, pos) => {
      const d = supplier.data[k];
      const e = enriched[k];
      const r = pos + 2;
      const row = ws.getRow(r);
      const flagged = {};
      (e.flags || []).filter((f) => f.file !== false).forEach((f) => { (flagged[f.field] = flagged[f.field] || []).push(f.text); });
      plan.forEach((x, j) => {
        const cell = row.getCell(j + 1);
        cell.border = Core.BORDER;
        if (!x.add) { const v = d.raw[x.src]; cell.value = v === undefined ? null : v; return; }
        const v = e[x.add] || '';
        if (x.add === 'hrbp' && e.hrbpByTable && table.length) {
          cell.value = { formula: 'IFERROR(INDEX(\'' + MAP_SHEET + '\'!$B$2:$B$' + mapRows + ',MATCH(' + fnLetter + r + ',\'' + MAP_SHEET + '\'!$A$2:$A$' + mapRows + ',0)),"")', result: v };
        } else cell.value = v || null;
        if (x.add === 'func' || x.add === 'hrbp') cell.fill = Core.fill(LOOK);
        if (x.add === 'cecoOf') { cell.fill = Core.fill(GREY); cell.numFmt = '@'; }
        if (flagged[x.add]) { cell.fill = Core.fill(SEL); cell.note = flagged[x.add].join('\n'); }
      });
    });
    plan.forEach((x, j) => {
      ws.getColumn(j + 1).width = x.add ? x.width : (j === plan.findIndex((y) => y.src === nameCol) ? 32 : Math.min(40, Math.max(10, String(x.header || '').length + 4)));
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: supplier.data.length + 1, column: plan.length } };
    if (table.length) {
      const m = wb.addWorksheet(MAP_SHEET);
      Core.writeTable(m, 1, [{ header: 'Home Function', width: 18 }, { header: 'HRBP', width: 28 }], table.map((f) => [f.code, f.hrbp]));
    }
    return wb;
  }

  /** Archivo validado: agrega la columna Validation (sociedad) y Estatus con colores. */
  async function buildValidated(supplier, enriched, cecos, p) {
    const wb = Core.newWorkbook();
    const C = Core.COLORS;
    const ws = wb.addWorksheet('Validación', { views: [{ state: 'frozen', ySplit: 1 }] });
    const cols = [
      { header: 'Assignee Name', width: 32 }, { header: 'Home Function', width: 16 }, { header: 'HRBP', width: 22 }, { header: 'CeCo', width: 14 }, { header: 'Ceco Oficial', width: 14 },
      { header: 'Validation', width: 12 }, { header: 'Estatus', width: 34 }, { header: 'Monto', width: 13, numFmt: '#,##0.00' }, { header: 'Servicio', width: 40 }
    ];
    const rows = supplier.data.map((d, k) => {
      const e = enriched[k];
      const v = validateCeco(e.ceco, cecos, p.sociedad);
      return [d.name, e.func, e.hrbp, e.ceco, e.cecoOf || '', v.soc, v.status === 'OK' ? 'OK' : v.text, supplier.cols.amount >= 0 ? parseNum(d.raw[supplier.cols.amount]) : null, supplier.cols.service >= 0 ? str(d.raw[supplier.cols.service]) : '', v.status];
    });
    Core.writeTable(ws, 1, cols, rows, {
      autoFilter: true,
      rowStyle: (row, r) => {
        const ok = r[9] === 'OK';
        [6, 7].forEach((c) => { const cell = row.getCell(c); cell.fill = Core.fill(ok ? C.green : C.red); cell.font = { color: { argb: ok ? C.greenTx : C.redTx }, bold: !ok }; });
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
    // Mismo acomodo que la Reclasificación que se envía a Planning
    lbl(2, 'Sociedad', ' ' + (p.sociedad || 'MX15'));
    lbl(3, 'Cuenta', p.account || '5001208100 Other Staff Costs - Expat Recharge Exp');
    lbl(4, 'Centro de costos', p.sourceCeco || 'MXCB7B0016 HR Recharges');
    lbl(6, 'Year', Number(p.year));
    lbl(7, 'Tipo', p.provider);
    lbl(8, 'Mes', Number(p.month));
    const piv = pivotByCeco(result.ok);
    Core.writeTable(ws, 10, [
      { header: 'Row Labels', width: 26 }, { header: 'Sum of Gross-Amount MXN', width: 24, numFmt: '"$"#,##0.00', total: true }
    ], piv.map((r) => [r.ceco, Core.round(r.mxn, 2)]), { totals: true, totalsLabel: 'Grand Total' });
    ws.getCell(2, 4).value = 'Tipo de cambio: ' + (p.exRate ? Core.round(p.exRate, 6) : 'N/D') + ' · el detalle en GBP está en la hoja "Detalle"';
    ws.getCell(2, 4).font = { italic: true, size: 9, color: { argb: 'FF595959' } };
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
        'Nota: En la columna CeCo agregué el que tenemos como histórico y en "Ceco Oficial" el que tiene la persona en SAP (MAE), como referencia. Las celdas en amarillo son las que necesitamos que nos confirmen. Si planean proporcionarnos otros CeCos, favor de validar que pertenezcan a la Sociedad ' + p.sociedad + '.\n\nQuedo atento a cualquier duda.\n\nSaludos.'
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
    detectSupplier, readSource, readSources, readMae, findPerson, findMae, enrich, readCecos, validateCeco, buildSentToHRBP, buildValidated,
    FUNCTIONS, functionTable, normFunction, hrbpFor, suggestFunction, learnFunctionHrbp, monthOf, rowIds, idCols,
    readKSB1, exRateFrom, buildHistoricRows, pivotByCeco, buildReclassWorkbook, buildHistoricPaste,
    emailToHRBPs, emailInvalidCecos, emailReclass, evidenceChecklist, supplierFolder, supplierRelPath
  };
});
