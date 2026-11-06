/* Archivo anual (Bulk): recibe cientos de archivos del año (Webis, JVUs, Accruals, Shopping Carts, archivos de
 * proveedores, Sent/Retrieved, Reclasificaciones, KSB1, All CeCos, HR Input, Trackers, correos .msg…),
 * reconoce qué es cada uno por su nombre, carpeta y contenido, extrae los datos y arma un consolidado del año
 * con inventario, totales y alertas (faltantes, duplicados, CeCos fuera de la sociedad, montos que no cuadran). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./hc.js'), require('./recharges.js'), require('./reclass.js'));
  else root.Bulk = factory(root.Core, root.HC, root.Recharges, root.Reclass);
})(typeof self !== 'undefined' ? self : this, function (Core, HC, R, RC) {
  'use strict';
  const { norm, str, parseNum, isBlank } = Core;

  const TYPES = {
    webi: 'Webi', jvu: 'JVU', accrual: 'Accrual', sc: 'Shopping Cart', supplier: 'Cargos de proveedor', sent: 'Sent to HRBPs',
    retrieved: 'Retrieved from HRBPs', reclass: 'Reclasificación por CeCo', ksb1: 'Export KSB1', cecos: 'All CeCos - Approvers',
    hrinput: 'HR Input Report (BPC)', hcmaster: 'Maestro HC (aprobado)', estimate: 'Estimate Benefits', tracker: 'Tracker de recobros',
    consolidado: 'Consolidado de cargos', 'msg-global': 'Correo de Global (cargo)', 'msg-hrbp': 'Correo respuesta HRBP', msg: 'Correo (.msg)',
    validacion: 'Validación de CeCos', historico: 'Filas para Histórico', excel: 'Excel no reconocido', otro: 'Otro archivo', error: 'No se pudo leer'
  };
  const SPREADSHEET = /\.(xlsx|xlsm|xlsb|xls|csv|txt)$/i;
  const PROVIDERS = ['K2', 'EY', 'Deloitte', 'SIRVA', 'KPMG', 'PwC'];
  const MES_IDX = (() => { const m = {}; Core.MESES.forEach((n, i) => { m[norm(n)] = i + 1; }); Core.MONTHS_EN.forEach((n, i) => { m[norm(n)] = i + 1; }); m.setiembre = 9; return m; })();

  // ---------- Contexto a partir de la ruta y el nombre ----------
  function pathContext(path) {
    const parts = String(path || '').split(/[\\/]/).filter(Boolean);
    const name = parts[parts.length - 1] || '';
    const base = name.replace(/\.[^.]+$/, '');
    const ctx = { name, base, folder: parts.slice(0, -1).join('/'), ext: (name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase() };
    parts.forEach((seg) => {
      const n = norm(seg);
      let m;
      if ((m = n.match(/^(\d{1,2})\.\s*([a-z]+)/)) && MES_IDX[m[2]]) ctx.month = MES_IDX[m[2]];
      if (/^20\d{2}$/.test(n)) ctx.year = Number(n);
      if ((m = seg.match(/^H([12])'?(\d{2})$/i))) { ctx.half = 'H' + m[1]; ctx.year = ctx.year || 2000 + Number(m[2]); }
      const prov = PROVIDERS.find((p) => norm(p) === n);
      if (prov) ctx.provider = prov;
      if (/^(webis|jvus|accruals)$/.test(n)) ctx.recFolder = n;
    });
    let m;
    if ((m = base.match(/^\s*(\d+)\.\s*(SC|Webi|JVU|Accrual)\s+(.+)$/i))) { ctx.key = m[1]; ctx.docKind = m[2]; ctx.employee = m[3].trim(); }
    else if (ctx.recFolder) {
      const empSeg = parts.slice(0, -1).reverse().find((s) => /^\d+\.\s+\S/.test(s));
      if (empSeg) { const mm = empSeg.match(/^(\d+)\.\s+(.+)$/); ctx.key = mm[1]; ctx.employee = mm[2].trim(); }
    }
    if (!ctx.provider) { const prov = PROVIDERS.find((p) => new RegExp('(^|[^a-z])' + norm(p) + '([^a-z]|$)').test(norm(base))); if (prov) ctx.provider = prov; }
    if (!ctx.month) {
      const words = norm(base).split(/[^a-z]+/);
      const w = words.find((x) => MES_IDX[x]);
      if (w) ctx.month = MES_IDX[w];
    }
    if ((m = base.match(/^(\d{2})[-.](\d{2})[-.](\d{4})/))) { ctx.fileDate = Core.ymdToSerial(+m[3], +m[1], +m[2]); ctx.month = ctx.month || +m[1]; ctx.year = ctx.year || +m[3]; }
    if (!ctx.half && (m = base.match(/H([12])'?(\d{2})\b/i))) { ctx.half = 'H' + m[1]; }
    return ctx;
  }

  // ---------- Correos .msg (Outlook) ----------
  function parseMsg(u8) {
    const CFB = Core.lib('XLSX').CFB;
    const cfb = CFB.read(u8, { type: 'array' });
    const get = (path) => { const i = cfb.FullPaths.findIndex((p) => p === 'Root Entry/' + path); return i >= 0 ? cfb.FileIndex[i].content : null; };
    const txt = (id) => {
      let c = get('__substg1.0_' + id + '001F');
      if (c) return new TextDecoder('utf-16le').decode(Uint8Array.from(c)).replace(/\0+$/, '');
      c = get('__substg1.0_' + id + '001E');
      if (c) return new TextDecoder('windows-1252').decode(Uint8Array.from(c)).replace(/\0+$/, '');
      return '';
    };
    const out = { subject: txt('0037'), from: txt('0C1A'), fromEmail: txt('0C1F'), to: txt('0E04'), cc: txt('0E03'), date: null, attachments: [] };
    const props = get('__properties_version1.0');
    if (props) {
      const b = Uint8Array.from(props);
      const dv = new DataView(b.buffer);
      const found = {};
      for (let i = 32; i + 16 <= b.length; i += 16) {
        const type = dv.getUint16(i, true), id = dv.getUint16(i + 2, true);
        if (type === 0x0040 && (id === 0x0E06 || id === 0x0039)) {
          const ft = dv.getUint32(i + 8, true) + dv.getUint32(i + 12, true) * 4294967296;
          found[id] = ft / 10000 - 11644473600000;
        }
      }
      const ms = found[0x0E06] || found[0x0039];
      if (ms) { const d = new Date(ms); out.date = Core.ymdToSerial(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
    }
    cfb.FullPaths.forEach((p, i) => {
      const m = p.match(/^Root Entry\/__attach_version1\.0_#[0-9A-F]+\/__substg1\.0_(3707|3704)(001F|001E)$/i);
      if (!m) return;
      const c = Uint8Array.from(cfb.FileIndex[i].content);
      const n = (m[2] === '001F' ? new TextDecoder('utf-16le') : new TextDecoder('windows-1252')).decode(c).replace(/\0+$/, '');
      if (m[1] === '3707' || !out.attachments.includes(n)) out.attachments.push(n);
    });
    out.attachments = Array.from(new Set(out.attachments));
    return out;
  }

  // ---------- Clasificación ----------
  function headersOf(rows, n) { const all = []; rows.slice(0, n || 12).forEach((r) => (r || []).forEach((c) => { if (!isBlank(c)) all.push(norm(c)); })); return all; }
  function classifyByName(ctx) {
    const n = norm(ctx.base);
    if (ctx.ext === 'msg') return /^re[_:\s]/.test(n) ? 'msg-hrbp' : (/non-po|billing|costs/.test(n) ? 'msg-global' : 'msg');
    if (!SPREADSHEET.test(ctx.name)) return 'otro';
    if (/sent to hrbp/.test(n)) return 'sent';
    if (/retrieved from hrbp/.test(n)) return 'retrieved';
    if (/reclasificaci[o]n por ceco/.test(n)) return 'reclass';
    if (/validacion cecos/.test(n)) return 'validacion';
    if (/para historico/.test(n)) return 'historico';
    if (/all cecos/.test(n)) return 'cecos';
    if (/consolidadocharges|consolidado ?charges/.test(n)) return 'consolidado';
    if (/estimate benefits/.test(n)) return 'estimate';
    if (/tracker/.test(n) && !/^\d+\./.test(n)) return 'tracker';
    if (ctx.docKind) return { sc: 'sc', webi: 'webi', jvu: 'jvu', accrual: 'accrual' }[ctx.docKind.toLowerCase()];
    if (/export/.test(n) && ctx.fileDate) return 'ksb1';
    return null;
  }
  function classifyByContent(wb, ctx) {
    const sn = wb.SheetNames.map(norm);
    if (sn.some((s) => s.includes('hc_ytd'))) return 'hcmaster';
    if (sn.includes('people') && sn.some((s) => s.startsWith('consolidado'))) return 'estimate';
    if (sn.some((s) => /^historico k2|^historico$/.test(s))) return 'consolidado';
    const first = wb.Sheets[wb.SheetNames[0]];
    const rows = Core.sheetRows(first);
    const H = headersOf(rows, 40);
    if (H.includes('new / existing / planned') || (H.includes('pay grade') && H.includes('fte multiplier'))) return 'hrinput';
    if (H.includes('rrb material') || (H.includes('po indicator') && H.some((h) => /amount/.test(h)))) return 'webi';
    if (H.includes('bschl') || H.includes('post key')) return /accrual/.test(norm(ctx.base)) || ctx.recFolder === 'accruals' ? 'accrual' : 'jvu';
    if (H.some((h) => /value ?trancurr/.test(h))) return 'ksb1';
    if (H.includes('row labels (ceco destino)') || (H.includes('row labels') && H.some((h) => /gross.?amount mxn/.test(h)))) return 'reclass';
    if (H.includes('recharge id (webi)')) return 'tracker';
    const hasName = H.some((h) => /assignee|nombre|name/.test(h));
    const hasAmount = H.some((h) => /amount|monto|importe/.test(h));
    if (hasName && hasAmount) return H.includes('hrbp') && H.some((h) => /^ce ?co$/.test(h)) ? 'retrieved' : 'supplier';
    if (H.some((h) => /company code|sociedad/.test(h)) && H.some((h) => /cost cent|ceco/.test(h)) && rows.length > 5) return 'cecos';
    return 'excel';
  }

  // ---------- Extracción por tipo ----------
  const CURRENCIES = ['USD', 'MXN', 'GBP', 'EUR', 'COP', 'CAD', 'BRL', 'JMD', 'TTD', 'GYD', 'HNL', 'CRC', 'PAB', 'CHF', 'JPY', 'PLN', 'ZAR'];
  function docInfo(kind, wb) {
    const grid = Core.cleanGrid(Core.sheetText(wb.Sheets[wb.SheetNames[0]]));
    const an = R.analyze(kind === 'sc' ? 'SC' : kind === 'webi' ? 'Webi' : kind === 'jvu' ? 'JVU' : 'Accrual', grid);
    const flat = grid.slice(0, 12).flat().map((c) => String(c).trim());
    const all = grid.flat().map((c) => String(c).trim());
    const cur = flat.find((c) => CURRENCIES.includes(c)) || '';
    const ic = all.find((c) => /^IC-\d\d-[A-Z0-9]+$/i.test(c)) || '';
    const email = all.find((c) => /@/.test(c) && /\./.test(c)) || '';
    const po = all.find((c) => /^RRBP\./i.test(c)) || '';
    const amount = R.amountForCompare(kind === 'jvu' ? 'JVU' : 'Webi', an);
    return { lines: Math.max(0, grid.length - 1), amount, currency: cur, ic, coderEmail: email, po, docDate: an.dates[0] || null };
  }
  function supplierRows(wb) {
    const rows = Core.sheetRows(wb.Sheets[wb.SheetNames[0]]);
    const sup = RC.detectSupplier(rows);
    const c = sup.cols;
    const hdrCur = c.amount >= 0 ? (String(sup.header[c.amount] || '').match(/\b(GBP|USD|MXN|EUR)\b/i) || [, ''])[1].toUpperCase() : '';
    return sup.data.map((d) => ({
      name: d.name, amount: c.amount >= 0 ? parseNum(d.raw[c.amount]) : null,
      currency: (c.currency >= 0 ? str(d.raw[c.currency]).toUpperCase() : '') || hdrCur,
      service: c.service >= 0 ? str(d.raw[c.service]) : '', hrbp: c.hrbp >= 0 ? str(d.raw[c.hrbp]) : '',
      func: c.func >= 0 ? str(d.raw[c.func]) : '', ceco: c.ceco >= 0 ? str(d.raw[c.ceco]).toUpperCase() : ''
    }));
  }
  function reclassRows(wb) {
    const ws = (Core.getSheet(wb, ['Reclasificacion por CeCo']) || { ws: wb.Sheets[wb.SheetNames[0]] }).ws;
    const rows = Core.sheetRows(ws);
    const h = Core.findHeaderRow(rows, ['Row Labels', 'Sum of Gross', 'MXN', 'GBP'], 40);
    if (h < 0) return [];
    const hd = rows[h];
    const cm = Core.findCol(hd, [/mxn/]), cg = Core.findCol(hd, [/gbp/, /original/]);
    const out = [];
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const k = str(r[0]);
      if (!k) continue;
      if (/grand total|^total/i.test(k)) break;
      out.push({ ceco: k.toUpperCase(), mxn: cm >= 0 ? parseNum(r[cm]) : null, gbp: cg >= 0 ? parseNum(r[cg]) : null });
    }
    return out;
  }
  function hrInputInfo(wb, year) {
    for (const sn of wb.SheetNames) {
      try {
        const parsed = HC.parseHRInput(Core.sheetRows(wb.Sheets[sn]));
        const pos = HC.computePositions(parsed.positions, { cutoffs: HC.defaultCutoffs(year), multiEntity: false, splitMarketing: false });
        return { market: HC.detectMarket(parsed) || '', positions: pos.length, sop: pos.reduce((a, p) => a + p.countSOP, 0), coplan: pos.reduce((a, p) => a + p.countCOPLAN, 0) };
      } catch (e) { /* siguiente hoja */ }
    }
    return null;
  }

  /** Huella del contenido (FNV-1a de 32 bits) para detectar copias idénticas aunque tengan otro nombre. */
  function fingerprint(u8) {
    if (!(u8 instanceof Uint8Array)) return '';
    let h = 0x811c9dc5;
    for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16) + ':' + u8.length;
  }
  /** Procesa un archivo. f = { path, size, lastModified, data: Uint8Array | string }  → registro */
  function processFile(f, opts) {
    opts = opts || {};
    const ctx = pathContext(f.path);
    const rec = { path: f.path, name: ctx.name, folder: ctx.folder, size: f.size || 0, modified: f.lastModified || null, ctx, type: null, data: null, note: '', hash: fingerprint(f.data) };
    try {
      let type = classifyByName(ctx);
      if (type === 'otro') { rec.type = 'otro'; return rec; }
      if (/^msg/.test(type)) {
        rec.type = type;
        rec.data = parseMsg(f.data);
        if (rec.type === 'msg' && /^re:/i.test(rec.data.subject)) rec.type = 'msg-hrbp';
        if (rec.type === 'msg' && /non-po|billing/i.test(rec.data.subject)) rec.type = 'msg-global';
        if (!ctx.provider) { const p = PROVIDERS.find((x) => new RegExp('\\b' + x + '\\b', 'i').test(rec.data.subject)); if (p) ctx.provider = p; }
        return rec;
      }
      const wb = Core.readWorkbook(f.data);
      if (!type) type = classifyByContent(wb, ctx);
      rec.type = type;
      rec.sheets = wb.SheetNames.length;
      switch (type) {
        case 'webi': case 'jvu': case 'accrual': case 'sc': rec.data = docInfo(type, wb); break;
        case 'supplier': case 'sent': case 'retrieved': rec.data = { rows: supplierRows(wb) }; break;
        case 'reclass': rec.data = { rows: reclassRows(wb) }; break;
        case 'ksb1': rec.data = { lines: RC.readKSB1(Core.sheetRows(wb.Sheets[wb.SheetNames[0]])) }; break;
        case 'cecos': rec.data = RC.readCecos(Core.sheetRows(wb.Sheets[wb.SheetNames[0]])); break;
        case 'hrinput': rec.data = hrInputInfo(wb, opts.year || new Date().getFullYear()); break;
        case 'tracker': { const t = R.readPreviousTracker(wb); rec.data = t ? { rows: t.rows } : null; break; }
        case 'estimate': { const s = Core.getSheet(wb, ['People']); rec.data = { people: s ? Core.sheetRows(s.ws).filter((r) => r && !isBlank(r[0])).length - 1 : 0 }; break; }
        case 'consolidado': { const s = Core.getSheet(wb, ['Histórico K2', 'Historico K2']); rec.data = { rows: s ? RC.readSource(Core.sheetRows(s.ws), 'Histórico').length : 0 }; break; }
        default: break;
      }
    } catch (e) {
      rec.type = 'error';
      rec.note = e.message || String(e);
    }
    return rec;
  }

  // ---------- Consolidado ----------
  function aggregate(records, opts) {
    opts = opts || {};
    const sociedad = String(opts.sociedad || 'MX15').toUpperCase();
    const A = { records, counts: {}, alerts: [], recharges: [], docs: [], charges: [], cecosRows: [], reclass: [], sap: [], hc: [], mails: [], evidence: [], trackers: [] };
    const alert = (tipo, detalle, ruta) => A.alerts.push({ tipo, detalle, ruta: ruta || '' });
    records.forEach((r) => { A.counts[r.type] = (A.counts[r.type] || 0) + 1; });

    // Duplicados: mismo contenido exacto (aunque cambie el nombre o la carpeta)
    const seen = {};
    records.forEach((r) => { if (r.hash && r.size > 0) (seen[r.hash] = seen[r.hash] || []).push(r); });
    Object.values(seen).filter((l) => l.length > 1).forEach((l) => {
      const names = Array.from(new Set(l.map((x) => x.name)));
      const folders = Array.from(new Set(l.map((x) => x.folder || '(raíz)')));
      const short = (arr) => arr.slice(0, 4).join(' = ') + (arr.length > 4 ? ' … y ' + (arr.length - 4) + ' más' : '');
      alert('Archivo duplicado', l.length + ' copias idénticas: ' + short(names), folders.slice(0, 4).join(' | ') + (folders.length > 4 ? ' …' : ''));
    });

    // Documentos de recobro (preferir .xlsx sobre .txt del mismo nombre)
    const docs = {};
    records.filter((r) => ['webi', 'jvu', 'accrual', 'sc'].includes(r.type) && r.data).forEach((r) => {
      const k = r.folder + '|' + norm(r.ctx.base);
      if (!docs[k] || (docs[k].ctx.ext === 'txt' && r.ctx.ext !== 'txt')) docs[k] = Object.assign({}, r, { hasTxt: (docs[k] && docs[k].ctx.ext === 'txt') || r.ctx.ext === 'txt' });
      else if (r.ctx.ext === 'txt') docs[k].hasTxt = true;
    });
    A.docs = Object.values(docs).map((r) => ({
      half: r.ctx.half || '', key: r.ctx.key || '', employee: r.ctx.employee || '', kind: TYPES[r.type], type: r.type, amount: r.data.amount, currency: r.data.currency,
      ic: r.data.ic, coderEmail: r.data.coderEmail, po: r.data.po, docDate: r.data.docDate, lines: r.data.lines, hasTxt: !!r.hasTxt, path: r.path
    }));
    const emp = {};
    A.docs.forEach((d) => {
      const k = (d.half || '?') + '|' + (d.key || '?') + '|' + norm(d.employee);
      const e = emp[k] = emp[k] || { half: d.half, key: d.key, employee: d.employee, sc: null, webi: null, jvu: null, accrual: null, currency: '', ic: '', po: '' };
      e[d.type] = d.amount === null ? 0 : d.amount;
      e.currency = e.currency || d.currency; e.ic = e.ic || d.ic; e.po = e.po || d.po;
      if ((d.type === 'webi' || d.type === 'jvu' || d.type === 'accrual') && !d.hasTxt) alert('Falta el TXT para SAP', d.kind + ' de ' + d.employee, d.path);
    });
    A.recharges = Object.values(emp).sort((a, b) => (a.half || '').localeCompare(b.half || '') || (parseInt(a.key, 10) || 0) - (parseInt(b.key, 10) || 0));
    A.recharges.forEach((e) => {
      const who = (e.half ? e.half + ' · ' : '') + e.key + '. ' + e.employee;
      e.status = e.jvu !== null ? 'JVU generado' : e.accrual !== null ? 'Accrual generado' : e.webi !== null ? 'Webi sin JVU' : 'Solo Shopping Cart';
      if (e.webi !== null && e.jvu === null && e.accrual === null) alert('Webi sin JVU ni Accrual', who);
      if (e.webi === null && (e.jvu !== null || e.accrual !== null)) alert('JVU/Accrual sin Webi', who);
      if (e.webi !== null && e.sc === null) alert('Webi sin Shopping Cart', who);
      if (e.webi !== null && e.jvu !== null && Core.round(e.webi - e.jvu, 2) !== 0) alert('Monto Webi ≠ JVU', who + ': ' + e.webi + ' vs ' + e.jvu + ' (si lleva Mark Up es normal)');
    });

    // All CeCos más reciente para validar
    const cec = records.filter((r) => r.type === 'cecos' && r.data && r.data.count).sort((a, b) => (b.modified || 0) - (a.modified || 0))[0];
    A.cecosSource = cec ? cec.path : '';

    // Cargos de proveedores y CeCos asignados
    records.filter((r) => ['supplier', 'retrieved'].includes(r.type) && r.data).forEach((r) => {
      const bad = [];
      r.data.rows.forEach((x) => {
        const row = { month: r.ctx.month || '', provider: r.ctx.provider || '', name: x.name, service: x.service, amount: x.amount, currency: x.currency, hrbp: x.hrbp, func: x.func, ceco: x.ceco, path: r.path };
        if (r.type === 'supplier') A.charges.push(row);
        else {
          const v = RC.validateCeco(x.ceco, cec ? cec.data : null, sociedad);
          row.validation = v.status === 'OK' ? 'OK' : v.text;
          if (cec && v.status !== 'OK') bad.push(x.name + ' (' + (x.ceco || 'sin CeCo') + ')');
          A.cecosRows.push(row);
        }
      });
      if (bad.length) alert('CeCo fuera de ' + sociedad, (r.ctx.month ? Core.MESES[r.ctx.month - 1] + ' · ' : '') + (r.ctx.provider ? r.ctx.provider + ' · ' : '') + bad.length + ' cargo(s): ' + bad.join(', '), r.path);
    });
    // Si un mes/proveedor no tiene archivo del proveedor, usa el Retrieved como fuente de cargos
    const keyMP = (x) => x.month + '|' + norm(x.provider);
    const withSup = new Set(A.charges.map(keyMP));
    A.cecosRows.forEach((x) => { if (!withSup.has(keyMP(x))) A.charges.push(Object.assign({}, x, { fromRetrieved: true })); });

    records.filter((r) => r.type === 'reclass' && r.data).forEach((r) => r.data.rows.forEach((x) => A.reclass.push(Object.assign({ month: r.ctx.month || '', provider: r.ctx.provider || '', path: r.path }, x))));

    // KSB1 (sin duplicar movimientos repetidos en varias descargas)
    const sapSeen = new Set();
    records.filter((r) => r.type === 'ksb1' && r.data).sort((a, b) => (a.ctx.fileDate || 0) - (b.ctx.fileDate || 0)).forEach((r) => r.data.lines.forEach((l) => {
      const k = l.doc + '|' + l.tran + '|' + l.obj + '|' + l.date;
      if (sapSeen.has(k)) return;
      sapSeen.add(k);
      A.sap.push(Object.assign({ file: r.name }, l));
    }));

    records.filter((r) => r.type === 'hrinput' && r.data).forEach((r) => A.hc.push(Object.assign({ file: r.name, path: r.path, modified: r.modified }, r.data)));
    records.filter((r) => /^msg/.test(r.type) && r.data).forEach((r) => A.mails.push({ type: TYPES[r.type], date: r.data.date, subject: r.data.subject, from: r.data.from, to: r.data.to, attachments: r.data.attachments.join(', '), month: r.ctx.month || '', provider: r.ctx.provider || '', path: r.path }));
    records.filter((r) => r.type === 'tracker' && r.data).forEach((r) => {
      const cnt = {};
      r.data.rows.forEach((x) => { const s = R.nextStep(x); cnt[s] = (cnt[s] || 0) + 1; });
      A.trackers.push({ file: r.name, path: r.path, half: r.ctx.half || '', total: r.data.rows.length, steps: cnt });
    });

    // Evidencia por carpeta de mes/proveedor
    const folders = {};
    records.forEach((r) => { if (r.ctx.month && r.ctx.provider && /suppliers/i.test(r.folder)) (folders[r.folder] = folders[r.folder] || { month: r.ctx.month, provider: r.ctx.provider, names: [] }).names.push(r.name); });
    Object.entries(folders).sort((a, b) => a[1].month - b[1].month || a[1].provider.localeCompare(b[1].provider)).forEach(([folder, f]) => {
      const items = RC.evidenceChecklist(f.names, f.provider, sociedad);
      const miss = items.filter((i) => !i.ok).map((i) => i.label);
      A.evidence.push({ month: f.month, provider: f.provider, folder, items, ok: items.filter((i) => i.ok).length, missing: miss.join(', ') });
      if (miss.length) alert('Evidencia incompleta', Core.MESES[f.month - 1] + ' · ' + f.provider + ': falta ' + miss.join(', '), folder);
    });
    // Mes con cargos pero sin reclasificación
    const recl = new Set(A.reclass.map(keyMP));
    Array.from(new Set(A.charges.filter((c) => c.month).map(keyMP))).forEach((k) => {
      if (!recl.has(k)) { const [m, p] = k.split('|'); alert('Cargos sin reclasificación', Core.MESES[m - 1] + ' · ' + (p || 'proveedor ?')); }
    });
    records.filter((r) => r.type === 'error').forEach((r) => alert('No se pudo leer', r.note, r.path));
    records.filter((r) => r.type === 'excel').forEach((r) => alert('Excel no reconocido', r.name, r.path));
    return A;
  }

  function totalsBy(list, keyFn, valFn) {
    const m = {};
    list.forEach((x) => { const k = keyFn(x); m[k] = (m[k] || 0) + (Number(valFn(x)) || 0); });
    return m;
  }

  async function buildWorkbook(A, opts) {
    opts = opts || {};
    const wb = Core.newWorkbook();
    const C = Core.COLORS;
    const year = opts.year || '';
    const mes = (m) => (m ? Core.pad(m) + '. ' + Core.MESES[m - 1] : '');
    // Resumen
    const ws = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
    Core.title(ws, 1, 'Archivo anual HRSS ' + year, 'Generado: ' + Core.stamp() + ' · ' + A.records.length + ' archivos leídos · ' + A.alerts.length + ' alertas');
    const t1 = Core.writeTable(ws, 4, [{ header: 'Tipo de archivo', width: 30 }, { header: 'Archivos', width: 10, total: true }],
      Object.entries(A.counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => [TYPES[k] || k, v]), { totals: true });
    const recTot = totalsBy(A.recharges.filter((e) => e.jvu !== null || e.webi !== null), (e) => e.currency || '?', (e) => (e.jvu !== null ? e.jvu : e.webi));
    const chTot = totalsBy(A.charges, (c) => (c.provider || '?') + ' (' + (c.currency || '?') + ')', (c) => c.amount);
    const kpis = [
      ['Asignaciones con documentos de recobro', A.recharges.length],
      ...Object.entries(recTot).map(([c, v]) => ['Monto recobrado (JVU, o Webi si aún no hay JVU) ' + c, Core.round(v, 2)]),
      ...Object.entries(chTot).map(([k, v]) => ['Cargos de proveedor ' + k, Core.round(v, 2)]),
      ['Reclasificado (MXN)', Core.round(A.reclass.reduce((a, r) => a + (r.mxn || 0), 0), 2)],
      ['Movimientos SAP (KSB1, sin duplicados)', A.sap.length],
      ['Correos .msg', A.mails.length],
      ['Alertas', A.alerts.length]
    ];
    Core.writeTable(ws, 4, [{ header: 'Indicador', width: 52 }, { header: 'Valor', width: 18, numFmt: '#,##0.##' }], kpis, { startCol: 4 });
    ws.getColumn(3).width = 3;
    void t1;

    const sheet = (name, title, cols, rows, o) => {
      const w = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 3 }] });
      Core.title(w, 1, title, rows.length + ' fila(s)');
      Core.writeTable(w, 3, cols, rows, Object.assign({ autoFilter: true }, o || {}));
      return w;
    };
    const money = '#,##0.00';
    sheet('Recobros por asignación', 'Recobros: documentos por asignación', [
      { header: 'Periodo', width: 9 }, { header: 'KEY', width: 6 }, { header: 'Empleado', width: 34 }, { header: 'Shopping Cart', width: 13, numFmt: money }, { header: 'Webi', width: 13, numFmt: money },
      { header: 'JVU', width: 13, numFmt: money }, { header: 'Accrual', width: 13, numFmt: money }, { header: 'Moneda', width: 8 }, { header: 'IC code', width: 13 }, { header: 'PO (RRB WBS)', width: 26 }, { header: 'Estatus', width: 18 }
    ], A.recharges.map((e) => [e.half, e.key, e.employee, e.sc, e.webi, e.jvu, e.accrual, e.currency, e.ic, e.po, e.status]), {
      rowStyle: (row, r) => { const c = row.getCell(11); c.fill = Core.fill(/JVU|Accrual generado/.test(r[10]) ? C.green : C.yellow); }
    });
    sheet('Documentos de recobro', 'SC / Webi / JVU / Accrual encontrados', [
      { header: 'Periodo', width: 9 }, { header: 'KEY', width: 6 }, { header: 'Empleado', width: 32 }, { header: 'Documento', width: 14 }, { header: 'Monto', width: 13, numFmt: money }, { header: 'Moneda', width: 8 },
      { header: 'Líneas', width: 7 }, { header: 'IC code', width: 13 }, { header: 'Coder email', width: 28 }, { header: 'PO', width: 26 }, { header: 'Fecha documento', width: 13, numFmt: 'dd/mm/yyyy' }, { header: 'TXT', width: 6 }, { header: 'Ruta', width: 70 }
    ], A.docs.map((d) => [d.half, d.key, d.employee, d.kind, d.amount, d.currency, d.lines, d.ic, d.coderEmail, d.po, d.docDate ? Core.serialToJSDate(d.docDate) : null, d.type === 'sc' ? '' : d.hasTxt ? 'Sí' : 'No', d.path]));
    sheet('Cargos proveedores', 'Cargos de proveedores de movilidad', [
      { header: 'Mes', width: 13 }, { header: 'Proveedor', width: 10 }, { header: 'Nombre', width: 32 }, { header: 'Servicio', width: 40 }, { header: 'Monto', width: 13, numFmt: money, total: true },
      { header: 'Moneda', width: 8 }, { header: 'HRBP', width: 24 }, { header: 'Home Function', width: 20 }, { header: 'CeCo', width: 13 }, { header: 'Fuente', width: 12 }, { header: 'Ruta', width: 60 }
    ], A.charges.map((c) => [mes(c.month), c.provider, c.name, c.service, c.amount, c.currency, c.hrbp, c.func, c.ceco, c.fromRetrieved ? 'Retrieved' : 'Proveedor', c.path]), { totals: true });
    // Matriz mes × proveedor
    const provs = Array.from(new Set(A.charges.map((c) => c.provider || '?'))).sort();
    const months = Array.from(new Set(A.charges.map((c) => c.month).filter(Boolean))).sort((a, b) => a - b);
    const mx = months.map((m) => [mes(m)].concat(provs.map((p) => Core.round(A.charges.filter((c) => c.month === m && (c.provider || '?') === p).reduce((a, c) => a + (c.amount || 0), 0), 2))));
    sheet('Cargos por mes', 'Cargos por mes y proveedor (moneda original)', [{ header: 'Mes', width: 14 }].concat(provs.map((p) => ({ header: p, width: 14, numFmt: money, total: true }))), mx, { totals: true, autoFilter: false });
    sheet('CeCos asignados', 'CeCos devueltos por los HRBPs (Retrieved) · validados contra ' + (A.cecosSource || 'sin catálogo'), [
      { header: 'Mes', width: 13 }, { header: 'Proveedor', width: 10 }, { header: 'Nombre', width: 32 }, { header: 'HRBP', width: 24 }, { header: 'Home Function', width: 20 }, { header: 'CeCo', width: 13 },
      { header: 'Validación', width: 30, style: (c) => { c.fill = Core.fill(c.value === 'OK' ? C.green : C.red); } }, { header: 'Monto', width: 13, numFmt: money }, { header: 'Ruta', width: 60 }
    ], A.cecosRows.map((c) => [mes(c.month), c.provider, c.name, c.hrbp, c.func, c.ceco, A.cecosSource ? c.validation : 'Sin catálogo', c.amount, c.path]));
    sheet('Reclasificaciones', 'Reclasificaciones por CeCo', [
      { header: 'Mes', width: 13 }, { header: 'Proveedor', width: 10 }, { header: 'CeCo', width: 14 }, { header: 'MXN', width: 15, numFmt: money, total: true }, { header: 'Moneda original', width: 15, numFmt: money, total: true }, { header: 'Ruta', width: 60 }
    ], A.reclass.map((r) => [mes(r.month), r.provider, r.ceco, r.mxn, r.gbp, r.path]), { totals: true });
    sheet('Movimientos SAP', 'Movimientos de KSB1 (sin duplicados entre descargas)', [
      { header: 'Documento', width: 14 }, { header: 'Fecha', width: 12, numFmt: 'dd/mm/yyyy' }, { header: 'Texto', width: 34 }, { header: 'Valor', width: 14, numFmt: money }, { header: 'Moneda', width: 8 },
      { header: 'Valor MXN', width: 15, numFmt: money }, { header: 'CeCo', width: 13 }, { header: 'Archivo', width: 28 }
    ], A.sap.map((l) => [l.doc, l.date ? Core.serialToJSDate(l.date) : null, l.text, l.tran, l.tcur, l.obj, l.ceco, l.file]));
    sheet('Evidencia por mes', 'Checklist de evidencia por mes y proveedor', [
      { header: 'Mes', width: 13 }, { header: 'Proveedor', width: 10 }, { header: 'Completas', width: 11 }].concat(['Correo Global', 'Reporte proveedor', 'Sent to HRBPs', 'Retrieved', 'Correo HRBP', 'Reclasificación'].map((h) => ({
      header: h, width: 14, style: (c) => { c.fill = Core.fill(c.value === '✔' ? C.green : C.red); c.alignment = { horizontal: 'center' }; }
    }))).concat([{ header: 'Carpeta', width: 50 }]),
    A.evidence.map((e) => [mes(e.month), e.provider, e.ok + ' de 6'].concat(e.items.map((i) => (i.ok ? '✔' : '✖'))).concat([e.folder])));
    if (A.hc.length) sheet('Headcount', 'HR Input Reports encontrados (conteo con las fechas de corte del año ' + year + ')', [
      { header: 'Archivo', width: 40 }, { header: 'Mercado', width: 20 }, { header: 'Posiciones', width: 11 }, { header: 'Cuenta SOP', width: 11 }, { header: 'Cuenta COPLAN', width: 13 }, { header: 'Modificado', width: 14, numFmt: 'dd/mm/yyyy' }, { header: 'Ruta', width: 60 }
    ], A.hc.map((h) => [h.file, h.market, h.positions, h.sop, h.coplan, h.modified ? new Date(h.modified) : null, h.path]));
    if (A.trackers.length) sheet('Trackers', 'Trackers encontrados y siguiente paso de sus asignaciones', [
      { header: 'Archivo', width: 36 }, { header: 'Periodo', width: 9 }, { header: 'Asignaciones', width: 13 }, { header: 'Siguiente paso (conteo)', width: 90 }, { header: 'Ruta', width: 60 }
    ], A.trackers.map((t) => [t.file, t.half, t.total, Object.entries(t.steps).map(([k, v]) => k + ': ' + v).join(' · '), t.path]));
    sheet('Correos', 'Correos .msg', [
      { header: 'Fecha', width: 12, numFmt: 'dd/mm/yyyy' }, { header: 'Tipo', width: 22 }, { header: 'Asunto', width: 50 }, { header: 'De', width: 24 }, { header: 'Para', width: 40 }, { header: 'Adjuntos', width: 40 },
      { header: 'Mes (carpeta)', width: 13 }, { header: 'Proveedor', width: 10 }, { header: 'Ruta', width: 60 }
    ], A.mails.map((m) => [m.date ? Core.serialToJSDate(m.date) : null, m.type, m.subject, m.from, m.to, m.attachments, mes(m.month), m.provider, m.path]));
    sheet('Alertas', 'Alertas', [{ header: 'Tipo', width: 30 }, { header: 'Detalle', width: 80 }, { header: 'Ruta / carpeta', width: 70 }], A.alerts.map((a) => [a.tipo, a.detalle, a.ruta]), {
      rowStyle: (row) => { row.getCell(1).fill = Core.fill(C.yellow); }
    });
    sheet('Inventario', 'Todos los archivos', [
      { header: 'Tipo detectado', width: 26 }, { header: 'Archivo', width: 44 }, { header: 'Carpeta', width: 60 }, { header: 'Mes', width: 12 }, { header: 'Proveedor', width: 10 }, { header: 'Periodo', width: 8 },
      { header: 'KEY', width: 6 }, { header: 'Empleado', width: 30 }, { header: 'Tamaño (KB)', width: 11 }, { header: 'Modificado', width: 14, numFmt: 'dd/mm/yyyy' }, { header: 'Nota', width: 40 }
    ], A.records.map((r) => [TYPES[r.type] || r.type, r.name, r.folder, mes(r.ctx.month), r.ctx.provider || '', r.ctx.half || '', r.ctx.key || '', r.ctx.employee || '', Math.round((r.size || 0) / 1024), r.modified ? new Date(r.modified) : null, r.note]));
    return wb;
  }

  return { TYPES, fingerprint, pathContext, parseMsg, classifyByName, classifyByContent, processFile, aggregate, buildWorkbook, totalsBy };
});
