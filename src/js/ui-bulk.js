/* Pantalla: Archivo anual (Bulk) */
(function (root) {
  'use strict';
  const { Core, Bulk, UI, Chart } = root;
  const { $, esc } = UI;
  const S = { items: [], records: [], A: null, cancel: false, running: false };
  const MAX_MB = 40;
  const SKIP = /(^|\/)(~\$|\.)|(^|\/)(thumbs\.db|desktop\.ini)$/i;

  function year() { return Number($('#bk-year').value) || new Date().getFullYear(); }
  function addItems(list) {
    const known = new Set(S.items.map((i) => i.path));
    let n = 0;
    list.forEach((it) => { if (!SKIP.test(it.path) && !known.has(it.path)) { S.items.push(it); known.add(it.path); n++; } });
    renderQueue();
    if (n) UI.toast(n + ' archivo(s) agregados', 'ok', 2500);
  }
  function renderQueue() {
    $('#bk-queue').innerHTML = S.items.length ? '<b>' + S.items.length + '</b> archivo(s) listos para analizar' + (S.records.length ? ' · ' + S.records.length + ' ya analizados' : '') : '<span class="muted">Aún no hay archivos.</span>';
    $('#bk-run').disabled = !S.items.length || S.running;
    $('#bk-clear').disabled = !S.items.length || S.running;
  }

  // Carpetas arrastradas: recorre las entradas (readEntries devuelve lotes de 100)
  async function entriesToItems(entries) {
    const out = [];
    const walk = async (entry) => {
      if (entry.isFile) {
        out.push({ path: entry.fullPath.replace(/^\//, ''), getFile: () => new Promise((res, rej) => entry.file(res, rej)) });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        let batch;
        do {
          batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          for (const e of batch) await walk(e);
        } while (batch.length);
      }
    };
    for (const e of entries) if (e) await walk(e);
    return out;
  }
  function filesToItems(files) {
    return Array.from(files).map((f) => ({ path: f.webkitRelativePath || f.name, getFile: async () => f }));
  }

  async function run() {
    S.running = true; S.cancel = false;
    $('#bk-cancel').classList.remove('hidden');
    renderQueue();
    const bar = $('#bk-bar'), txt = $('#bk-progress-text');
    $('#bk-progress').classList.remove('hidden');
    const pending = S.items.slice();
    const t0 = Date.now();
    let i = 0;
    for (const it of pending) {
      if (S.cancel) break;
      i++;
      bar.style.width = Math.round((i / pending.length) * 100) + '%';
      txt.textContent = 'Leyendo ' + i + ' de ' + pending.length + ' · ' + it.path;
      try {
        const f = await it.getFile();
        if (f.size > MAX_MB * 1024 * 1024) {
          S.records.push({ path: it.path, name: f.name, folder: it.path.split('/').slice(0, -1).join('/'), size: f.size, modified: f.lastModified, ctx: Bulk.pathContext(it.path), type: 'otro', note: 'Más de ' + MAX_MB + ' MB: no se leyó' });
        } else {
          const data = new Uint8Array(await f.arrayBuffer());
          S.records.push(Bulk.processFile({ path: it.path, size: f.size, lastModified: f.lastModified, data }, { year: year() }));
        }
      } catch (e) {
        S.records.push({ path: it.path, name: it.path.split('/').pop(), folder: '', size: 0, ctx: Bulk.pathContext(it.path), type: 'error', note: e.message || String(e) });
      }
      S.items.splice(S.items.indexOf(it), 1);
      if (i % 3 === 0) await new Promise((r) => setTimeout(r, 0)); // deja respirar a la pantalla
    }
    S.running = false;
    $('#bk-cancel').classList.add('hidden');
    txt.textContent = (S.cancel ? 'Detenido. ' : 'Listo. ') + S.records.length + ' archivo(s) analizados en ' + Math.round((Date.now() - t0) / 1000) + ' s.';
    renderQueue();
    S.A = Bulk.aggregate(S.records, { sociedad: UI.config().sociedad || 'MX15' });
    renderResults();
  }

  function kpi(label, value, sub) { return '<div class="block"><div class="muted small">' + esc(label) + '</div><h2>' + value + '</h2>' + (sub ? '<span class="muted small">' + sub + '</span>' : '') + '</div>'; }
  function renderResults() {
    const A = S.A;
    if (!A) return;
    const el = $('#bk-results');
    const recog = A.records.filter((r) => !['otro', 'excel', 'error'].includes(r.type)).length;
    const recTot = Bulk.totalsBy(A.recharges.filter((e) => e.jvu !== null || e.webi !== null), (e) => e.currency || '?', (e) => (e.jvu !== null ? e.jvu : e.webi));
    const chTot = Bulk.totalsBy(A.charges, (c) => c.currency || '?', (c) => c.amount);
    const fmtTot = (o) => Object.entries(o).map(([k, v]) => UI.num(v, 2) + ' ' + esc(k)).join('<br>') || '—';
    let html = '<div class="grid g4">' +
      kpi('Archivos analizados', UI.num(A.records.length), recog + ' reconocidos · ' + (A.records.length - recog) + ' otros') +
      kpi('Asignaciones con recobro', UI.num(A.recharges.length), A.recharges.filter((e) => e.jvu !== null || e.accrual !== null).length + ' con JVU / Accrual') +
      kpi('Recobrado (JVU o Webi)', fmtTot(recTot)) +
      kpi('Cargos de proveedores', fmtTot(chTot), 'Reclasificado: ' + UI.num(A.reclass.reduce((a, r) => a + (r.mxn || 0), 0), 2) + ' MXN') +
      '</div>';
    html += '<div class="block chart-card" id="bk-chart"></div>';
    html += '<div class="grid g2"><div><h3>Qué encontré</h3>' + UI.table([{ h: 'Tipo', k: 't' }, { h: 'Archivos', k: 'n', num: true }],
      Object.entries(A.counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ t: Bulk.TYPES[k] || k, n: v })), { total: true }) + '</div>';
    html += '<div><h3>Alertas (' + A.alerts.length + ')</h3>' + (A.alerts.length ? '<div class="scroll" style="max-height:360px">' + UI.table([{ h: 'Tipo', k: 'tipo' }, { h: 'Detalle', k: 'detalle' }], A.alerts, { limit: 300 }) + '</div>' : '<div class="msg ok">Sin alertas.</div>') + '</div></div>';
    if (A.recharges.length) html += '<h3>Recobros por asignación</h3><div class="scroll" style="max-height:360px">' + UI.table([
      { h: 'Periodo', k: 'half' }, { h: 'KEY', k: 'key' }, { h: 'Empleado', k: 'employee' }, { h: 'SC', k: 'sc', num: true, d: 2 }, { h: 'Webi', k: 'webi', num: true, d: 2 },
      { h: 'JVU', k: 'jvu', num: true, d: 2 }, { h: 'Accrual', k: 'accrual', num: true, d: 2 }, { h: 'Moneda', k: 'currency' }, { h: 'Estatus', k: 'status', cls: (e) => (/generado/.test(e.status) ? 'okc' : 'empty') }
    ], A.recharges) + '</div>';
    if (A.evidence.length) html += '<h3>Evidencia por mes y proveedor</h3>' + UI.table([
      { h: 'Mes', f: (e) => Core.pad(e.month) + '. ' + Core.MESES[e.month - 1] }, { h: 'Proveedor', k: 'provider' }, { h: 'Completas', f: (e) => e.ok + ' de 6', cls: (e) => (e.ok === 6 ? 'okc' : 'badc') }, { h: 'Falta', k: 'missing' }
    ], A.evidence);
    el.innerHTML = html;
    renderChart();
    $('#bk-download').disabled = false;
  }

  // ---------- Gráfica: cargos por mes ----------
  function chartData() { return Bulk.monthlyCharges(S.A, S.chartCur, Chart.SERIES, Chart.OTHER); }
  function chartSvg(d, width) {
    const sub = d.currency ? 'Monto en ' + d.currency + ' por mes, apilado por proveedor' : '';
    return Chart.stackedColumns({ categories: d.categories, series: d.series, width: width || 760, height: 320, unit: d.currency, title: 'Cargos de proveedores por mes', subtitle: sub, ariaLabel: 'Cargos de proveedores por mes en ' + d.currency });
  }
  function renderChart() {
    const box = $('#bk-chart');
    const d = chartData();
    if (!d.months.length || !d.series.length) { box.innerHTML = '<div class="muted">Sin cargos de proveedores con mes identificado: la gráfica aparece cuando hay archivos dentro de carpetas tipo Suppliers\\06. Junio\\K2.</div>'; return; }
    S.chartCur = d.currency;
    const width = Math.max(480, Math.min(1100, box.clientWidth - 28 || 760));
    const ch = chartSvg(d, width);
    box.innerHTML = (d.currencies.length > 1 ? '<div class="filters" style="margin:0 0 8px;padding:6px 0;border:0"><label>Moneda<select id="bk-cur"></select></label><span class="muted small">Cada moneda se grafica por separado (no se suman monedas distintas).</span></div>' : '') +
      '<div class="chart-wrap">' + ch.svg + '<div class="chart-tip hidden" role="tooltip"></div></div>' +
      (d.noMonth ? '<div class="muted small">' + d.noMonth + ' cargo(s) sin mes identificado no aparecen en la gráfica (están en la hoja “Cargos proveedores”).</div>' : '') +
      '<details><summary>Ver tabla de datos</summary><div id="bk-chart-table" class="scroll"></div></details>';
    if (d.currencies.length > 1) {
      UI.options('#bk-cur', d.currencies, d.currency);
      $('#bk-cur').addEventListener('change', () => { S.chartCur = $('#bk-cur').value; renderChart(); });
    }
    const rows = d.categories.map((c, i) => { const o = { mes: c }; d.series.forEach((s2) => { o[s2.name] = s2.values[i]; }); o.total = ch.totals[i]; return o; });
    $('#bk-chart-table').innerHTML = UI.table([{ h: 'Mes', k: 'mes' }].concat(d.series.map((s2) => ({ h: s2.name, k: s2.name, num: true, d: 2 }))).concat([{ h: 'Total', k: 'total', num: true, d: 2 }]), rows, { total: true });
    wireTooltip(box.querySelector('.chart-wrap'), d, ch);
  }
  function wireTooltip(wrap, d, ch) {
    const tip = wrap.querySelector('.chart-tip');
    const svg = wrap.querySelector('svg');
    const fmt = (v) => UI.num(v, 2);
    const show = (hit) => {
      const i = Number(hit.dataset.idx);
      if (!ch.totals[i]) { tip.classList.add('hidden'); return; }
      tip.textContent = '';
      const h = document.createElement('div'); h.className = 'tip-h';
      const strong = document.createElement('b'); strong.textContent = fmt(ch.totals[i]) + ' ' + d.currency;
      const span = document.createElement('span'); span.textContent = ' · ' + Core.MESES[d.months[i] - 1];
      h.appendChild(strong); h.appendChild(span); tip.appendChild(h);
      d.series.filter((s2) => s2.values[i]).slice().reverse().forEach((s2) => {
        const row = document.createElement('div'); row.className = 'tip-row';
        const key = document.createElement('i'); key.style.background = s2.color;
        const v = document.createElement('b'); v.textContent = fmt(s2.values[i]);
        const n = document.createElement('span'); n.textContent = s2.name;
        row.appendChild(key); row.appendChild(v); row.appendChild(n); tip.appendChild(row);
      });
      tip.classList.remove('hidden');
      svg.querySelectorAll('.hit').forEach((x) => x.classList.toggle('on', x === hit));
      const r = hit.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      let left = r.left - wr.left + r.width / 2 + 12;
      if (left + tip.offsetWidth > wr.width) left = r.left - wr.left + r.width / 2 - tip.offsetWidth - 12;
      tip.style.left = Math.max(0, left) + 'px';
      tip.style.top = '60px';
    };
    const hide = () => { tip.classList.add('hidden'); svg.querySelectorAll('.hit').forEach((x) => x.classList.remove('on')); };
    svg.querySelectorAll('.hit').forEach((hit) => {
      hit.setAttribute('tabindex', '0');
      hit.addEventListener('pointerenter', () => show(hit));
      hit.addEventListener('focus', () => show(hit));
      hit.addEventListener('blur', hide);
    });
    svg.addEventListener('pointerleave', hide);
  }
  async function chartPng() {
    const d = chartData();
    if (!d.months.length || !d.series.length) return null;
    const ch = chartSvg(d, 760);
    try { return { png: await Chart.svgToPng(ch.svg, ch.width, ch.height, 2), width: ch.width, height: ch.height }; } catch (e) { console.error(e); return null; }
  }
  async function download() {
    const y = year();
    await UI.save(y, async () => {
      const img = await chartPng();
      return [await UI.wbFile('Consolidado anual HRSS ' + y + '.xlsx', await Bulk.buildWorkbook(S.A, { year: y, chartPng: img && img.png, chartWidth: img && img.width, chartHeight: img && img.height }))];
    });
  }
  async function scanFolder() {
    const txt = $('#bk-progress-text');
    $('#bk-progress').classList.remove('hidden');
    txt.textContent = 'Buscando archivos en la carpeta…';
    const list = await UI.walkYear(year(), (n) => { txt.textContent = 'Buscando archivos en la carpeta… ' + n; });
    txt.textContent = list.length + ' archivo(s) encontrados en la carpeta.';
    addItems(list);
  }
  function updateFolderBtn() {
    const on = UI.saveMode() === 'folder';
    $('#bk-scan').disabled = !on;
    $('#bk-scan').textContent = on ? '🔎 Escanear mi carpeta ' + year() + ' (' + UI.folderName() + ')' : '🔎 Escanear mi carpeta (elígela en Configuración)';
    $('#bk-where').textContent = UI.whereText('Consolidado anual HRSS ' + year() + '.xlsx');
  }

  function init() {
    $('#bk-year').value = new Date().getFullYear();
    const drop = $('#bk-drop');
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.hidden = true;
    drop.appendChild(input);
    drop.addEventListener('click', (e) => { if (e.target !== input) input.click(); });
    input.addEventListener('change', () => { addItems(filesToItems(input.files)); input.value = ''; });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', async (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      const items = Array.from(e.dataTransfer.items || []);
      const entries = items.map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
      if (entries.length) addItems(await entriesToItems(entries));
      else addItems(filesToItems(e.dataTransfer.files));
    });
    $('#bk-folder').addEventListener('change', (e) => { addItems(filesToItems(e.target.files)); e.target.value = ''; });
    $('#bk-scan').addEventListener('click', (e) => UI.withBusy(e.currentTarget, scanFolder));
    $('#bk-run').addEventListener('click', () => run().catch((e) => { S.running = false; UI.toast(e.message, 'bad', 8000); renderQueue(); }));
    $('#bk-cancel').addEventListener('click', () => { S.cancel = true; });
    $('#bk-clear').addEventListener('click', () => { S.items = []; renderQueue(); });
    $('#bk-reset').addEventListener('click', () => { S.items = []; S.records = []; S.A = null; $('#bk-results').innerHTML = ''; $('#bk-download').disabled = true; $('#bk-progress').classList.add('hidden'); renderQueue(); });
    $('#bk-download').addEventListener('click', (e) => UI.withBusy(e.currentTarget, download));
    $('#bk-year').addEventListener('change', updateFolderBtn);
    document.addEventListener('hrss-folder', updateFolderBtn);
    updateFolderBtn();
    renderQueue();
  }
  root.PageBulk = { init, S };
})(typeof self !== 'undefined' ? self : this);
