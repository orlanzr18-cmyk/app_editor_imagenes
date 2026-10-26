// Utilidades puras para convertir palabras de OCR en filas, celdas y tablas.
(function (root) {
  function median(arr) {
    const a = [...arr].sort((x, y) => x - y);
    return a.length ? a[Math.floor(a.length / 2)] : 10;
  }

  // words: [{text, x0, y0, x1, y1}] -> filas de celdas [[{text,x0,y0,x1,y1,ws}]]
  // gapFactor: separación máxima (en alturas de letra) para unir palabras en una misma celda.
  function buildRows(words, gapFactor) {
    if (!words.length) return [];
    const medH = Math.max(4, median(words.map((w) => w.y1 - w.y0)));
    const sorted = [...words].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));

    const rows = [];
    for (const w of sorted) {
      const cy = (w.y0 + w.y1) / 2;
      const row = rows[rows.length - 1];
      if (row && Math.abs(cy - row.cy) <= medH * 0.6) {
        row.words.push(w);
        row.cy = row.words.reduce((s, x) => s + (x.y0 + x.y1) / 2, 0) / row.words.length;
      } else {
        rows.push({ cy, words: [w] });
      }
    }

    return rows.map((r) => {
      const ws = r.words.sort((a, b) => a.x0 - b.x0);
      const cells = [];
      let cur = null;
      for (const w of ws) {
        if (cur && w.x0 - cur.x1 <= medH * gapFactor) {
          cur.text += ' ' + w.text;
          cur.x1 = Math.max(cur.x1, w.x1);
          cur.y0 = Math.min(cur.y0, w.y0);
          cur.y1 = Math.max(cur.y1, w.y1);
          cur.ws.push(w);
        } else {
          cur = { text: w.text, x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1, ws: [w] };
          cells.push(cur);
        }
      }
      return cells;
    });
  }

  // rows -> matriz de strings alineada por columnas
  function buildTable(rows) {
    if (!rows.length) return [];
    const multi = rows.filter((r) => r.length >= 2);
    const basis = (multi.length ? multi : rows)
      .flat()
      .map((c) => [c.x0, c.x1])
      .sort((a, b) => a[0] - b[0]);

    const cols = [];
    for (const [a, b] of basis) {
      const last = cols[cols.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else cols.push([a, b]);
    }

    return rows.map((r) => {
      const line = new Array(cols.length).fill('');
      for (const c of r) {
        let best = -1, bestOv = 0;
        cols.forEach((col, i) => {
          const ov = Math.min(c.x1, col[1]) - Math.max(c.x0, col[0]);
          if (ov > bestOv) { bestOv = ov; best = i; }
        });
        if (best < 0) {
          const cx = (c.x0 + c.x1) / 2;
          let bd = Infinity;
          cols.forEach((col, i) => {
            const d = Math.abs(cx - (col[0] + col[1]) / 2);
            if (d < bd) { bd = d; best = i; }
          });
        }
        line[best] = line[best] ? line[best] + ' ' + c.text : c.text;
      }
      return line;
    });
  }

  function toCSV(grid) {
    return grid
      .map((r) => r.map((v) => (/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)).join(','))
      .join('\r\n');
  }

  const api = { buildRows, buildTable, toCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OcrUtils = api;
})(typeof window !== 'undefined' ? window : globalThis);
