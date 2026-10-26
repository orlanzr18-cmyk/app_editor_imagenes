(() => {
  const $ = (id) => document.getElementById(id);
  const main = $('main-canvas'), mctx = main.getContext('2d');
  const overlay = $('overlay-canvas'), octx = overlay.getContext('2d');
  const stage = $('stage'), viewport = $('viewport'), hint = $('drop-hint');
  const fileInput = $('file-input');
  const scratch = document.createElement('canvas').getContext('2d');

  const DEFAULTS = { brightness: 100, contrast: 100, saturation: 100, blur: 0 };
  const MIN = 10;
  const CELL_GAP = 0.8; // sensibilidad por defecto para agrupar palabras en celdas
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

  const state = {
    source: null,      // canvas con la geometría actual (sin filtros)
    original: null,    // copia para "Restaurar"
    history: [],       // [{src, ocr}] para deshacer
    adj: { ...DEFAULTS },
    filter: 'none',
    fileName: 'imagen',
    crop: null,        // {x,y,w,h} en px de la imagen
    ratio: 0,          // 0 = libre
    scale: 1,          // px de pantalla por px de imagen
    ocr: null,         // {text, words, cells}
    textMode: false,   // modo "editar texto en la imagen"
    hover: -1,
    busy: false
  };

  // ---------- utilidades ----------
  function newCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function clone(src) {
    const c = newCanvas(src.width, src.height);
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }
  function filterString() {
    const a = state.adj;
    let f = `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%)`;
    if (a.blur > 0) f += ` blur(${a.blur}px)`;
    if (state.filter !== 'none') f += ` ${state.filter}(100%)`;
    return f;
  }
  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    if (btn) {
      const old = btn.textContent;
      btn.textContent = '✓ Copiado';
      setTimeout(() => (btn.textContent = old), 1200);
    }
  }
  const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  // ---------- render ----------
  let raf = 0;
  function schedule() {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); });
  }
  function render() {
    const s = state.source;
    if (!s) return;
    stage.classList.remove('hidden');
    main.width = s.width;
    main.height = s.height;
    mctx.filter = filterString();
    mctx.drawImage(s, 0, 0);
    mctx.filter = 'none';
    fit();
  }
  function fit() {
    const s = state.source;
    if (!s) return;
    const aw = viewport.clientWidth - 32, ah = viewport.clientHeight - 32;
    const k = Math.min(aw / s.width, ah / s.height, 1);
    state.scale = k;
    stage.style.width = Math.max(1, Math.round(s.width * k)) + 'px';
    stage.style.height = Math.max(1, Math.round(s.height * k)) + 'px';
    overlay.width = s.width;
    overlay.height = s.height;
    $('zoom-info').textContent = `Zoom: ${Math.round(k * 100)}%`;
    drawOverlay();
  }
  window.addEventListener('resize', fit);

  function ui() {
    const has = !!state.source;
    document.querySelectorAll('[data-needs-image]').forEach((el) => (el.disabled = !has));
    document.querySelectorAll('[data-needs-ocr]').forEach((el) => (el.disabled = !state.ocr));
    $('btn-ocr').disabled = !has || state.busy;
    $('btn-undo').disabled = !state.history.length;
    $('crop-panel').classList.toggle('hidden', !state.crop);
    $('btn-crop').classList.toggle('active', !!state.crop);
    $('btn-text-mode').classList.toggle('active', state.textMode);
    $('text-hint').classList.toggle('hidden', !state.textMode);
    overlay.style.pointerEvents = state.crop || state.textMode ? 'auto' : 'none';
    $('img-info').textContent = has
      ? `${state.fileName} — ${state.source.width} × ${state.source.height} px`
      : 'Sin imagen';
  }

  // ---------- cargar imagen ----------
  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = newCanvas(img.naturalWidth, img.naturalHeight);
      c.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      state.fileName = file.name.replace(/\.[^.]+$/, '') || 'imagen';
      state.original = clone(c);
      state.source = c;
      state.history = [];
      state.crop = null;
      state.ocr = null;
      state.textMode = false;
      resetAdjust();
      hint.classList.add('hidden');
      render();
      ui();
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert('No se pudo abrir la imagen.'); };
    img.src = url;
  }

  $('btn-open').addEventListener('click', () => fileInput.click());
  hint.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => { loadFile(e.target.files[0]); fileInput.value = ''; });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); });
  window.addEventListener('paste', (e) => {
    if (e.target.closest && e.target.closest('input,textarea,[contenteditable]')) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) loadFile(item.getAsFile());
  });

  // ---------- ajustes y filtros ----------
  Object.keys(DEFAULTS).forEach((k) => {
    $('range-' + k).addEventListener('input', (e) => {
      state.adj[k] = +e.target.value;
      $('val-' + k).textContent = e.target.value + (k === 'blur' ? 'px' : '%');
      schedule();
    });
  });
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.filter = chip.dataset.filter;
      document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
      schedule();
    });
  });
  function resetAdjust() {
    state.adj = { ...DEFAULTS };
    state.filter = 'none';
    Object.keys(DEFAULTS).forEach((k) => {
      $('range-' + k).value = DEFAULTS[k];
      $('val-' + k).textContent = DEFAULTS[k] + (k === 'blur' ? 'px' : '%');
    });
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.filter === 'none'));
  }

  // ---------- historial y geometría ----------
  function snapshotOcr() {
    return state.ocr ? { text: state.ocr.text, words: [...state.ocr.words] } : null;
  }
  function makeOcr(snap) {
    if (!snap) return null;
    const words = [...snap.words];
    return { text: snap.text, words, cells: OcrUtils.buildRows(words, CELL_GAP).flat() };
  }
  // keepOcr = true cuando la geometría no cambia (p. ej. al reemplazar texto)
  function setSource(c, keepOcr = false) {
    if (state.source) {
      state.history.push({ src: state.source, ocr: snapshotOcr() });
      if (state.history.length > 20) state.history.shift();
    }
    state.source = c;
    if (!keepOcr) { state.ocr = null; state.textMode = false; }
    render();
    ui();
  }
  function commit(c) { state.crop = null; setSource(c); }

  function rotate(deg) {
    const s = state.source; if (!s) return;
    const c = newCanvas(s.height, s.width);
    const x = c.getContext('2d');
    x.translate(c.width / 2, c.height / 2);
    x.rotate((deg * Math.PI) / 180);
    x.drawImage(s, -s.width / 2, -s.height / 2);
    commit(c);
  }
  function flip(horizontal) {
    const s = state.source; if (!s) return;
    const c = newCanvas(s.width, s.height);
    const x = c.getContext('2d');
    if (horizontal) { x.translate(s.width, 0); x.scale(-1, 1); }
    else { x.translate(0, s.height); x.scale(1, -1); }
    x.drawImage(s, 0, 0);
    commit(c);
  }
  function undo() {
    if (!state.history.length) return;
    const h = state.history.pop();
    state.crop = null;
    state.source = h.src;
    state.ocr = makeOcr(h.ocr);
    if (!state.ocr) state.textMode = false;
    render();
    ui();
  }

  $('btn-rot-l').addEventListener('click', () => rotate(-90));
  $('btn-rot-r').addEventListener('click', () => rotate(90));
  $('btn-flip-h').addEventListener('click', () => flip(true));
  $('btn-flip-v').addEventListener('click', () => flip(false));
  $('btn-undo').addEventListener('click', undo);
  $('btn-reset').addEventListener('click', () => {
    if (!state.original) return;
    state.crop = null;
    setSource(clone(state.original));
    resetAdjust();
    render();
  });

  // ---------- recorte ----------
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const activeHandles = () => (state.ratio ? ['nw', 'ne', 'se', 'sw'] : HANDLES);

  function defaultCrop() {
    const W = state.source.width, H = state.source.height;
    let w = W * 0.8, h = H * 0.8;
    if (state.ratio) { if (w / state.ratio > h) w = h * state.ratio; else h = w / state.ratio; }
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }
  function startCrop() {
    if (!state.source) return;
    state.textMode = false;
    state.ratio = +$('crop-ratio').value;
    state.crop = defaultCrop();
    ui();
    drawOverlay();
  }
  function stopCrop() { state.crop = null; ui(); drawOverlay(); }
  function applyCrop() {
    const r = state.crop; if (!r) return;
    const x = Math.round(r.x), y = Math.round(r.y);
    const w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h));
    const c = newCanvas(w, h);
    c.getContext('2d').drawImage(state.source, x, y, w, h, 0, 0, w, h);
    commit(c);
  }

  $('btn-crop').addEventListener('click', () => (state.crop ? stopCrop() : startCrop()));
  $('btn-apply-crop').addEventListener('click', applyCrop);
  $('btn-cancel-crop').addEventListener('click', stopCrop);
  $('crop-ratio').addEventListener('change', (e) => {
    state.ratio = +e.target.value;
    if (state.crop) { state.crop = defaultCrop(); drawOverlay(); }
  });

  function handlePoint(h, r) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    return {
      nw: [r.x, r.y], n: [cx, r.y], ne: [r.x + r.w, r.y], e: [r.x + r.w, cy],
      se: [r.x + r.w, r.y + r.h], s: [cx, r.y + r.h], sw: [r.x, r.y + r.h], w: [r.x, cy]
    }[h];
  }
  function hit(p) {
    const r = state.crop, tol = 14 / state.scale;
    for (const h of activeHandles()) {
      const [hx, hy] = handlePoint(h, r);
      if (Math.abs(p.x - hx) <= tol && Math.abs(p.y - hy) <= tol) return h;
    }
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return 'move';
    return null;
  }
  function rectFromAnchor(ax, ay, px, py) {
    const W = state.source.width, H = state.source.height;
    px = clamp(px, 0, W); py = clamp(py, 0, H);
    const sx = px >= ax ? 1 : -1, sy = py >= ay ? 1 : -1;
    let w = Math.abs(px - ax), h = Math.abs(py - ay);
    const r = state.ratio;
    if (r) {
      if (w / r > h) h = w / r; else w = h * r;
      const mw = sx > 0 ? W - ax : ax, mh = sy > 0 ? H - ay : ay;
      if (w > mw) { w = mw; h = w / r; }
      if (h > mh) { h = mh; w = h * r; }
    }
    return { x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h };
  }
  function resizeRect(h, p, r) {
    const W = state.source.width, H = state.source.height;
    const right = r.x + r.w, bottom = r.y + r.h;
    const opposite = { nw: [right, bottom], ne: [r.x, bottom], se: [r.x, r.y], sw: [right, r.y] }[h];
    if (opposite) return rectFromAnchor(opposite[0], opposite[1], p.x, p.y);
    let x1 = r.x, y1 = r.y, x2 = right, y2 = bottom;
    if (h === 'n') y1 = clamp(p.y, 0, y2 - MIN);
    if (h === 's') y2 = clamp(p.y, y1 + MIN, H);
    if (h === 'w') x1 = clamp(p.x, 0, x2 - MIN);
    if (h === 'e') x2 = clamp(p.x, x1 + MIN, W);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function toImg(e) {
    const b = overlay.getBoundingClientRect();
    return { x: ((e.clientX - b.left) * overlay.width) / b.width, y: ((e.clientY - b.top) * overlay.height) / b.height };
  }
  const CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move' };

  function cellAt(p) {
    if (!state.ocr) return -1;
    const cells = state.ocr.cells, t = 2;
    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i];
      if (p.x >= c.x0 - t && p.x <= c.x1 + t && p.y >= c.y0 - t && p.y <= c.y1 + t) return i;
    }
    return -1;
  }

  let drag = null;
  overlay.addEventListener('pointerdown', (e) => {
    if (!state.crop) return;
    const p = toImg(e), h = hit(p);
    overlay.setPointerCapture(e.pointerId);
    if (h === 'move') drag = { mode: 'move', off: { x: p.x - state.crop.x, y: p.y - state.crop.y } };
    else if (h) drag = { mode: 'resize', h, start: { ...state.crop } };
    else drag = { mode: 'new', a: p };
  });
  overlay.addEventListener('pointermove', (e) => {
    if (state.textMode) {
      const i = cellAt(toImg(e));
      if (i !== state.hover) {
        state.hover = i;
        overlay.style.cursor = i >= 0 ? 'pointer' : 'default';
        drawOverlay();
      }
      return;
    }
    if (!state.crop) return;
    const p = toImg(e);
    if (!drag) { overlay.style.cursor = CURSORS[hit(p)] || 'crosshair'; return; }
    const W = state.source.width, H = state.source.height;
    if (drag.mode === 'move') {
      const c = state.crop;
      c.x = clamp(p.x - drag.off.x, 0, W - c.w);
      c.y = clamp(p.y - drag.off.y, 0, H - c.h);
    } else if (drag.mode === 'resize') {
      state.crop = resizeRect(drag.h, p, drag.start);
    } else {
      state.crop = rectFromAnchor(drag.a.x, drag.a.y, p.x, p.y);
    }
    drawOverlay();
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    if (state.crop.w < MIN || state.crop.h < MIN) state.crop = defaultCrop();
    drawOverlay();
  };
  overlay.addEventListener('pointerup', endDrag);
  overlay.addEventListener('pointercancel', endDrag);
  overlay.addEventListener('click', (e) => {
    if (!state.textMode) return;
    const i = cellAt(toImg(e));
    if (i >= 0) openReplace(i);
  });

  function drawOverlay() {
    octx.clearRect(0, 0, overlay.width, overlay.height);

    if (state.textMode && state.ocr) {
      const lw = Math.max(1, 1.5 / state.scale);
      state.ocr.cells.forEach((c, i) => {
        const hov = i === state.hover;
        octx.fillStyle = hov ? 'rgba(59,130,246,.35)' : 'rgba(59,130,246,.12)';
        octx.fillRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
        octx.strokeStyle = hov ? '#60a5fa' : 'rgba(96,165,250,.8)';
        octx.lineWidth = lw;
        octx.strokeRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
      });
      return;
    }

    const r = state.crop;
    if (!r) return;
    octx.fillStyle = 'rgba(0,0,0,.55)';
    octx.beginPath();
    octx.rect(0, 0, overlay.width, overlay.height);
    octx.rect(r.x, r.y, r.w, r.h);
    octx.fill('evenodd');

    const lw = Math.max(1, 1.5 / state.scale);
    octx.strokeStyle = '#fff'; octx.lineWidth = lw;
    octx.strokeRect(r.x, r.y, r.w, r.h);

    octx.strokeStyle = 'rgba(255,255,255,.4)'; octx.lineWidth = lw * 0.7;
    octx.beginPath();
    for (let i = 1; i < 3; i++) {
      octx.moveTo(r.x + (r.w * i) / 3, r.y); octx.lineTo(r.x + (r.w * i) / 3, r.y + r.h);
      octx.moveTo(r.x, r.y + (r.h * i) / 3); octx.lineTo(r.x + r.w, r.y + (r.h * i) / 3);
    }
    octx.stroke();

    const hs = 10 / state.scale;
    octx.fillStyle = '#fff';
    for (const h of activeHandles()) {
      const [x, y] = handlePoint(h, r);
      octx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
    }
    $('crop-size').textContent = `${Math.round(r.w)} × ${Math.round(r.h)} px`;
  }

  // ---------- OCR ----------
  let ocrWorker = null, ocrLang = '';
  const STATUS_ES = {
    'loading tesseract core': 'Cargando motor…',
    'initializing tesseract': 'Iniciando…',
    'loading language traineddata': 'Descargando idioma…',
    'initializing api': 'Preparando…',
    'recognizing text': 'Reconociendo texto…'
  };
  function onOcrLog(m) {
    $('ocr-msg').textContent = (STATUS_ES[m.status] || m.status) + ' ' + Math.round((m.progress || 0) * 100) + '%';
    $('ocr-progress').value = m.progress || 0;
  }
  function extractWords(data) {
    if (data.words && data.words.length) return data.words;
    const out = [];
    (data.blocks || []).forEach((b) => b.paragraphs.forEach((p) => p.lines.forEach((l) => l.words.forEach((w) => out.push(w)))));
    return out;
  }

  async function runOCR() {
    if (!state.source || state.busy) return;
    if (typeof Tesseract === 'undefined') {
      alert('No se pudo cargar Tesseract.js. Revisa tu conexión a internet y recarga la página.');
      return;
    }
    stopCrop();
    state.textMode = false;
    state.busy = true;
    $('ocr-status').classList.remove('hidden');
    $('ocr-msg').textContent = 'Preparando…';
    $('ocr-progress').value = 0;
    ui();

    try {
      const lang = $('ocr-lang').value;
      if (!ocrWorker || ocrLang !== lang) {
        if (ocrWorker) await ocrWorker.terminate();
        ocrWorker = await Tesseract.createWorker(lang, 1, { logger: onOcrLog });
        ocrLang = lang;
      }

      // Imagen de entrada: con los ajustes actuales y escalada para mejorar la lectura
      const s = state.source;
      const k = clamp(2200 / Math.max(s.width, s.height), 0.6, 3);
      const c = newCanvas(Math.round(s.width * k), Math.round(s.height * k));
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.fillRect(0, 0, c.width, c.height);
      x.filter = filterString();
      x.drawImage(s, 0, 0, c.width, c.height);

      const { data } = await ocrWorker.recognize(c);
      const words = extractWords(data)
        .map((w) => ({
          text: (w.text || '').trim(),
          conf: w.confidence,
          x0: w.bbox.x0 / k, y0: w.bbox.y0 / k, x1: w.bbox.x1 / k, y1: w.bbox.y1 / k
        }))
        .filter((w) => w.text && w.conf >= 20);

      if (!words.length) {
        state.ocr = null;
        $('ocr-msg').textContent = 'No se encontró texto.';
        alert('No se encontró texto. Prueba con más contraste, otro idioma o una imagen más nítida.');
      } else {
        state.ocr = {
          text: (data.text || '').trim(),
          words,
          cells: OcrUtils.buildRows(words, CELL_GAP).flat()
        };
        $('ocr-msg').textContent = `✓ ${words.length} palabras reconocidas`;
        $('ocr-progress').value = 1;
        showOcr('text');
      }
    } catch (err) {
      console.error(err);
      $('ocr-msg').textContent = 'Error al reconocer.';
      alert('Falló el reconocimiento de texto: ' + (err.message || err));
    } finally {
      state.busy = false;
      ui();
    }
  }
  $('btn-ocr').addEventListener('click', runOCR);

  // ---------- resultados: texto y tabla ----------
  function showOcr(tab) {
    if (!state.ocr) return;
    $('ocr-text').value = state.ocr.text;
    switchTab(tab);
    const d = $('ocr-dialog');
    if (!d.open) d.showModal();
  }
  function switchTab(tab) {
    $('tab-text').classList.toggle('active', tab === 'text');
    $('tab-table').classList.toggle('active', tab === 'table');
    $('pane-text').classList.toggle('hidden', tab !== 'text');
    $('pane-table').classList.toggle('hidden', tab !== 'table');
    if (tab === 'table') renderTable();
  }
  function renderTable() {
    if (!state.ocr) return;
    const gap = +$('gap-range').value;
    $('gap-val').textContent = gap.toFixed(1);
    const grid = OcrUtils.buildTable(OcrUtils.buildRows(state.ocr.words, gap));
    const t = $('ocr-table');
    t.innerHTML = '';
    grid.forEach((row) => {
      const tr = t.insertRow();
      row.forEach((v) => {
        const td = tr.insertCell();
        td.contentEditable = 'true';
        td.textContent = v;
      });
    });
  }
  const readTable = () => [...$('ocr-table').rows].map((tr) => [...tr.cells].map((td) => td.textContent.trim()));

  $('btn-show-text').addEventListener('click', () => showOcr('text'));
  $('btn-show-table').addEventListener('click', () => showOcr('table'));
  $('tab-text').addEventListener('click', () => switchTab('text'));
  $('tab-table').addEventListener('click', () => switchTab('table'));
  $('ocr-close').addEventListener('click', () => $('ocr-dialog').close());
  $('gap-range').addEventListener('input', renderTable);

  $('btn-copy-text').addEventListener('click', (e) => copyText($('ocr-text').value, e.currentTarget));
  $('btn-dl-text').addEventListener('click', () =>
    saveBlob(new Blob([$('ocr-text').value], { type: 'text/plain;charset=utf-8' }), `${state.fileName}-texto.txt`));

  $('btn-copy-table').addEventListener('click', (e) =>
    copyText(readTable().map((r) => r.join('\t')).join('\n'), e.currentTarget));
  $('btn-dl-csv').addEventListener('click', () =>
    saveBlob(new Blob(['\ufeff' + OcrUtils.toCSV(readTable())], { type: 'text/csv;charset=utf-8' }), `${state.fileName}-tabla.csv`));
  $('btn-dl-xlsx').addEventListener('click', () => {
    if (typeof XLSX === 'undefined') { alert('No se pudo cargar la librería de Excel. Usa CSV o revisa tu conexión.'); return; }
    const grid = readTable().map((r) => r.map((v) => (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(v) ? Number(v) : v)));
    const ws = XLSX.utils.aoa_to_sheet(grid);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tabla');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${state.fileName}-tabla.xlsx`);
  });

  // ---------- editar texto en la imagen ----------
  $('btn-text-mode').addEventListener('click', () => {
    if (!state.ocr) return;
    state.textMode = !state.textMode;
    if (state.textMode) state.crop = null;
    state.hover = -1;
    ui();
    drawOverlay();
  });

  // Color de fondo (más frecuente alrededor del texto) y color del texto (el más distinto al fondo)
  function sampleColors(cell) {
    const s = state.source, ctx = s.getContext('2d');
    const pad = Math.max(3, Math.round((cell.y1 - cell.y0) * 0.25));
    const rx = Math.max(0, Math.floor(cell.x0 - pad)), ry = Math.max(0, Math.floor(cell.y0 - pad));
    const rx2 = Math.min(s.width, Math.ceil(cell.x1 + pad)), ry2 = Math.min(s.height, Math.ceil(cell.y1 + pad));
    const w = rx2 - rx, h = ry2 - ry;
    if (w <= 0 || h <= 0) return { bg: '#ffffff', fg: '#000000' };
    const d = ctx.getImageData(rx, ry, w, h).data;

    const inside = (px, py) => px >= cell.x0 && px <= cell.x1 && py >= cell.y0 && py <= cell.y1;
    const bins = new Map();
    let ring = 0;
    const addBin = (r, g, b) => {
      const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
      const e = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += r; e.g += g; e.b += b;
      bins.set(key, e);
    };
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (inside(rx + i, ry + j)) continue;
        const o = (j * w + i) * 4;
        addBin(d[o], d[o + 1], d[o + 2]);
        ring++;
      }
    }
    if (!ring) {
      for (let o = 0; o < d.length; o += 4) addBin(d[o], d[o + 1], d[o + 2]);
    }
    let best = null;
    bins.forEach((e) => { if (!best || e.n > best.n) best = e; });
    const bg = [best.r / best.n, best.g / best.n, best.b / best.n];

    // Texto: promedio del 8 % de píxeles dentro de la caja más lejanos al fondo
    const dist = [];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (!inside(rx + i, ry + j)) continue;
        const o = (j * w + i) * 4;
        const dr = d[o] - bg[0], dg = d[o + 1] - bg[1], db = d[o + 2] - bg[2];
        dist.push([dr * dr + dg * dg + db * db, d[o], d[o + 1], d[o + 2]]);
      }
    }
    let fg = bg[0] + bg[1] + bg[2] > 382 ? [0, 0, 0] : [255, 255, 255];
    if (dist.length) {
      dist.sort((a, b) => b[0] - a[0]);
      const n = Math.max(1, Math.round(dist.length * 0.08));
      const top = dist.slice(0, n);
      fg = [0, 1, 2].map((k) => top.reduce((sum, v) => sum + v[k + 1], 0) / n);
    }
    return { bg: toHex(...bg), fg: toHex(...fg) };
  }

  function estimateSize(cell, font, bold) {
    const h = cell.y1 - cell.y0, w = cell.x1 - cell.x0;
    scratch.font = `${bold ? 'bold ' : ''}100px ${font}`;
    const m = scratch.measureText(cell.text).width || 1;
    return Math.round(clamp((100 * w) / m, h * 0.6, h * 1.15));
  }

  let replaceIdx = -1;
  function openReplace(i) {
    const cell = state.ocr.cells[i];
    replaceIdx = i;
    const { bg, fg } = sampleColors(cell);
    $('rp-original').value = cell.text;
    $('rp-text').value = cell.text;
    $('rp-fg').value = fg;
    $('rp-bg').value = bg;
    $('rp-bold').checked = false;
    $('rp-size').value = estimateSize(cell, $('rp-font').value, false);
    $('replace-dialog').showModal();
    $('rp-text').focus();
    $('rp-text').select();
  }
  const reestimate = () => {
    if (replaceIdx < 0 || !state.ocr) return;
    $('rp-size').value = estimateSize(state.ocr.cells[replaceIdx], $('rp-font').value, $('rp-bold').checked);
  };
  $('rp-font').addEventListener('change', reestimate);
  $('rp-bold').addEventListener('change', reestimate);

  function applyReplace(cell, opts) {
    const s = state.source;
    const c = clone(s);
    const x = c.getContext('2d');
    const pad = Math.max(2, Math.round((cell.y1 - cell.y0) * 0.12));
    const rx = Math.max(0, cell.x0 - pad), ry = Math.max(0, cell.y0 - pad);
    const rw = Math.min(s.width, cell.x1 + pad) - rx, rh = Math.min(s.height, cell.y1 + pad) - ry;
    x.fillStyle = opts.bg;
    x.fillRect(rx, ry, rw, rh);

    let newW = 0;
    if (opts.text) {
      x.fillStyle = opts.fg;
      x.textBaseline = 'middle';
      x.font = `${opts.bold ? 'bold ' : ''}${opts.size}px ${opts.font}`;
      x.fillText(opts.text, cell.x0, (cell.y0 + cell.y1) / 2);
      newW = x.measureText(opts.text).width;
    }

    setSource(c, true); // guarda el estado anterior para poder deshacer

    // Mantener sincronizado el resultado del OCR
    const o = state.ocr;
    o.words = o.words.filter((w) => !cell.ws.includes(w));
    if (opts.text) {
      o.words.push({ text: opts.text, conf: 100, x0: cell.x0, x1: cell.x0 + newW, y0: cell.y0, y1: cell.y1 });
    }
    o.text = o.text.replace(cell.text, opts.text);
    o.cells = OcrUtils.buildRows(o.words, CELL_GAP).flat();
    state.hover = -1;
    drawOverlay();
  }

  function submitReplace(text) {
    if (replaceIdx < 0 || !state.ocr) return;
    const cell = state.ocr.cells[replaceIdx];
    applyReplace(cell, {
      text,
      size: Math.max(4, +$('rp-size').value || 12),
      font: $('rp-font').value,
      bold: $('rp-bold').checked,
      fg: $('rp-fg').value,
      bg: $('rp-bg').value
    });
    replaceIdx = -1;
    $('replace-dialog').close();
  }
  $('replace-form').addEventListener('submit', (e) => { e.preventDefault(); submitReplace($('rp-text').value); });
  $('rp-delete').addEventListener('click', () => submitReplace(''));
  $('rp-cancel').addEventListener('click', () => { replaceIdx = -1; $('replace-dialog').close(); });

  // ---------- descargar imagen ----------
  $('btn-download').addEventListener('click', () => {
    const s = state.source; if (!s) return;
    const fmt = $('export-format').value;
    const c = newCanvas(s.width, s.height);
    const x = c.getContext('2d');
    if (fmt === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
    x.filter = filterString();
    x.drawImage(s, 0, 0);
    c.toBlob((blob) => {
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[fmt];
      saveBlob(blob, `${state.fileName}-editada.${ext}`);
    }, fmt, 0.92);
  });

  // ---------- atajos ----------
  window.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    else if (state.crop && e.key === 'Enter') applyCrop();
    else if (e.key === 'Escape') {
      if (state.crop) stopCrop();
      else if (state.textMode) { state.textMode = false; ui(); drawOverlay(); }
    }
  });

  ui();
})();
