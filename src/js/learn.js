/* Aprendizaje desde Bulk: con los archivos del año la app deduce cómo se trabaja cada proveedor y quién es quién.
 *  - Directorio de personas: HRBP, Home Function y CeCo más recientes (de los Retrieved y del Histórico).
 *  - Regla por proveedor: compara el archivo original del proveedor contra lo registrado en el Histórico del mismo
 *    mes y deduce qué columna(s) son el monto, si cada cargo se separa en renglones (servicio + "Disbursements"),
 *    qué columna es el servicio (o cómo se traduce) y si se usó otro tipo de cambio.
 *  - Tipos de cambio registrados por proveedor y mes.
 * Nada se inventa: cada regla trae cuántos cargos coincidieron; si no hay coincidencias suficientes, no se propone. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./reclass.js'));
  else root.Learn = factory(root.Core, root.Reclass);
})(typeof self !== 'undefined' ? self : this, function (Core, RC) {
  'use strict';
  const { norm, str, parseNum } = Core;
  const TOL = 0.005; // 0.5 %

  const close = (a, b) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * TOL);
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  /** Columnas numéricas candidatas a monto (en libras o el monto principal). */
  function amountCandidates(header, rows) {
    const out = [];
    header.forEach((h, i) => {
      const n = norm(h);
      if (!n || !/amount|importe|monto|total|gbp|fee|tax|vat|disburse/.test(n) || /rate|percent|number|count|code|id$/.test(n)) return;
      const nums = rows.filter((r) => typeof r[i] === 'number' || parseNum(r[i]) !== null).length;
      if (nums >= Math.max(1, rows.length * 0.5)) out.push(i);
    });
    return out;
  }
  const textCols = (header, rows) => header.map((h, i) => i).filter((i) => rows.some((r) => typeof r[i] === 'string' && r[i].trim().length > 2 && parseNum(r[i]) === null));

  /**
   * Compara un archivo de proveedor con lo registrado (Histórico) para las mismas personas.
   * sup: {header, rows, nameCol} · hist: [{name, gbp, servicio}]
   */
  function inferRule(sup, hist) {
    const persons = sup.rows.map((r) => str(r[sup.nameCol])).filter(Boolean);
    const relevant = hist.filter((h) => persons.some((p) => Core.nameScore(p, h.name) >= 0.9));
    if (relevant.length < 3) return null;
    const byPerson = (rec) => sup.rows.filter((r) => Core.nameScore(str(r[sup.nameCol]), rec.name) >= 0.9);
    const cands = amountCandidates(sup.header, sup.rows);
    const val = (r, i) => (typeof r[i] === 'number' ? r[i] : parseNum(r[i]) || 0);
    const results = [];
    // 1) Una columna = un renglón
    cands.forEach((i) => {
      let ok = 0;
      relevant.forEach((h) => { if (byPerson(h).some((r) => close(val(r, i), h.gbp))) ok++; });
      results.push({ mode: 'column', cols: [i], score: ok / relevant.length, matched: ok });
    });
    // 2) Cada cargo se separa en dos renglones (p. ej. honorario + "Disbursements")
    cands.forEach((i) => cands.forEach((j) => {
      if (i >= j) return;
      let ok = 0;
      relevant.forEach((h) => { if (byPerson(h).some((r) => close(val(r, i), h.gbp) || close(val(r, j), h.gbp))) ok++; });
      // solo vale si ambas columnas aportan coincidencias
      const ci = relevant.filter((h) => byPerson(h).some((r) => close(val(r, i), h.gbp))).length;
      const cj = relevant.filter((h) => byPerson(h).some((r) => close(val(r, j), h.gbp))).length;
      if (ci && cj) results.push({ mode: 'split', cols: [i, j], score: ok / relevant.length, matched: ok });
    }));
    // 3) Suma de dos columnas en un renglón
    cands.forEach((i) => cands.forEach((j) => {
      if (i >= j) return;
      let ok = 0;
      relevant.forEach((h) => { if (byPerson(h).some((r) => close(val(r, i) + val(r, j), h.gbp))) ok++; });
      results.push({ mode: 'sum', cols: [i, j], score: ok / relevant.length, matched: ok });
    }));
    results.sort((a, b) => b.score - a.score || (a.mode === 'column' ? -1 : 1));
    let best = results[0];
    // 4) Proporcional (mismo cargo con otro tipo de cambio)
    if (!best || best.score < 0.6) {
      let prop = null;
      cands.forEach((i) => {
        const ratios = [];
        relevant.forEach((h) => { const rs = byPerson(h).map((r) => val(r, i)).filter((v) => v > 0); if (rs.length === 1) ratios.push(h.gbp / rs[0]); });
        if (ratios.length < 3) return;
        // La columna debe variar entre cargos y el factor debe parecer un cambio de tipo de cambio
        if (new Set(sup.rows.map((r) => val(r, i))).size < 3) return;
        const m = median(ratios);
        if (!(m >= 0.5 && m <= 2)) return;
        const inBand = ratios.filter((x) => Math.abs(x - m) <= Math.abs(m) * 0.01).length;
        const sc = inBand / relevant.length;
        if (!prop || sc > prop.score) prop = { mode: 'proportional', cols: [i], factor: m, score: sc, matched: inBand };
      });
      if (prop && prop.score >= 0.6 && (!best || prop.score > best.score)) best = prop;
    }
    if (!best || best.score < 0.6) return { found: false, compared: relevant.length, best: best ? describe(sup.header, best) : null };
    // Servicio: columna cuyo texto coincide con el "Servicio" registrado; si no, tabla de traducción aprendida
    const matchedPairs = [];
    relevant.forEach((h) => {
      const rows = byPerson(h);
      for (const r of rows) {
        const hit = best.mode === 'proportional' ? close(val(r, best.cols[0]) * best.factor, h.gbp)
          : best.mode === 'sum' ? close(val(r, best.cols[0]) + val(r, best.cols[1]), h.gbp)
          : best.cols.some((c) => close(val(r, c), h.gbp));
        if (hit) { matchedPairs.push({ r, h, which: best.mode === 'split' ? (close(val(r, best.cols[0]), h.gbp) ? 0 : 1) : 0 }); break; }
      }
    });
    let serviceCol = -1, sScore = 0;
    textCols(sup.header, sup.rows).filter((i) => i !== sup.nameCol).forEach((i) => {
      const okc = matchedPairs.filter((p) => p.which === 0 && norm(p.r[i]) && norm(p.r[i]) === norm(p.h.servicio)).length;
      const tot = matchedPairs.filter((p) => p.which === 0).length || 1;
      if (okc / tot > sScore) { sScore = okc / tot; serviceCol = i; }
    });
    const serviceMap = {};
    let mapFrom = -1;
    if (sScore < 0.8) {
      // ¿Qué columna explica mejor el servicio registrado? (cada valor se traduce siempre igual)
      // La columna que traduce mejor: más coincidencias y, a igualdad, menos valores distintos (generaliza).
      // Nunca la del nombre de la persona.
      let bestCons = 0, bestKeys = Infinity;
      textCols(sup.header, sup.rows).filter((i) => i !== sup.nameCol).forEach((i) => {
        const m = {}; let cons = 0;
        matchedPairs.filter((p) => p.which === 0).forEach((p) => { const k = str(p.r[i]); if (!k) return; (m[k] = m[k] || {}); m[k][p.h.servicio] = (m[k][p.h.servicio] || 0) + 1; });
        Object.values(m).forEach((v) => { cons += Math.max(...Object.values(v)); });
        const keys = Object.keys(m).length;
        if (cons > bestCons || (cons === bestCons && keys < bestKeys)) { bestCons = cons; bestKeys = keys; mapFrom = i; }
      });
      if (mapFrom >= 0) matchedPairs.filter((p) => p.which === 0).forEach((p) => { const k = str(p.r[mapFrom]); if (k && !serviceMap[k]) serviceMap[k] = p.h.servicio; });
    }
    const second = best.mode === 'split' ? (() => { const names = matchedPairs.filter((p) => p.which === 1).map((p) => p.h.servicio); const c = {}; names.forEach((n) => { c[n] = (c[n] || 0) + 1; }); return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || 'Disbursements'; })() : null;
    return Object.assign({ found: true, compared: relevant.length }, describe(sup.header, best), {
      serviceHeader: sScore >= 0.8 ? str(sup.header[serviceCol]) : '', serviceMapFrom: sScore < 0.8 && mapFrom >= 0 ? str(sup.header[mapFrom]) : '', serviceMap: sScore < 0.8 ? serviceMap : {},
      secondService: second
    });
  }
  function describe(header, b) {
    return { mode: b.mode, headers: b.cols.map((c) => str(header[c])), factor: b.factor || null, score: Core.round(b.score, 3), matched: b.matched };
  }
  function explain(provider, rule) {
    const h = (x) => '“' + String(x).replace(/_x([0-9a-f]{4})_/gi, (m, c) => String.fromCharCode(parseInt(c, 16))).replace(/\s+/g, ' ') + '”';
    if (!rule || !rule.found) return provider + ': no encontré una regla clara' + (rule ? ' (comparé ' + rule.compared + ' cargos registrados)' : '') + '.';
    const pct = Math.round(rule.score * 100) + '% de ' + rule.compared + ' cargos';
    let t = provider + ': ';
    if (rule.mode === 'column') t += 'el monto registrado es la columna ' + h(rule.headers[0]);
    else if (rule.mode === 'split') t += 'cada cargo se registra en dos renglones: ' + h(rule.headers[0]) + ' y ' + h(rule.headers[1]) + ' (como “' + rule.secondService + '”)';
    else if (rule.mode === 'sum') t += 'el monto registrado es ' + h(rule.headers[0]) + ' + ' + h(rule.headers[1]);
    else t += 'el monto registrado es ' + h(rule.headers[0]) + ' × ' + Core.round(rule.factor, 4) + ' (otro tipo de cambio)';
    if (rule.serviceHeader) t += '; el servicio es ' + h(rule.serviceHeader);
    else if (rule.serviceMapFrom) t += '; el servicio se traduce desde ' + h(rule.serviceMapFrom) + ' (' + Object.keys(rule.serviceMap).length + ' equivalencias)';
    return t + ' · coincide en ' + pct + '.';
  }

  /** Aprende a partir de los registros de Bulk (records con data.raw para proveedores y data.hist para el Consolidado). */
  function learn(records) {
    const K = { date: Core.stamp(), directory: [], providers: {}, exRates: [], sources: { retrieved: 0, supplier: 0, historico: 0 } };
    // Directorio: lo más reciente por persona
    const dir = {};
    const put = (name, hrbp, func, ceco, order, source) => {
      if (!name) return;
      const k = norm(name);
      const cur = dir[k];
      if (!cur || order >= cur.order) dir[k] = { name, hrbp: hrbp || (cur && cur.hrbp) || '', func: func || (cur && cur.func) || '', ceco: ceco || (cur && cur.ceco) || '', order, source };
      else { if (!cur.hrbp && hrbp) cur.hrbp = hrbp; if (!cur.func && func) cur.func = func; if (!cur.ceco && ceco) cur.ceco = ceco; }
    };
    const hist = [];
    records.forEach((r) => {
      if (r.type === 'consolidado' && r.data && r.data.hist) { K.sources.historico += r.data.hist.length; r.data.hist.forEach((h) => { hist.push(h); put(h.name, '', h.func, h.ceco, (h.year || 0) * 100 + (h.mes || 0), 'Histórico'); }); }
    });
    records.forEach((r) => {
      if (r.type === 'retrieved' && r.data) { K.sources.retrieved++; r.data.rows.forEach((x) => put(x.name, x.hrbp, x.func, x.ceco, (r.ctx.year || 2026) * 100 + (r.ctx.month || 0) + 0.5, 'Retrieved ' + (r.ctx.month ? Core.MESES[r.ctx.month - 1] : ''))); }
    });
    K.directory = Object.values(dir).sort((a, b) => a.name.localeCompare(b.name));
    // Tipos de cambio registrados
    const rates = {};
    hist.forEach((h) => { if (h.exRate > 0 && h.mes) { const k = h.tipo + '|' + h.year + '|' + Math.round(h.mes); (rates[k] = rates[k] || []).push(h.exRate); } });
    K.exRates = Object.entries(rates).map(([k, v]) => { const [tipo, year, mes] = k.split('|'); return { provider: tipo, year: +year, month: +mes, rate: Core.round(median(v), 6) }; }).sort((a, b) => a.year - b.year || a.month - b.month);
    // Reglas por proveedor: archivo original vs Histórico del mismo mes (±1)
    const byProv = {};
    records.filter((r) => r.type === 'supplier' && r.data && r.data.raw && r.ctx.provider).forEach((r) => { K.sources.supplier++; (byProv[r.ctx.provider] = byProv[r.ctx.provider] || []).push(r); });
    Object.entries(byProv).forEach(([prov, files]) => {
      const pool = [];
      files.forEach((f) => {
        const h = hist.filter((x) => norm(x.tipo) === norm(prov) && (!f.ctx.month || Math.abs(Math.round(x.mes) - f.ctx.month) <= 1) && (!f.ctx.year || !x.year || x.year === f.ctx.year));
        const rule = inferRule(f.data.raw, h);
        if (rule) pool.push(Object.assign({ file: f.name, month: f.ctx.month }, rule));
      });
      const found = pool.filter((p) => p.found);
      if (!found.length) { K.providers[prov] = Object.assign({ found: false, files: files.length }, pool[0] || {}); return; }
      // La regla que más se repite entre meses
      const key = (p) => p.mode + '|' + p.headers.join('+');
      const count = {};
      found.forEach((p) => { count[key(p)] = (count[key(p)] || 0) + p.matched; });
      const winner = found.filter((p) => key(p) === Object.keys(count).sort((a, b) => count[b] - count[a])[0]);
      const r0 = winner[0];
      const serviceMap = {};
      winner.forEach((p) => Object.assign(serviceMap, p.serviceMap));
      K.providers[prov] = Object.assign({}, r0, {
        serviceMap, files: files.length, monthsMatched: winner.map((p) => p.month).filter(Boolean),
        compared: winner.reduce((a, p) => a + p.compared, 0), matched: winner.reduce((a, p) => a + p.matched, 0)
      });
      K.providers[prov].score = Core.round(K.providers[prov].matched / Math.max(1, K.providers[prov].compared), 3);
    });
    return K;
  }

  /** Aplica una regla aprendida al archivo del proveedor: agrega columnas "Monto (regla aprendida)" y "Servicio (regla aprendida)". */
  function applyRule(sup, rule) {
    if (!rule || !rule.found) return null;
    const idx = (h) => sup.header.findIndex((x) => norm(x) === norm(h));
    const cols = rule.headers.map(idx);
    if (cols.some((c) => c < 0)) return null;
    const sIdx = rule.serviceHeader ? idx(rule.serviceHeader) : -1;
    const mIdx = rule.serviceMapFrom ? idx(rule.serviceMapFrom) : -1;
    const header = sup.header.concat(['Monto (regla aprendida)', 'Servicio (regla aprendida)']);
    const A = header.length - 2, S = header.length - 1;
    const v = (r, c) => (typeof r[c] === 'number' ? r[c] : parseNum(r[c]) || 0);
    const service = (r) => (sIdx >= 0 ? str(r[sIdx]) : mIdx >= 0 ? (rule.serviceMap[str(r[mIdx])] || str(r[mIdx])) : (sup.cols.service >= 0 ? str(r[sup.cols.service]) : ''));
    const data = [];
    sup.data.forEach((d) => {
      const base = d.raw.slice(0, sup.header.length);
      while (base.length < sup.header.length) base.push(null);
      if (rule.mode === 'split') {
        const a = v(d.raw, cols[0]), b = v(d.raw, cols[1]);
        if (a) data.push({ _row: d._row, name: d.name, raw: base.concat([Core.round(a, 6), service(d.raw)]) });
        if (b) data.push({ _row: d._row, name: d.name, raw: base.concat([Core.round(b, 6), rule.secondService || 'Disbursements']) });
      } else {
        const amt = rule.mode === 'sum' ? v(d.raw, cols[0]) + v(d.raw, cols[1]) : rule.mode === 'proportional' ? v(d.raw, cols[0]) * rule.factor : v(d.raw, cols[0]);
        data.push({ _row: d._row, name: d.name, raw: base.concat([Core.round(amt, 6), service(d.raw)]) });
      }
    });
    return Object.assign({}, sup, { header, data, cols: Object.assign({}, sup.cols, { amount: A, service: S }), learned: true });
  }
  /** Directorio aprendido en el formato que usa la Reclasificación. */
  function directoryRecords(K) {
    return (K && K.directory ? K.directory : []).map((p, i) => ({ name: p.name, hrbp: p.hrbp, func: p.func, ceco: p.ceco, order: p.order, seq: i, source: 'Aprendido (' + p.source + ')' }));
  }
  function rateFor(K, provider, year, month) {
    if (!K || !K.exRates) return null;
    const list = K.exRates.filter((r) => norm(r.provider) === norm(provider) && r.year * 100 + r.month <= year * 100 + month).sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month));
    return list[0] || null;
  }
  /** Combina lo aprendido antes con lo nuevo: no se pierde nada si después se analiza un Bulk más pequeño. */
  function merge(oldK, newK) {
    if (!oldK) return newK;
    const out = { date: newK.date, sources: newK.sources, directory: [], providers: Object.assign({}, oldK.providers || {}), exRates: [] };
    const dir = {};
    (oldK.directory || []).concat(newK.directory || []).forEach((d) => {
      const k = norm(d.name), cur = dir[k];
      if (!cur || (d.order || 0) >= (cur.order || 0)) dir[k] = Object.assign({}, cur || {}, Object.fromEntries(Object.entries(d).filter(([, v]) => v !== '' && v !== null && v !== undefined)));
    });
    out.directory = Object.values(dir).sort((a, b) => a.name.localeCompare(b.name));
    Object.entries(newK.providers || {}).forEach(([prov, r]) => { if (r.found || !out.providers[prov] || !out.providers[prov].found) out.providers[prov] = r; });
    const rates = {};
    (oldK.exRates || []).concat(newK.exRates || []).forEach((r) => { rates[r.provider + '|' + r.year + '|' + r.month] = r; });
    out.exRates = Object.values(rates).sort((a, b) => a.year - b.year || a.month - b.month);
    return out;
  }
  return { learn, merge, inferRule, applyRule, explain, directoryRecords, rateFor };
});
