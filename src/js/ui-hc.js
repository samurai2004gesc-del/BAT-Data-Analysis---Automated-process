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
    let n = 0;
    const ff = Core.getSheet(wb, ['For Filters']);
    if (ff) {
      Core.sheetRows(ff.ws).forEach((r) => {
        if (!r) return;
        const pairs = [[0, 1, 'funcMapBPC'], [3, 4, 'funcMapApp']];
        pairs.forEach(([a, b, key]) => {
          const ka = Core.str(r[a]), vb = Core.str(r[b]);
          if (!ka || !vb || Core.norm(vb) === 'function' || /slicer$/.test(Core.norm(ka))) return;
          if (!p[key][ka]) { p[key][ka] = vb; n++; }
        });
      });
    }
    const en = Core.getSheet(wb, ['Entidades']);
    if (en) {
      const rows = Core.sheetRows(en.ws);
      const h = Core.findHeaderRow(rows, ['Codigo Entidad', 'Entidad'], 10);
      if (h >= 0) {
        const ci = Core.findCol(rows[h], ['Codigo Entidad', 'Código Entidad', 'Codigo', 'Code']);
        const ei = Core.findCol(rows[h], ['Entidad', 'Entity'], ['codigo', 'code']);
        if (ci >= 0 && ei >= 0) rows.slice(h + 1).forEach((r) => { const k = Core.str(r && r[ci]), v = Core.str(r && r[ei]); if (k && v && !p.entityMapBPC[k]) { p.entityMapBPC[k] = v; n++; } });
      }
    }
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
  }
  async function download() {
    const wb = await HC.buildReport(S.result, S.cfg, filter());
    const d = new Date();
    await Core.downloadWorkbook(wb, Core.safeFileName('HC Variations ' + S.cfg.market + ' ' + S.cfg.sopLabel + ' ' + d.getFullYear() + '-' + Core.pad(d.getMonth() + 1) + '-' + Core.pad(d.getDate())) + '.xlsx');
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
    $('#hc-f-func').addEventListener('change', renderResults);
  }
  root.PageHC = { init, state: S };
})(typeof self !== 'undefined' ? self : this);
