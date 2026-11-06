/* Pantalla: Power BI */
(function (root) {
  'use strict';
  const { Core, UI, PowerBI } = root;
  const { $, esc } = UI;
  const S = { mode: 'app', profiles: [], last: null };
  const TYPE_LABEL = { string: 'Texto', int64: 'Entero', double: 'Decimal', dateTime: 'Fecha', boolean: 'Sí/No' };
  const KIND_LABEL = { card: 'Tarjeta', columnChart: 'Columnas apiladas', clusteredColumnChart: 'Columnas', clusteredBarChart: 'Barras', lineChart: 'Línea', tableEx: 'Tabla', slicer: 'Filtro', textbox: 'Título' };

  function year() { return Number($('#pbi-year').value) || new Date().getFullYear(); }
  function appSources() {
    const bulk = root.PageBulk && root.PageBulk.S && root.PageBulk.S.A;
    const hcOne = root.PageHC && root.PageHC.state && root.PageHC.state.result ? [{ market: root.PageHC.state.cfg.market, res: root.PageHC.state.result, cfg: root.PageHC.state.cfg }] : [];
    const hcMany = root.PageHC && root.PageHC.batch && root.PageHC.batch.results ? root.PageHC.batch.results.map((x) => ({ market: x.market, res: x.res, cfg: x.cfg })) : [];
    return { bulk, hc: hcMany.length ? hcMany : hcOne };
  }
  function renderApp() {
    const { bulk, hc } = appSources();
    const row = (ok, title, detail, go) => '<li class="' + (ok ? 'ok' : 'bad') + '"><span>' + (ok ? '✅' : '➖') + '</span><div><b>' + title + '</b><br><span class="muted small">' + detail + '</span>' + (go && !ok ? ' <a data-goto="' + go + '">Ir a esa sección</a>' : '') + '</div></li>';
    $('#pbi-app-status').innerHTML = '<ul class="checklist">' +
      row(!!bulk, 'Bulk: archivos del año', bulk ? bulk.records.length + ' archivos analizados · ' + bulk.charges.length + ' cargos · ' + bulk.recharges.length + ' asignaciones · ' + bulk.alerts.length + ' alertas → páginas Resumen, Recobros, CeCos y SAP, Calidad de datos' : 'Aún no analizas archivos en Bulk.', 'bulk') +
      row(!!hc.length, 'Headcount: HC BPC vs Aprobado', hc.length ? hc.map((h) => esc(h.market)).join(', ') + ' → página Headcount' : 'Aún no corres la comparación de Headcount (uno o varios mercados).', 'hc') +
      '</ul>';
    UI.$$('#pbi-app-status [data-goto]').forEach((a) => a.addEventListener('click', () => document.querySelector('#nav a[data-page="' + a.dataset.goto + '"]').click()));
    preview();
  }
  async function onFiles(files) {
    for (const file of files) {
      const f = await UI.readFile(file);
      const profs = PowerBI.profileWorkbook(f.wb, f.name);
      if (!profs.length) UI.toast(file.name + ': no encontré tablas (una fila de encabezados con datos debajo).', 'warn', 6000);
      S.profiles = S.profiles.concat(profs);
    }
    renderFiles();
  }
  function renderFiles() {
    const el = $('#pbi-files-list');
    if (!S.profiles.length) { el.innerHTML = ''; preview(); return; }
    el.innerHTML = '<table class="t"><thead><tr><th>Usar</th><th>Nombre de la tabla en Power BI</th><th>Origen</th><th class="num">Filas</th><th>Columnas (tipo detectado)</th><th></th></tr></thead><tbody>' +
      S.profiles.map((p, i) => '<tr><td><input type="checkbox" data-inc="' + i + '"' + (p.include !== false ? ' checked' : '') + '></td>' +
        '<td><input data-name="' + i + '" value="' + esc(p.name) + '"></td><td class="small">' + esc(p.file) + ' › ' + esc(p.sheet) + ' (encabezado fila ' + p.headerRow + ')</td><td class="num">' + UI.num(p.rows.length) + '</td>' +
        '<td class="small">' + p.columns.map((c, j) => '<span class="pill">' + esc(c.name) + ' <select data-type="' + i + ':' + j + '">' + Object.keys(TYPE_LABEL).map((t) => '<option value="' + t + '"' + (t === c.type ? ' selected' : '') + '>' + TYPE_LABEL[t] + '</option>').join('') + '</select></span>').join(' ') + '</td>' +
        '<td><button class="mini danger" data-del="' + i + '">✕</button></td></tr>').join('') + '</tbody></table>';
    UI.$$('[data-inc]', el).forEach((x) => x.addEventListener('change', () => { S.profiles[+x.dataset.inc].include = x.checked; preview(); }));
    UI.$$('[data-name]', el).forEach((x) => x.addEventListener('change', () => { S.profiles[+x.dataset.name].name = x.value.trim() || S.profiles[+x.dataset.name].name; preview(); }));
    UI.$$('[data-type]', el).forEach((x) => x.addEventListener('change', () => { const [i, j] = x.dataset.type.split(':').map(Number); S.profiles[i].columns[j].type = x.value; preview(); }));
    UI.$$('[data-del]', el).forEach((x) => x.addEventListener('click', () => { S.profiles.splice(+x.dataset.del, 1); renderFiles(); }));
    preview();
  }
  function buildSpec() {
    const name = $('#pbi-name').value.trim() || ('HRSS ' + year());
    if (S.mode === 'app') {
      const { bulk, hc } = appSources();
      if (!bulk && !hc.length) return null;
      return PowerBI.hrssSpec(bulk, hc, { year: year(), name });
    }
    const use = S.profiles.filter((p) => p.include !== false);
    if (!use.length) return null;
    return PowerBI.genericSpec(use, { name });
  }
  /** Vista previa: maqueta de cada página + resumen del modelo. */
  function preview() {
    const el = $('#pbi-preview');
    let built;
    try { built = buildSpec(); } catch (e) { console.error(e); el.innerHTML = '<div class="msg bad">' + esc(e.message) + '</div>'; return; }
    $('#pbi-generate').disabled = !built;
    if (!built) { el.innerHTML = '<div class="msg info">Elige la información para ver cómo quedará el reporte.</div>'; return; }
    const pages = built.pages.map(PowerBI.layoutPage);
    const W = 1280, H = 720;
    const page = (p) => {
      let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="pbi-page" role="img" aria-label="Maqueta de la página ' + esc(p.displayName) + '"><rect width="' + W + '" height="' + H + '" fill="#F4F6F9"/>';
      p.visuals.forEach((v) => {
        const pos = v.position, k = v.visual.visualType;
        const t = (v.visual.visualContainerObjects && v.visual.visualContainerObjects.title && v.visual.visualContainerObjects.title[0].properties.text.expr.Literal.Value.replace(/^'|'$/g, '').replace(/''/g, "'")) || '';
        const qs = v.visual.query ? v.visual.query.queryState : {};
        const first = (role) => (qs[role] ? qs[role].projections.map((x) => x.displayName || x.nativeQueryRef).join(', ') : '');
        let label = k === 'textbox' ? v.visual.objects.general[0].properties.paragraphs[0].textRuns[0].value : k === 'card' ? first('Values') : k === 'slicer' ? '▾ ' + first('Values') : t || KIND_LABEL[k];
        if (k !== 'textbox' && k !== 'card' && k !== 'slicer') label = KIND_LABEL[k] + ': ' + label;
        const bg = k === 'textbox' ? 'none' : '#FFFFFF';
        s += '<rect x="' + pos.x + '" y="' + pos.y + '" width="' + pos.width + '" height="' + pos.height + '" rx="8" fill="' + bg + '" stroke="' + (k === 'textbox' ? 'none' : '#DDE3EA') + '"/>';
        if (k === 'columnChart' || k === 'clusteredColumnChart') {
          for (let i = 0; i < 8; i++) { const bh = (pos.height - 70) * (0.35 + 0.6 * Math.abs(Math.sin(i * 1.7 + pos.x))); s += '<rect x="' + (pos.x + 24 + i * (pos.width - 48) / 8) + '" y="' + (pos.y + pos.height - 16 - bh) + '" width="' + Math.min(24, (pos.width - 48) / 12) + '" height="' + bh + '" rx="3" fill="' + PowerBI.PALETTE[k === 'columnChart' ? 0 : i % 2] + '" opacity=".85"/>'; }
        } else if (k === 'clusteredBarChart') {
          for (let i = 0; i < 6; i++) { const bw = (pos.width - 140) * (0.9 - i * 0.13); s += '<rect x="' + (pos.x + 110) + '" y="' + (pos.y + 48 + i * (pos.height - 64) / 6) + '" width="' + bw + '" height="' + Math.min(16, (pos.height - 64) / 9) + '" rx="3" fill="' + PowerBI.PALETTE[0] + '" opacity=".85"/>'; }
        } else if (k === 'lineChart') {
          let d = '';
          for (let i = 0; i < 10; i++) d += (i ? 'L' : 'M') + (pos.x + 24 + i * (pos.width - 48) / 9) + ',' + (pos.y + pos.height - 30 - (pos.height - 90) * (0.3 + 0.5 * Math.abs(Math.sin(i * 0.9)))) + ' ';
          s += '<path d="' + d + '" fill="none" stroke="' + PowerBI.PALETTE[0] + '" stroke-width="4"/>';
        } else if (k === 'tableEx') {
          for (let i = 0; i < Math.floor((pos.height - 50) / 26); i++) s += '<rect x="' + (pos.x + 14) + '" y="' + (pos.y + 44 + i * 26) + '" width="' + (pos.width - 28) + '" height="18" fill="' + (i === 0 ? '#1F4E79' : '#EEF2F6') + '"/>';
        } else if (k === 'card') {
          s += '<text x="' + (pos.x + pos.width / 2) + '" y="' + (pos.y + pos.height / 2 + 4) + '" font-size="34" font-weight="600" text-anchor="middle" fill="#0E2841">123</text>';
        }
        const fs = k === 'textbox' ? 30 : 20;
        const ty = k === 'card' ? pos.y + pos.height - 16 : k === 'textbox' ? pos.y + 38 : pos.y + 30;
        s += '<text x="' + (k === 'card' ? pos.x + pos.width / 2 : pos.x + 14) + '" y="' + ty + '" font-size="' + fs + '" font-weight="' + (k === 'textbox' ? 700 : 600) + '" fill="' + (k === 'card' ? '#64707D' : '#0E2841') + '"' + (k === 'card' ? ' text-anchor="middle"' : '') + '>' + esc(String(label).slice(0, Math.max(8, Math.floor(pos.width / (fs * 0.55))))) + '</text>';
      });
      return s + '</svg>';
    };
    const sp = built.spec;
    const nMeas = sp.tables.reduce((a, t) => a + (t.measures || []).length, 0);
    el.innerHTML = '<div class="grid g3">' + pages.map((p) => '<div><div class="small"><b>' + esc(p.displayName) + '</b> · ' + p.visuals.length + ' visuales</div>' + page(p) + '</div>').join('') + '</div>' +
      '<details><summary>Modelo: ' + sp.tables.length + ' tablas · ' + (sp.relationships || []).length + ' relaciones · ' + nMeas + ' medidas DAX</summary>' +
      UI.table([{ h: 'Tabla', k: 'name' }, { h: 'Filas', f: (t) => t.rows.length, num: true }, { h: 'Columnas', f: (t) => t.columns.map((c) => c.name).join(', ') }, { h: 'Medidas', f: (t) => (t.measures || []).map((m) => m.name).join(', ') }], sp.tables) +
      '<div class="small" style="margin-top:6px">' + (sp.relationships || []).map((r) => esc(r.from.join('[') + '] → ' + r.to.join('[') + ']')).join(' · ') + '</div></details>';
  }
  async function generate() {
    const built = buildSpec();
    if (!built) throw new Error('Primero elige la información para el reporte.');
    let project;
    await UI.save(year(), async () => {
      project = await PowerBI.buildProject(built.spec, built.pages);
      return project.files.map((f) => Object.assign({}, f, { path: 'Power BI/' + project.name + '/' + f.path }));
    }, 'Power BI - ' + Core.safeFileName(built.spec.name) + '.zip');
    if (project) {
      $('#pbi-done').innerHTML = '<div class="msg ok"><b>Proyecto generado: ' + esc(project.name) + '.</b> ' +
        (UI.saveMode() === 'folder' ? 'Quedó en la carpeta <code>Power BI\\' + esc(project.name) + '</code> dentro de tu Tracker.' : 'Descomprime el ZIP en una carpeta.') +
        ' Abre <code>' + esc(project.name) + '.pbip</code> con Power BI Desktop y pulsa <b>Actualizar</b>. Para entregarlo como archivo único: Archivo › Guardar como › .pbix.</div>';
    }
  }
  function setMode(m) {
    S.mode = m;
    UI.$$('#pbi-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === m));
    UI.$$('#page-pbi .tab').forEach((t) => t.classList.toggle('active', t.id === 'pbi-tab-' + m));
    if (m === 'app') renderApp(); else renderFiles();
  }
  function init() {
    $('#pbi-year').value = new Date().getFullYear();
    UI.$$('#pbi-tabs button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.tab)));
    UI.dropZone('#pbi-drop', { multiple: true, keepLabel: true, accept: '.xlsx,.xlsm,.xls,.csv,.txt', onFiles });
    $('#pbi-name').addEventListener('change', preview);
    $('#pbi-year').addEventListener('change', preview);
    $('#pbi-generate').addEventListener('click', (e) => UI.withBusy(e.currentTarget, generate));
    $('#pbi-clear').addEventListener('click', () => { S.profiles = []; renderFiles(); });
    document.querySelector('#nav a[data-page="pbi"]').addEventListener('click', () => { if (S.mode === 'app') renderApp(); });
    const upd = () => { $('#pbi-where').textContent = UI.whereText('Power BI/' + ($('#pbi-name').value.trim() || 'HRSS ' + year()) + '/'); };
    document.addEventListener('hrss-folder', upd);
    $('#pbi-name').addEventListener('input', upd);
    upd();
    renderApp();
  }
  root.PagePBI = { init, S };
})(typeof self !== 'undefined' ? self : this);
