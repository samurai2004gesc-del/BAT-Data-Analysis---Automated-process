/* Core: utilidades compartidas (lectura de archivos, normalización, fechas, Excel).
 * Funciona en el navegador (window.Core) y en Node (require) para las pruebas. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root, true);
  else root.Core = factory(root, false);
})(typeof self !== 'undefined' ? self : this, function (root, isNode) {
  'use strict';

  function lib(name) {
    if (isNode) return require(name === 'XLSX' ? 'xlsx' : name === 'ExcelJS' ? 'exceljs' : 'jszip');
    return root[name];
  }

  // ---------- Texto ----------
  function norm(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/_x([0-9a-fA-F]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16))) // "inc_x002e_VAT" → "inc.VAT"
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[‘’´`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim().toLowerCase();
  }
  function isBlank(v) {
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  }
  function str(v) { return isBlank(v) ? '' : String(v).trim(); }

  // ---------- Números ----------
  function parseNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (isBlank(v)) return null;
    let s = String(v).trim();
    let pct = false;
    if (s.endsWith('%')) { pct = true; s = s.slice(0, -1).trim(); }
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[£$€\s]/g, '').replace(/(GBP|MXN|USD|EUR)/gi, '');
    if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
    } else {
      s = s.replace(/,/g, '');
    }
    if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
    const n = Number(s);
    if (!isFinite(n) || s === '') return null;
    let r = neg ? -n : n;
    if (pct) r = r / 100;
    return r;
  }
  function round(n, d) { const f = Math.pow(10, d === undefined ? 2 : d); return Math.round((n + Number.EPSILON) * f) / f; }

  // ---------- Fechas (se manejan como número de serie de Excel) ----------
  const EPOCH = Date.UTC(1899, 11, 30);
  function ymdToSerial(y, m, d) { return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000); }
  function serialToYMD(n) {
    const dt = new Date(EPOCH + Math.floor(n) * 86400000);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }
  function validYMD(y, m, d) { return y >= 1900 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= 31; }
  /** Convierte cualquier representación de fecha a número de serie de Excel. order: 'dmy' | 'mdy' */
  function parseDate(v, order) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v instanceof Date) {
      if (isNaN(v)) return null;
      return ymdToSerial(v.getFullYear(), v.getMonth() + 1, v.getDate());
    }
    const s = String(v).trim();
    let m;
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) {
      if (validYMD(+m[1], +m[2], +m[3])) return ymdToSerial(+m[1], +m[2], +m[3]);
    }
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) {
      if (validYMD(+m[1], +m[2], +m[3])) return ymdToSerial(+m[1], +m[2], +m[3]);
    }
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))) {
      let a = +m[1], b = +m[2], y = +m[3];
      if (y < 100) y += 2000;
      let d, mo;
      if (a > 12) { d = a; mo = b; } else if (b > 12) { mo = a; d = b; } else if (order === 'mdy') { mo = a; d = b; } else { d = a; mo = b; }
      if (validYMD(y, mo, d)) return ymdToSerial(y, mo, d);
    }
    const months = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
    if ((m = norm(s).match(/^(\d{1,2})[- ]([a-z]{3})[a-z]*[- ,]+(\d{2,4})$/))) {
      const mo = months[m[2]]; let y = +m[3]; if (y < 100) y += 2000;
      if (mo && validYMD(y, mo, +m[1])) return ymdToSerial(y, mo, +m[1]);
    }
    const n = Number(s);
    if (isFinite(n) && s !== '' && n > 0 && n < 2958466) return n;
    return null;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(serial) {
    if (serial === null || serial === undefined || serial === '') return '';
    const { y, m, d } = serialToYMD(serial);
    return pad(d) + '/' + pad(m) + '/' + y;
  }
  function serialToJSDate(serial) { const { y, m, d } = serialToYMD(serial); return new Date(Date.UTC(y, m - 1, d)); }
  function todaySerial() { const t = new Date(); return ymdToSerial(t.getFullYear(), t.getMonth() + 1, t.getDate()); }
  function stamp() {
    const t = new Date();
    return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()) + ' ' + pad(t.getHours()) + pad(t.getMinutes());
  }
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // ---------- Lectura de libros ----------
  function readWorkbook(data, opts) {
    const XLSX = lib('XLSX');
    const o = Object.assign({ type: 'array', cellDates: false, cellNF: true, cellText: true, dense: false }, opts || {});
    if (typeof data === 'string') o.type = 'string';
    return XLSX.read(data, o);
  }
  /** Filas como arreglos con valores crudos (números, textos). Las fechas quedan como número de serie. */
  function sheetRows(ws, raw) {
    const XLSX = lib('XLSX');
    if (!ws || !ws['!ref']) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: raw !== false, defval: null, blankrows: true });
  }
  /** Filas con el texto tal como Excel lo muestra (para exportar a TXT). */
  function sheetText(ws) {
    const XLSX = lib('XLSX');
    if (!ws || !ws['!ref']) return [];
    const range = XLSX.utils.decode_range(ws['!ref']);
    const out = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell || cell.v === undefined || cell.v === null) { row.push(''); continue; }
        if (cell.t === 'e') { row.push(cell.w || ''); continue; }
        let w = cell.w;
        if (w === undefined) w = String(cell.v);
        row.push(w);
      }
      out.push(row);
    }
    return out;
  }
  function getSheet(wb, names) {
    const list = Array.isArray(names) ? names : [names];
    for (const n of list) {
      const target = norm(n);
      const found = wb.SheetNames.find((s) => norm(s) === target);
      if (found) return { name: found, ws: wb.Sheets[found] };
    }
    for (const n of list) {
      const target = norm(n);
      const found = wb.SheetNames.find((s) => norm(s).includes(target));
      if (found) return { name: found, ws: wb.Sheets[found] };
    }
    return null;
  }

  // ---------- Encabezados ----------
  /** Busca la fila de encabezados: la primera fila (en las primeras maxScan) que contenga más coincidencias. */
  function findHeaderRow(rows, keywords, maxScan) {
    let best = -1, bestScore = 0;
    const lim = Math.min(rows.length, maxScan || 60);
    for (let i = 0; i < lim; i++) {
      const r = rows[i] || [];
      let score = 0;
      for (const cell of r) {
        const n = norm(cell);
        if (!n) continue;
        if (keywords.some((k) => (k instanceof RegExp ? k.test(n) : n === norm(k) || n.includes(norm(k))))) score++;
      }
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }
  /** Devuelve el índice de la primera columna cuyo encabezado coincide con alguno de los candidatos. */
  function findCol(headers, candidates, exclude) {
    const H = headers.map(norm);
    const ex = (exclude || []).map(norm);
    for (const c of candidates) {
      if (c instanceof RegExp) continue;
      const i = H.findIndex((h) => h === norm(c) && !ex.includes(h));
      if (i >= 0) return i;
    }
    for (const c of candidates) {
      const i = H.findIndex((h) => h && !ex.some((e) => h.includes(e)) && (c instanceof RegExp ? c.test(h) : h.includes(norm(c))));
      if (i >= 0) return i;
    }
    return -1;
  }
  function headerLabels(headerRow) {
    return (headerRow || []).map((h, i) => (isBlank(h) ? 'Columna ' + colLetter(i) : String(h).trim()));
  }
  function colLetter(i) {
    let s = '';
    i = i + 1;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  function rowIsEmpty(r) { return !r || r.every(isBlank); }

  // ---------- Nombres de personas ----------
  function nameTokens(s) {
    return norm(s).replace(/[,.;]/g, ' ').split(' ').filter((t) => t && t.length > 1);
  }
  /** Compara dos nombres sin importar el orden (Nombre Apellido vs Apellido, Nombre). 0..1 */
  function nameScore(a, b) {
    const A = nameTokens(a), B = nameTokens(b);
    if (!A.length || !B.length) return 0;
    const setB = new Set(B);
    const common = A.filter((t) => setB.has(t)).length;
    const small = Math.min(A.length, B.length);
    if (common === A.length && common === B.length) return 1;
    if (common >= 2 && common === small) return 0.9;
    if (common >= 2) return 0.6 + 0.1 * (common / Math.max(A.length, B.length));
    return 0;
  }

  // ---------- Codificación Windows-1252 (como el TXT que guarda Excel) ----------
  const CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
  function encodeCP1252(text) {
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 0x80 || (c >= 0xA0 && c <= 0xFF)) out[i] = c;
      else if (CP1252[c] !== undefined) out[i] = CP1252[c];
      else out[i] = 0x3F;
    }
    return out;
  }
  /** Genera texto delimitado por tabuladores con fin de línea CRLF, como "Texto (delimitado por tabulaciones)" de Excel
   *  (verificado byte por byte contra TXT aceptados por SAP: Excel entrecomilla los textos con comas). */
  function toTabText(rows) {
    return rows.map((r) => r.map((v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[\t\r\n",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join('\t')).join('\r\n') + '\r\n';
  }
  /** Quita filas vacías y columnas vacías al final (SAP rechaza líneas sin valores). */
  function cleanGrid(rows) {
    const kept = rows.filter((r) => !rowIsEmpty(r));
    let maxCol = 0;
    kept.forEach((r) => { for (let c = r.length - 1; c >= 0; c--) { if (!isBlank(r[c])) { maxCol = Math.max(maxCol, c + 1); break; } } });
    let firstCol = maxCol;
    kept.forEach((r) => { for (let c = 0; c < maxCol; c++) { if (!isBlank(r[c])) { firstCol = Math.min(firstCol, c); break; } } });
    if (firstCol >= maxCol) firstCol = 0;
    return kept.map((r) => { const o = []; for (let c = firstCol; c < maxCol; c++) o.push(isBlank(r[c]) ? '' : r[c]); return o; });
  }

  // ---------- Escritura de Excel (ExcelJS) ----------
  const COLORS = {
    navy: 'FF0E2841', blue: 'FF1F4E79', head: 'FF1F4E79', light: 'FFDDEBF7', green: 'FFC6EFCE', greenTx: 'FF006100',
    red: 'FFFFC7CE', redTx: 'FF9C0006', yellow: 'FFFFEB9C', yellowTx: 'FF9C5700', orange: 'FFFCD5B4', grey: 'FFF2F2F2', white: 'FFFFFFFF'
  };
  function newWorkbook() {
    const ExcelJS = lib('ExcelJS');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'HRSS Automatizador';
    wb.created = new Date();
    return wb;
  }
  function fill(color) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }; }
  const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
  const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
  function styleHeader(row, color) {
    row.eachCell({ includeEmpty: false }, (c) => {
      c.font = { bold: true, color: { argb: COLORS.white } };
      c.fill = fill(color || COLORS.head);
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = BORDER;
    });
  }
  /**
   * Escribe una tabla en la hoja. columns: [{header, key, width, numFmt, total}] ; rows: objetos o arreglos.
   * Devuelve {firstRow, lastRow}.
   */
  function writeTable(ws, startRow, columns, rows, opts) {
    opts = opts || {};
    const startCol = opts.startCol || 1;
    const hr = ws.getRow(startRow);
    columns.forEach((col, j) => { hr.getCell(startCol + j).value = col.header; });
    styleHeader(hr, opts.headerColor);
    hr.height = opts.headerHeight || 30;
    let r = startRow + 1;
    rows.forEach((obj) => {
      const row = ws.getRow(r);
      columns.forEach((col, j) => {
        const cell = row.getCell(startCol + j);
        let v = Array.isArray(obj) ? obj[j] : obj[col.key];
        if (v === undefined) v = null;
        cell.value = v;
        if (col.numFmt) cell.numFmt = col.numFmt;
        cell.border = BORDER;
        if (col.style) col.style(cell, obj);
      });
      if (opts.rowStyle) opts.rowStyle(row, obj);
      r++;
    });
    if (opts.totals) {
      const row = ws.getRow(r);
      columns.forEach((col, j) => {
        const cell = row.getCell(startCol + j);
        if (j === 0) cell.value = opts.totalsLabel || 'Total';
        else if (col.total) {
          const L = colLetter(startCol + j - 1);
          const sum = rows.reduce((a, o) => a + (Number(Array.isArray(o) ? o[j] : o[col.key]) || 0), 0);
          cell.value = rows.length ? { formula: 'SUM(' + L + (startRow + 1) + ':' + L + (r - 1) + ')', result: sum } : 0;
          if (col.numFmt) cell.numFmt = col.numFmt;
        }
        cell.font = { bold: true };
        cell.fill = fill(COLORS.light);
        cell.border = BORDER;
      });
      r++;
    }
    columns.forEach((col, j) => { if (col.width) ws.getColumn(startCol + j).width = Math.max(ws.getColumn(startCol + j).width || 0, col.width); });
    if (opts.autoFilter && rows.length) {
      ws.autoFilter = { from: { row: startRow, column: startCol }, to: { row: startRow + rows.length, column: startCol + columns.length - 1 } };
    }
    return { firstRow: startRow, lastRow: r - 1 };
  }
  function title(ws, rowNum, text, sub) {
    const c = ws.getCell(rowNum, 1);
    c.value = text;
    c.font = { bold: true, size: 14, color: { argb: COLORS.navy } };
    if (sub) { const s = ws.getCell(rowNum + 1, 1); s.value = sub; s.font = { italic: true, color: { argb: 'FF595959' } }; }
  }
  async function workbookToBuffer(wb) { return wb.xlsx.writeBuffer(); }

  // ---------- Correo (.eml que Outlook abre como borrador) ----------
  function toBytes(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (data && data.buffer instanceof ArrayBuffer) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return new TextEncoder().encode(String(data));
  }
  function bytesToBase64(data) {
    const u8 = toBytes(data);
    let bin = '';
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function wrap76(s) { return s.replace(/(.{76})/g, '$1\r\n'); }
  function encHeader(s) { return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + bytesToBase64(new TextEncoder().encode(s)) + '?='; }
  function textToHtml(text) {
    const e = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<html><body><div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">' +
      String(text).split(/\n{2,}/).map((p) => '<p>' + e(p).replace(/\n/g, '<br>') + '</p>').join('') + '</div></body></html>';
  }
  /** Arma un .eml con X-Unsent: 1 (Outlook lo abre como borrador editable, con los adjuntos ya puestos). */
  function buildEml(m) {
    const B = '=_hrss_' + Math.random().toString(36).slice(2);
    const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[;,]/)).map((x) => x.trim()).filter(Boolean).join(', ');
    const h = ['X-Unsent: 1', 'MIME-Version: 1.0'];
    if (list(m.to)) h.push('To: ' + encHeader(list(m.to)));
    if (list(m.cc)) h.push('Cc: ' + encHeader(list(m.cc)));
    h.push('Subject: ' + encHeader(m.subject || ''));
    h.push('Content-Type: multipart/mixed; boundary="' + B + '"');
    const parts = [];
    parts.push('Content-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n' + wrap76(bytesToBase64(new TextEncoder().encode(m.html || textToHtml(m.text || '')))));
    (m.attachments || []).forEach((a) => {
      const n = encHeader(a.name);
      parts.push('Content-Type: ' + (a.type || 'application/octet-stream') + '; name="' + n + '"\r\nContent-Disposition: attachment; filename="' + n + '"\r\nContent-Transfer-Encoding: base64\r\n\r\n' + wrap76(bytesToBase64(a.data)));
    });
    return h.join('\r\n') + '\r\n\r\nEste es un mensaje MIME.\r\n' + parts.map((p) => '--' + B + '\r\n' + p + '\r\n').join('') + '--' + B + '--\r\n';
  }
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  // ---------- Navegador ----------
  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  async function downloadWorkbook(wb, filename) {
    const buf = await workbookToBuffer(wb);
    downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
  }
  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(file);
    });
  }
  async function loadFile(file) {
    const buf = await readFileAsArrayBuffer(file);
    const wb = readWorkbook(new Uint8Array(buf));
    return { file, name: file.name, buffer: buf, wb };
  }
  function safeFileName(s) { return String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim(); }

  return {
    lib, norm, isBlank, str, parseNum, round,
    parseDate, ymdToSerial, serialToYMD, fmtDate, serialToJSDate, todaySerial, stamp, pad, MESES, MONTHS_EN,
    readWorkbook, sheetRows, sheetText, getSheet,
    findHeaderRow, findCol, headerLabels, colLetter, rowIsEmpty,
    nameTokens, nameScore,
    encodeCP1252, toTabText, cleanGrid,
    bytesToBase64, textToHtml, buildEml, XLSX_MIME,
    COLORS, BORDER, fill, newWorkbook, styleHeader, writeTable, title, workbookToBuffer,
    downloadBlob, downloadWorkbook, readFileAsArrayBuffer, loadFile, safeFileName
  };
});
