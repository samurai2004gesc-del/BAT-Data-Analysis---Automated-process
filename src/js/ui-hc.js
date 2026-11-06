/* Pantalla: HC in BPC vs HC Approved */
(function (root) {
  'use strict';
  const { Core, HC, UI } = root;
  const { $, esc } = UI;
  const S = { input: null, app: null, result: null, cfg: null };

  const isoToSerial = (v) => { if (!v) return null; const [y, m, d] = v.split('-').map(Number); return Core.ymdToSerial(y, m, d); };
  const serialToIso = (s) => { const { y, m, d } = Core.serialToYMD(s); return y + '-' + Core.pad(m) + '-' + Core.pad(d); };

  function market() { return $('#hc-market').value; }
  function prof() { return UI.profile(market()); }

  function loadProfileToForm() {
    const p = prof();
    $('#hc-multi').checked = !!p.multiEntity;
    $('#hc-split').checked = !!p.splitMarketing;
    $('#hc-group').value = p.gradeGroupMax || '';
    $('#hc-entname').value = p.entityName || '';
    $('#hc-fieldsub').value = p.fieldSub || '';
    UI.config().hc.market = market();
    UI.saveConfig();
    renderMaps();
  }
  function saveFormToProfile() {
    const p = prof();
    p.multiEntity = $('#hc-multi').checked;
    p.splitMarketing = $('#hc-split').checked;
    p.gradeGroupMax = $('#hc-group').value;
    p.entityName = $('#hc-entname').value;
    p.fieldSub = $('#hc-fieldsub').value;
    const c = UI.config();
    c.hc.sopYear = Number($('#hc-year').value) || c.hc.sopYear;
    c.hc.sopLabel = $('#hc-soplabel').value;
    c.hc.coplanLabel = $('#hc-coplabel').value;
    UI.saveConfig();
  }
  function setYear(y, keepLabels) {
    const c = HC.defaultCutoffs(y);
    $('#hc-c1').value = serialToIso(c.coplanStart);
    $('#hc-c2').value = serialToIso(c.sopLastDay);
    $('#hc-c3').value = serialToIso(c.coplanEndPlus1);
    $('#hc-c4').value = serialToIso(c.coplanLastDay);
    if (!keepLabels) {
      const yy = String(y).slice(-2), y2 = String(Number(y) + 1).slice(-2);
      const mm = new Date().getMonth() + 1;
      $('#hc-soplabel').value = 'SOP' + mm + "'" + yy;
      $('#hc-coplabel').value = "COPLAN'" + y2;
    }
  }
  function buildCfg() {
    const p = prof();
    return {
      market: market(), sopLabel: $('#hc-soplabel').value || 'SOP', coplanLabel: $('#hc-coplabel').value || 'COPLAN',
      cutoffs: { coplanStart: isoToSerial($('#hc-c1').value), sopLastDay: isoToSerial($('#hc-c2').value), coplanEndPlus1: isoToSerial($('#hc-c3').value), coplanLastDay: isoToSerial($('#hc-c4').value) },
      multiEntity: $('#hc-multi').checked, splitMarketing: $('#hc-split').checked, marketingFieldSubfunction: $('#hc-fieldsub').value,
      gradeGroupMax: Number($('#hc-group').value) || null, entityName: $('#hc-entname').value || 'Total',
      funcMapBPC: p.funcMapBPC, funcMapApp: p.funcMapApp, entityMapBPC: p.entityMapBPC, entityMapApp: p.entityMapApp,
      dateOrder: UI.config().dateOrder, sourceName: S.input ? S.input.name : ''
    };
  }

  // ---------- HR Input ----------
  async function onInput(files) {
    const f = await UI.readFile(files[0]);
    let parsed = null, rows = null, sheet = null, lastErr = null;
    for (const sn of f.wb.SheetNames) {
      try { rows = Core.sheetRows(f.wb.Sheets[sn]); parsed = HC.parseHRInput(rows); sheet = sn; break; } catch (e) { lastErr = e; }
    }
    if (!parsed) throw lastErr || new Error('No se pudo leer el HR Input.');
    S.input = { name: f.name, rows, parsed, sheet };
    const el = $('#hc-input-info');
    UI.clear(el);
    UI.msg(el, '<b>' + parsed.positions.length + '</b> posiciones leídas de la hoja <b>' + esc(sheet) + '</b> · encabezado en <b>' + parsed.headerCell + '</b>', 'ok');
    parsed.info.forEach((t) => UI.msg(el, esc(t), 'warn'));
    // Detecta multi-entidad
    const codes = new Set(parsed.positions.map((p) => Core.str(p.pru).slice(0, 11)).filter(Boolean));
    if (codes.size > 1 && !$('#hc-multi').checked) UI.msg(el, 'El reporte trae ' + codes.size + ' unidades de planeación distintas. Si el mercado es multi-entidad (CAR, CAM), marca “Multi-entidad”.', 'info');
    renderMaps();
  }

  // ---------- HC Aprobado ----------
  function readEquivalences(wb) {
    const p = prof();
    const eq = HC.readEquivalences(wb);
    let n = 0;
    ['funcMapBPC', 'funcMapApp', 'entityMapBPC'].forEach((key) => Object.entries(eq[key]).forEach(([k, v]) => { if (!p[key][k]) { p[key][k] = v; n++; } }));
    UI.saveConfig();
    return n;
  }
  async function onApproved(files) {
    const f = await UI.readFile(files[0]);
    const p = prof();
    const sheets = f.wb.SheetNames;
    let sheet = (p.appCols && p.appCols.sheet && sheets.includes(p.appCols.sheet)) ? p.appCols.sheet : null;
    if (!sheet) { const s = Core.getSheet(f.wb, ['HC_YTD (Grade) (HC Tool Approv)', 'hc_ytd', 'aprobado', 'approved', 'approv']); sheet = s ? s.name : sheets[0]; }
    S.app = { name: f.name, wb: f.wb };
    UI.options('#hc-app-sheet', sheets, sheet);
    $('#hc-app-cfg').classList.remove('hidden');
    const n = readEquivalences(f.wb);
    selectSheet(sheet, true);
    if (n) UI.toast('Se cargaron ' + n + ' equivalencias desde las hojas For Filters / Entidades.', 'ok');
  }
  function selectSheet(sheet, auto) {
    const rows = Core.sheetRows(S.app.wb.Sheets[sheet]);
    let h = Core.findHeaderRow(rows, [/grad[eo]/, /^sop/, /coplan/, /function|funcion/, /entidad|country|pais/], 40);
    if (h < 0) h = 0;
    S.app.sheet = sheet; S.app.rows = rows;
    $('#hc-app-hrow').value = h + 1;
    selectHeader(h, auto);
  }
  function selectHeader(h, auto) {
    const rows = S.app.rows;
    S.app.headerIdx = h;
    const headers = Core.headerLabels(rows[h] || []);
    const guess = HC.guessApprovedColumns(rows[h] || []);
    const p = prof();
    const saved = p.appCols || {};
    const pick = (key, savedName) => {
      if (savedName) { const i = headers.findIndex((x) => Core.norm(x) === Core.norm(savedName)); if (i >= 0 && key !== 'sop' && key !== 'coplan') return i; }
      return guess[key];
    };
    const opts = headers.map((t, i) => ({ v: i, t: Core.colLetter(i) + ' · ' + t }));
    [['grade', '#hc-col-grade'], ['func', '#hc-col-func'], ['entity', '#hc-col-entity'], ['sop', '#hc-col-sop'], ['coplan', '#hc-col-coplan']].forEach(([k, sel]) => {
      let v = pick(k, saved[k]);
      // Si el usuario escribió la etiqueta del ejercicio, intenta encontrarla
      if (k === 'sop' && $('#hc-soplabel').value) { const i = headers.findIndex((x) => Core.norm(x).includes(Core.norm($('#hc-soplabel').value))); if (i >= 0) v = i; }
      if (k === 'coplan' && $('#hc-coplabel').value) { const i = headers.findIndex((x) => Core.norm(x).includes(Core.norm($('#hc-coplabel').value))); if (i >= 0) v = i; }
      UI.options(sel, opts, v, '— ninguna —');
    });
    appInfo();
    renderMaps();
  }
  function appCols() {
    const g = (s) => ($(s).value === '' ? -1 : Number($(s).value));
    return { grade: g('#hc-col-grade'), func: g('#hc-col-func'), entity: g('#hc-col-entity'), sop: g('#hc-col-sop'), coplan: g('#hc-col-coplan') };
  }
  function appInfo() {
    const el = $('#hc-app-info');
    UI.clear(el);
    const c = appCols();
    const hdr = S.app.rows[S.app.headerIdx] || [];
    const p = prof();
    p.appCols = { sheet: S.app.sheet, grade: hdr[c.grade], func: hdr[c.func], entity: hdr[c.entity] };
    UI.saveConfig();
    if (c.grade < 0) UI.msg(el, 'Elige la columna de Grado.', 'bad');
    if (c.sop < 0 && c.coplan < 0) UI.msg(el, 'Elige al menos la columna del SOP o del COPLAN vigente.', 'bad');
    if (c.grade >= 0 && (c.sop >= 0 || c.coplan >= 0)) {
      const tmp = HC.parseApproved(S.app.rows, S.app.headerIdx, c, buildCfg());
      const tS = tmp.reduce((a, r) => a + r.sop, 0), tC = tmp.reduce((a, r) => a + r.coplan, 0);
      UI.msg(el, tmp.length + ' filas de HC aprobado · Total ' + esc($('#hc-soplabel').value || 'SOP') + ': <b>' + UI.num(tS) + '</b> · Total ' + esc($('#hc-coplabel').value || 'COPLAN') + ': <b>' + UI.num(tC) + '</b>', 'ok');
    }
  }

  // ---------- Equivalencias ----------
  function distinct(arr) { return Array.from(new Set(arr.filter((x) => !Core.isBlank(x)).map((x) => String(x).trim()))).sort(); }
  function mapTable(title, key, values, hint) {
    const p = prof();
    if (!values.length) return '';
    const rows = values.map((v) => '<tr><td>' + esc(v) + '</td><td><input data-map="' + key + '" data-k="' + esc(v) + '" value="' + esc(p[key][v] || '') + '" placeholder="' + esc(v) + '"></td></tr>').join('');
    return '<div><h3>' + esc(title) + '</h3><p class="muted small">' + esc(hint) + '</p><div class="scroll" style="max-height:300px"><table class="t"><thead><tr><th>Valor encontrado</th><th>Se compara como</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }
  function renderMaps() {
    const el = $('#hc-maps');
    const cfg = buildCfg();
    let html = '';
    if (S.input) {
      const pos = HC.computePositions(S.input.parsed.positions, Object.assign({}, cfg, { funcMapBPC: {}, entityMapBPC: {} }));
      html += mapTable('Funciones en BPC', 'funcMapBPC', distinct(pos.map((p) => p.func)), 'Home Function (o Marketing Field/Office) → nombre corto común.');
      if (cfg.multiEntity) html += mapTable('Unidades de BPC → Entidad', 'entityMapBPC', distinct(pos.map((p) => p.entityCode)), 'Primeros 11 caracteres del Planning Reporting Unit → nombre de entidad.');
    }
    if (S.app && S.app.rows) {
      const c = appCols();
      const rows = S.app.rows.slice(S.app.headerIdx + 1);
      if (c.func >= 0) html += mapTable('Funciones en HC Aprobado', 'funcMapApp', distinct(rows.map((r) => r && r[c.func])), 'Función del catálogo aprobado → mismo nombre corto que BPC.');
      if (cfg.multiEntity && c.entity >= 0) html += mapTable('Entidades en HC Aprobado', 'entityMapApp', distinct(rows.map((r) => r && r[c.entity])), 'País / código del catálogo → mismo nombre de entidad que BPC.');
    }
    el.innerHTML = html ? '<div class="grid g2">' + html + '</div>' : '<p class="muted">Carga el HR Input y el HC Aprobado para ver los valores encontrados.</p>';
    UI.$$('input[data-map]', el).forEach((inp) => inp.addEventListener('change', () => {
      const p = prof();
      const k = inp.dataset.k;
      if (inp.value.trim()) p[inp.dataset.map][k] = inp.value.trim(); else delete p[inp.dataset.map][k];
      UI.saveConfig();
    }));
  }

  // ---------- Resultados ----------
  function run() {
    if (!S.input) throw new Error('Primero carga el HR Input Report.');
    saveFormToProfile();
    const cfg = buildCfg();
    if (Object.values(cfg.cutoffs).some((v) => v === null)) throw new Error('Revisa las fechas de corte.');
    let app = null;
    if (S.app && S.app.rows) {
      const c = appCols();
      if (c.grade < 0) throw new Error('Elige la columna de Grado del HC Aprobado.');
      app = { rows: S.app.rows, headerIdx: S.app.headerIdx, cols: c };
    } else UI.toast('Sin HC Aprobado: solo se mostrará el conteo de BPC.', 'warn');
    S.cfg = cfg;
    S.result = HC.run(S.input.rows, app, cfg);
    S.changes = takeSnapshot(cfg.market, S.result, cfg);
    $('#hc-mail-to').value = prof().mailTo || '';
    $('#hc-mail-cc').value = prof().mailCc || UI.config().ccDefault || '';
    UI.options('#hc-f-entity', S.result.entities, '', 'Todas');
    UI.options('#hc-f-func', S.result.funcs, '', 'Todas');
    $('#hc-f-entity').disabled = !cfg.multiEntity;
    $('#hc-results').classList.remove('hidden');
    $('#hc-download').disabled = false;
    renderResults();
    $('#hc-results').scrollIntoView({ behavior: 'smooth' });
  }
  function filter() { return { entity: $('#hc-f-entity').value || null, func: $('#hc-f-func').value || null }; }
  function renderResults() {
    const r = S.result, cfg = S.cfg;
    const cmp = HC.compare(r.positions, r.approved, filter());
    const dcls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero');
    const block = (label, key, st) => '<div class="block"><h3>' + esc(label) + '</h3><div class="status ' + (st.ok ? 'ok' : 'bad') + '">' + (st.ok ? '✅ ' : '⚠️ ') + esc(st.text) + '<small>' + esc(st.detail) + '</small></div>' +
      UI.table([
        { h: 'Pay Grade', k: 'grade' }, { h: 'HC BPC', k: 'bpc' + key, num: true }, { h: 'HC Approved', k: 'app' + key, num: true },
        { h: 'Differences', k: 'diff' + key, num: true, cls: (x) => dcls(x['diff' + key]) }, { h: 'Action Required', k: 'action' + key }
      ], cmp.rows, { total: true, totalLabel: 'Grand Total' }) + '</div>';
    $('#hc-blocks').innerHTML = block(cfg.sopLabel + ' · año en curso', 'SOP', cmp.statusSOP) + block(cfg.coplanLabel + ' · año siguiente', 'COPLAN', cmp.statusCOPLAN);
    const al = $('#hc-alerts');
    al.innerHTML = r.alerts.length ? r.alerts.map((a) => '<div class="msg ' + (/sin|vac|no recon/i.test(a.tipo) ? 'warn' : 'info') + '"><b>' + esc(a.tipo) + ':</b> ' + esc(a.detalle) + (a.accion ? '<br><span class="small">' + esc(a.accion) + '</span>' : '') + '</div>').join('') : '<div class="msg ok">Sin alertas.</div>';
    const f = filter();
    const nc = r.positions.filter((p) => (!f.entity || p.entity === f.entity) && (!f.func || p.funcShort === f.func) && (!p.countSOP || !p.countCOPLAN));
    $('#hc-nocount').innerHTML = UI.table([
      { h: 'Fila', k: '_row' }, { h: 'Posición', k: 'position' }, { h: 'Empleado', k: 'empName' }, { h: 'Función', k: 'funcShort' }, { h: 'Entidad', k: 'entity' },
      { h: 'Grado', k: 'grade' }, { h: 'FTE', f: (p) => p.fte }, { h: 'Inicio', f: (p) => Core.fmtDate(p.startSerial) }, { h: 'Fin', f: (p) => Core.fmtDate(p.endSerial) },
      { h: 'Motivo ' + cfg.sopLabel, k: 'reasonSOP' }, { h: 'Motivo ' + cfg.coplanLabel, k: 'reasonCOPLAN' }
    ], nc, { limit: 500 });
    renderChanges();
  }
  function reportName(market, sopLabel) {
    const d = new Date();
    return Core.safeFileName('HC Variations ' + market + ' ' + sopLabel + ' ' + d.getFullYear() + '-' + Core.pad(d.getMonth() + 1) + '-' + Core.pad(d.getDate())) + '.xlsx';
  }
  async function download() {
    const wb = await HC.buildReport(S.result, S.cfg, filter(), S.changes);
    await Core.downloadWorkbook(wb, reportName(S.cfg.market, S.cfg.sopLabel));
  }
  async function emlHC() {
    const p = prof();
    p.mailTo = $('#hc-mail-to').value.trim();
    p.mailCc = $('#hc-mail-cc').value.trim();
    UI.saveConfig();
    const f = filter();
    const m = HC.emailText(S.result, S.cfg, f);
    const wb = await HC.buildReport(S.result, S.cfg, f, S.changes);
    const to = UI.emailsFor([p.mailTo]), cc = UI.emailsFor([p.mailCc]);
    if (to.missing.length || cc.missing.length) UI.toast('Sin correo en el directorio para: ' + to.missing.concat(cc.missing).join(', '), 'warn', 7000);
    UI.downloadEml({ to: to.emails, cc: cc.emails, subject: m.subject, text: m.body, attachments: [{ name: reportName(S.cfg.market, S.cfg.sopLabel), data: await wb.xlsx.writeBuffer(), type: Core.XLSX_MIME }] });
  }

  // ---------- Cambios contra la corrida anterior ----------
  /** Guarda una foto de la corrida y devuelve los cambios contra la última corrida distinta (otro archivo de BPC). */
  function takeSnapshot(market, res, cfg) {
    const c = UI.config();
    c.hc.snapshots = c.hc.snapshots || {};
    const key = market + '|' + cfg.sopLabel;
    const list = c.hc.snapshots[key] || [];
    const snap = HC.snapshot(res, cfg);
    snap.sig = snap.source + '|' + snap.positions + '|' + snap.total.bpcSOP + '|' + snap.total.bpcCOPLAN + '|' + snap.total.diffSOP + '|' + snap.total.diffCOPLAN;
    const prev = list.slice().reverse().find((x) => x.sig !== snap.sig) || null;
    if (list.length && list[list.length - 1].sig === snap.sig) list[list.length - 1] = snap; else list.push(snap);
    c.hc.snapshots[key] = list.slice(-5);
    UI.saveConfig();
    return prev ? HC.changes(res, prev) : null;
  }
  function renderChanges() {
    const ch = S.changes, cfg = S.cfg;
    const el = $('#hc-changes');
    if (!ch) { el.innerHTML = '<div class="msg info">Primera corrida de ' + esc(cfg.market + ' ' + cfg.sopLabel) + ' en esta computadora: la próxima vez verás qué cambió.</div>'; return; }
    el.innerHTML = '<h3>Cambios desde la corrida del ' + esc(ch.date) + '</h3><div class="msg ' + (ch.worse ? 'warn' : 'ok') + '"><b>' + ch.fixed + '</b> grado(s) corregidos · <b>' + ch.worse + '</b> con diferencia nueva o mayor · posiciones ' + ch.prevPositions + ' → ' + ch.positions + '</div>' +
      (ch.rows.length ? UI.table([
        { h: 'Pay Grade', k: 'grade' }, { h: 'Dif ' + cfg.sopLabel + ' antes', k: 'prevDiffSOP', num: true }, { h: 'ahora', k: 'diffSOP', num: true }, { h: 'Cambio', k: 'chSOP', cls: (r) => chCls(r.chSOP) },
        { h: 'Dif ' + cfg.coplanLabel + ' antes', k: 'prevDiffCOPLAN', num: true }, { h: 'ahora', k: 'diffCOPLAN', num: true }, { h: 'Cambio', k: 'chCOPLAN', cls: (r) => chCls(r.chCOPLAN) }
      ], ch.rows) : '');
  }
  function chCls(t) { return /Corregido|Mejor/.test(t) ? 'okc' : /Nueva|Empeor/.test(t) ? 'badc' : ''; }

  // ---------- Varios mercados ----------
  const B = { files: [] };
  async function onBatchFiles(files) {
    for (const file of files) {
      const f = await UI.readFile(file);
      const item = { name: f.name, wb: f.wb, kind: null, market: null };
      for (const sn of f.wb.SheetNames) {
        try { const rows = Core.sheetRows(f.wb.Sheets[sn]); const parsed = HC.parseHRInput(rows); item.kind = 'input'; item.rows = rows; item.parsed = parsed; item.market = HC.detectMarket(parsed) || HC.detectMarketFromName(f.name); break; } catch (e) { /* no es HR Input */ }
      }
      if (!item.kind) { item.kind = 'master'; item.market = HC.detectMarketFromName(f.name); }
      B.files.push(item);
    }
    renderBatchFiles();
  }
  function renderBatchFiles() {
    const markets = Object.keys(HC.MARKETS);
    const el = $('#hcb-files');
    el.innerHTML = B.files.length ? '<table class="t"><thead><tr><th>Archivo</th><th>Tipo</th><th>Mercado</th><th>Detalle</th><th></th></tr></thead><tbody>' + B.files.map((it, i) =>
      '<tr><td>' + esc(it.name) + '</td><td>' + (it.kind === 'input' ? 'HR Input' : 'Maestro / HC Aprobado') + '</td><td><select data-bm="' + i + '"><option value="">— elige —</option>' + markets.map((m) => '<option' + (m === it.market ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select></td>' +
      '<td class="small">' + (it.kind === 'input' ? it.parsed.positions.length + ' posiciones' : it.wb.SheetNames.length + ' hojas') + '</td><td><button class="mini danger" data-bx="' + i + '">✕</button></td></tr>').join('') + '</tbody></table>' : '';
    UI.$$('[data-bm]', el).forEach((s) => s.addEventListener('change', () => { B.files[Number(s.dataset.bm)].market = s.value || null; renderBatchFiles(); }));
    UI.$$('[data-bx]', el).forEach((b) => b.addEventListener('click', () => { B.files.splice(Number(b.dataset.bx), 1); renderBatchFiles(); }));
    $('#hcb-run').disabled = !B.files.some((f) => f.kind === 'input' && f.market);
  }
  function runBatch() {
    saveFormToProfile();
    const base = buildCfg();
    const out = [], warn = [];
    Object.keys(HC.MARKETS).forEach((market) => {
      const input = B.files.find((f) => f.kind === 'input' && f.market === market);
      if (!input) return;
      const master = B.files.find((f) => f.kind === 'master' && f.market === market);
      const p = UI.profile(market);
      if (master) {
        const eq = HC.readEquivalences(master.wb);
        ['funcMapBPC', 'funcMapApp', 'entityMapBPC'].forEach((key) => Object.entries(eq[key]).forEach(([k, v]) => { if (!p[key][k]) p[key][k] = v; }));
      } else warn.push(market + ': sin archivo de HC Aprobado (solo conteo de BPC).');
      const cfg = Object.assign({}, base, {
        market, multiEntity: p.multiEntity, splitMarketing: p.splitMarketing, marketingFieldSubfunction: p.fieldSub, gradeGroupMax: Number(p.gradeGroupMax) || null, entityName: p.entityName || 'Total',
        funcMapBPC: p.funcMapBPC, funcMapApp: p.funcMapApp, entityMapBPC: p.entityMapBPC, entityMapApp: p.entityMapApp, sourceName: input.name
      });
      const app = master ? HC.autoApproved(master.wb, p, cfg.sopLabel, cfg.coplanLabel) : null;
      if (app && (app.cols.grade < 0 || (app.cols.sop < 0 && app.cols.coplan < 0))) warn.push(market + ': no identifiqué las columnas de Grado / SOP / COPLAN en el maestro; configúralo una vez en “Un mercado”.');
      const res = HC.run(input.rows, app && app.cols.grade >= 0 ? app : null, cfg);
      out.push({ market, res, cfg, sourceName: input.name, changes: takeSnapshot(market, res, cfg) });
    });
    UI.saveConfig();
    B.results = out;
    const el = $('#hcb-results');
    el.innerHTML = warn.map((w) => '<div class="msg warn">' + esc(w) + '</div>').join('') + UI.table([
      { h: 'Mercado', k: 'market' }, { h: 'Posiciones', f: (x) => x.res.positions.length, num: true },
      { h: 'Dif ' + base.sopLabel, f: (x) => x.res.overall.total.diffSOP, num: true, cls: (x) => (x.res.overall.statusSOP.ok ? 'zero' : 'neg') },
      { h: base.sopLabel, f: (x) => x.res.overall.statusSOP.text + ' · ' + x.res.overall.statusSOP.detail, cls: (x) => (x.res.overall.statusSOP.ok ? 'okc' : 'badc') },
      { h: 'Dif ' + base.coplanLabel, f: (x) => x.res.overall.total.diffCOPLAN, num: true, cls: (x) => (x.res.overall.statusCOPLAN.ok ? 'zero' : 'neg') },
      { h: base.coplanLabel, f: (x) => x.res.overall.statusCOPLAN.text + ' · ' + x.res.overall.statusCOPLAN.detail, cls: (x) => (x.res.overall.statusCOPLAN.ok ? 'okc' : 'badc') },
      { h: 'Alertas', f: (x) => x.res.alerts.length, num: true },
      { h: 'Vs. corrida anterior', f: (x) => (x.changes ? x.changes.fixed + ' corregidos · ' + x.changes.worse + ' nuevos/peores' : 'Primera corrida') }
    ], out);
    $('#hcb-download').disabled = !out.length;
  }
  async function downloadBatch() {
    const base = buildCfg();
    const wb = await HC.buildBatchReport(B.results, base);
    const d = new Date();
    await Core.downloadWorkbook(wb, Core.safeFileName('HC Variations Todos ' + base.sopLabel + ' ' + d.getFullYear() + '-' + Core.pad(d.getMonth() + 1) + '-' + Core.pad(d.getDate())) + '.xlsx');
  }

  function init() {
    const c = UI.config();
    UI.options('#hc-market', Object.keys(HC.MARKETS), c.hc.market);
    $('#hc-year').value = c.hc.sopYear || new Date().getFullYear();
    setYear($('#hc-year').value, false);
    if (c.hc.sopLabel) $('#hc-soplabel').value = c.hc.sopLabel;
    if (c.hc.coplanLabel) $('#hc-coplabel').value = c.hc.coplanLabel;
    loadProfileToForm();
    $('#hc-market').addEventListener('change', () => { loadProfileToForm(); });
    $('#hc-year').addEventListener('change', () => { setYear($('#hc-year').value, false); saveFormToProfile(); });
    // Solo estos cambian qué equivalencias se muestran; el resto no redibuja la tabla (evita perder lo que se está escribiendo)
    ['#hc-multi', '#hc-split', '#hc-fieldsub'].forEach((s) => $(s).addEventListener('change', () => { saveFormToProfile(); renderMaps(); }));
    ['#hc-group', '#hc-entname', '#hc-soplabel', '#hc-coplabel'].forEach((s) => $(s).addEventListener('change', saveFormToProfile));
    UI.dropZone('#hc-drop-input', { onFiles: onInput });
    UI.dropZone('#hc-drop-app', { onFiles: onApproved });
    $('#hc-app-sheet').addEventListener('change', () => selectSheet($('#hc-app-sheet').value));
    $('#hc-app-hrow').addEventListener('change', () => selectHeader(Math.max(0, Number($('#hc-app-hrow').value) - 1)));
    ['#hc-col-grade', '#hc-col-func', '#hc-col-entity', '#hc-col-sop', '#hc-col-coplan'].forEach((s) => $(s).addEventListener('change', () => { appInfo(); renderMaps(); }));
    $('#hc-run').addEventListener('click', () => { try { run(); } catch (e) { UI.toast(e.message, 'bad', 7000); } });
    $('#hc-download').addEventListener('click', (e) => UI.withBusy(e.currentTarget, download));
    $('#hc-f-entity').addEventListener('change', renderResults);
    $('#hc-mail').addEventListener('click', (e) => UI.withBusy(e.currentTarget, emlHC));
    UI.$$('#hc-tabs button').forEach((b) => b.addEventListener('click', () => {
      UI.$$('#hc-tabs button').forEach((x) => x.classList.toggle('active', x === b));
      UI.$$('#page-hc > .tab').forEach((t) => t.classList.toggle('active', t.id === 'hc-tab-' + b.dataset.tab));
    }));
    UI.dropZone('#hcb-drop', { multiple: true, keepLabel: true, onFiles: onBatchFiles });
    $('#hcb-run').addEventListener('click', () => { try { runBatch(); } catch (e) { console.error(e); UI.toast(e.message, 'bad', 8000); } });
    $('#hcb-download').addEventListener('click', (e) => UI.withBusy(e.currentTarget, downloadBatch));
    $('#hc-f-func').addEventListener('change', renderResults);
  }
  root.PageHC = { init, state: S, batch: B };
})(typeof self !== 'undefined' ? self : this);
