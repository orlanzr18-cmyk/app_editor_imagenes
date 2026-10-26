(() => {
  const $ = (id) => document.getElementById(id);
  const main = $('main-canvas'), mctx = main.getContext('2d');
  const overlay = $('overlay-canvas'), octx = overlay.getContext('2d');
  const stage = $('stage'), viewport = $('viewport'), hint = $('drop-hint');
  const fileInput = $('file-input');

  const DEFAULTS = { brightness: 100, contrast: 100, saturation: 100, blur: 0 };
  const MIN = 10;
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

  const state = {
    source: null,      // canvas con la geometría actual (sin filtros)
    original: null,    // copia para "Restaurar"
    history: [],       // para deshacer rotación/volteo/recorte
    adj: { ...DEFAULTS },
    filter: 'none',
    fileName: 'imagen',
    crop: null,        // {x,y,w,h} en px de la imagen
    ratio: 0,          // 0 = libre
    scale: 1           // px de pantalla por px de imagen
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
    $('btn-undo').disabled = !state.history.length;
    $('crop-panel').classList.toggle('hidden', !state.crop);
    $('btn-crop').classList.toggle('active', !!state.crop);
    overlay.style.pointerEvents = state.crop ? 'auto' : 'none';
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

  // ---------- geometría ----------
  function setSource(c) {
    if (state.source) {
      state.history.push(state.source);
      if (state.history.length > 20) state.history.shift();
    }
    state.source = c;
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
    state.crop = null;
    state.source = state.history.pop();
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

  function drawOverlay() {
    octx.clearRect(0, 0, overlay.width, overlay.height);
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

  // ---------- descargar ----------
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
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${state.fileName}-editada.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, fmt, 0.92);
  });

  // ---------- atajos ----------
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    else if (state.crop && e.key === 'Enter') applyCrop();
    else if (state.crop && e.key === 'Escape') stopCrop();
  });

  ui();
})();
