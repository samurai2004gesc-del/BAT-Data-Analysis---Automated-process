/* Gráfica de columnas apiladas en SVG (sin librerías). Se usa en pantalla (con tooltip) y como imagen PNG
 * dentro del Excel. Especificación: columnas <= 24px con punta redondeada de 4px y base recta, 2px de separación
 * del color de fondo entre segmentos, rejilla en línea fina, total en la punta de cada columna, leyenda para
 * 2+ series y texto siempre en tinta neutra (nunca del color de la serie). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Chart = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // Paleta categórica validada (orden fijo; el color sigue al proveedor, no a su posición en el ranking)
  const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
  const OTHER = '#898781';
  const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7', surface: '#ffffff' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function niceStep(max, ticks) {
    const raw = max / Math.max(1, ticks);
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function compact(n) {
    const a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 1 }) + 'M';
    if (a >= 1e4) return (n / 1e3).toLocaleString('es-MX', { maximumFractionDigits: a >= 1e5 ? 0 : 1 }) + 'K';
    return Math.round(n).toLocaleString('es-MX');
  }
  /** Columna con punta redondeada (4px) y base recta. */
  function colPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }

  /**
   * opts: { categories: ['Ene', ...], series: [{ name, color, values: [..] }], width, height, unit: 'GBP', title?, fmt? }
   * Devuelve el SVG como texto. Cada segmento lleva data-* para el tooltip (y es el área de hover).
   */
  function stackedColumns(opts) {
    const W = opts.width || 720, H = opts.height || 300;
    const fmt = opts.fmt || ((v) => v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const cats = opts.categories, series = opts.series.filter((s) => s.values.some((v) => v));
    const top = opts.title ? 58 : 26, legendH = series.length > 1 ? 24 : 0, bottom = 30, left = 52, right = 12;
    const plotTop = top + legendH, plotH = H - plotTop - bottom, plotW = W - left - right;
    const totals = cats.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
    const maxT = Math.max(0, ...totals);
    const step = niceStep(maxT || 1, 4);
    const yMax = Math.max(step, Math.ceil(maxT / step) * step);
    const y = (v) => plotTop + plotH - (v / yMax) * plotH;
    const band = plotW / Math.max(1, cats.length);
    const bw = Math.min(24, band * 0.6);
    const font = 'font-family="Segoe UI, system-ui, -apple-system, Roboto, Arial, sans-serif"';
    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(opts.ariaLabel || opts.title || 'Gráfica') + '" ' + font + '>';
    s += '<rect width="' + W + '" height="' + H + '" fill="' + INK.surface + '"/>';
    if (opts.title) {
      s += '<text x="' + left + '" y="22" font-size="15" font-weight="600" fill="' + INK.primary + '">' + esc(opts.title) + '</text>';
      if (opts.subtitle) s += '<text x="' + left + '" y="40" font-size="12" fill="' + INK.secondary + '">' + esc(opts.subtitle) + '</text>';
    }
    // Leyenda (2+ series): cuadro del color de la serie + nombre en tinta neutra
    if (series.length > 1) {
      let lx = left;
      series.forEach((ser) => {
        s += '<rect x="' + lx + '" y="' + (top + 2) + '" width="10" height="10" rx="2" fill="' + ser.color + '"/>';
        s += '<text x="' + (lx + 15) + '" y="' + (top + 11) + '" font-size="12" fill="' + INK.secondary + '">' + esc(ser.name) + '</text>';
        lx += 15 + ser.name.length * 7 + 22;
      });
    }
    // Rejilla y eje Y
    for (let v = 0; v <= yMax + 1e-9; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      s += '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + (v === 0 ? INK.axis : INK.grid) + '" stroke-width="1"/>';
      s += '<text x="' + (left - 8) + '" y="' + (yy + 4) + '" font-size="11" text-anchor="end" fill="' + INK.muted + '" style="font-variant-numeric:tabular-nums">' + compact(v) + '</text>';
    }
    // Columnas apiladas
    cats.forEach((c, i) => {
      const cx = left + band * i + band / 2, x = cx - bw / 2;
      let acc = 0;
      const segs = series.map((ser) => ({ ser, v: ser.values[i] || 0 })).filter((g) => g.v > 0);
      segs.forEach((g, k) => {
        const y0 = y(acc), y1 = y(acc + g.v);
        acc += g.v;
        const gap = k > 0 ? 2 : 0; // separación de 2px del color de fondo entre segmentos
        const h = Math.max(0, y0 - y1 - gap);
        if (h <= 0) return;
        const isTop = k === segs.length - 1;
        const d = isTop ? colPath(x, y1, bw, h, 4) : 'M' + x + ',' + y1 + 'h' + bw + 'v' + h + 'h' + -bw + 'Z';
        s += '<path d="' + d + '" fill="' + g.ser.color + '" data-cat="' + esc(c) + '" data-series="' + esc(g.ser.name) + '" data-value="' + g.v + '" data-total="' + totals[i] + '" class="seg"/>';
      });
      if (totals[i] > 0) s += '<text x="' + cx + '" y="' + (y(totals[i]) - 6) + '" font-size="11" text-anchor="middle" fill="' + INK.secondary + '" style="font-variant-numeric:tabular-nums">' + compact(totals[i]) + '</text>';
      // Área de hover de toda la columna (más grande que la marca)
      s += '<rect x="' + (left + band * i) + '" y="' + plotTop + '" width="' + band + '" height="' + plotH + '" fill="transparent" class="hit" data-idx="' + i + '"/>';
      s += '<text x="' + cx + '" y="' + (H - bottom + 18) + '" font-size="11" text-anchor="middle" fill="' + INK.muted + '">' + esc(c) + '</text>';
    });
    s += '</svg>';
    return { svg: s, totals, series, fmt, width: W, height: H };
  }

  /** Convierte un SVG en PNG (solo navegador). Devuelve Uint8Array. */
  function svgToPng(svg, width, height, scale) {
    scale = scale || 2;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = width * scale; c.height = height * scale;
        const ctx = c.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);
        c.toBlob((b) => (b ? b.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)), reject) : reject(new Error('No se pudo generar la imagen'))), 'image/png');
      };
      img.onerror = () => reject(new Error('No se pudo dibujar la gráfica'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  return { SERIES, OTHER, stackedColumns, svgToPng, compact };
});
