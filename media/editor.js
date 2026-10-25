// media/editor.js
// Script ejecutado en el contexto del Webview en VS Code
(function () {
  // 1. Obtener la API de VS Code para mensajería IPC
  const vscode = acquireVsCodeApi();

  // 2. Elementos DOM
  const canvas = document.getElementById('main-canvas');
  const ctx = canvas.getContext('2d');
  const viewport = document.getElementById('viewport');
  const dropHint = document.getElementById('dropHint');
  const imgInfo = document.getElementById('imgInfo');

  // Controles
  const rangeBrightness = document.getElementById('range-brightness');
  const rangeContrast = document.getElementById('range-contrast');
  const rangeSaturation = document.getElementById('range-saturation');
  const rangeBlur = document.getElementById('range-blur');
  const valBrightness = document.getElementById('val-brightness');
  const valContrast = document.getElementById('val-contrast');
  const valSaturation = document.getElementById('val-saturation');
  const valBlur = document.getElementById('val-blur');

  const btnCrop = document.getElementById('btn-crop');
  const btnRotateCw = document.getElementById('btn-rotate-cw');
  const btnFlipH = document.getElementById('btn-flip-h');
  const btnReset = document.getElementById('btn-reset');
  const btnSave = document.getElementById('btn-save');
  const btnSaveAs = document.getElementById('btn-save-as');
  const cropControls = document.getElementById('crop-controls');
  const btnApplyCrop = document.getElementById('btn-apply-crop');
  const btnCancelCrop = document.getElementById('btn-cancel-crop');

  // 3. Estado interno
  let originalImage = null;
  let activeImage = null;
  let currentFormat = 'png';
  let fileName = 'imagen';

  let state = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0,
    activeFilter: 'none',
    rotation: 0, // 0, 90, 180, 270
    flipH: false,
    isCropping: false,
    crop: { x: 50, y: 50, width: 200, height: 200 }
  };

  // 4. Inicialización con VS Code
  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
      case 'initImage':
        loadImageFromDataUri(message.dataUri, message.fileName, message.format);
        break;
    }
  });

  // Notificar al host que el Webview está listo para recibir datos
  vscode.postMessage({ type: 'ready' });

  // 5. Cargar imagen en memoria
  function loadImageFromDataUri(dataUri, name, format) {
    fileName = name || 'imagen';
    currentFormat = format || 'png';
    const img = new Image();
    img.onload = () => {
      originalImage = img;
      activeImage = img;
      resetControls();
      render();
      if (dropHint) dropHint.style.display = 'none';
      imgInfo.textContent = `${fileName} (${img.naturalWidth} x ${img.naturalHeight} px)`;
    };
    img.src = dataUri;
  }

  // 6. Motor de Renderizado en Canvas
  function render() {
    if (!activeImage) return;

    const isRotated90or270 = state.rotation % 180 !== 0;
    const targetW = isRotated90or270 ? activeImage.naturalHeight : activeImage.naturalWidth;
    const targetH = isRotated90or270 ? activeImage.naturalWidth : activeImage.naturalHeight;

    canvas.width = targetW;
    canvas.height = targetH;

    ctx.save();

    // Filtros combinados
    let filterString = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturation}%)`;
    if (state.blur > 0) filterString += ` blur(${state.blur}px)`;
    if (state.activeFilter === 'grayscale') filterString += ' grayscale(100%)';
    if (state.activeFilter === 'sepia') filterString += ' sepia(100%)';
    if (state.activeFilter === 'invert') filterString += ' invert(100%)';

    ctx.filter = filterString;

    // Transformaciones geométricas (rotación y volteo)
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((state.rotation * Math.PI) / 180);
    ctx.scale(state.flipH ? -1 : 1, 1);

    ctx.drawImage(
      activeImage,
      -activeImage.naturalWidth / 2,
      -activeImage.naturalHeight / 2,
      activeImage.naturalWidth,
      activeImage.naturalHeight
    );

    ctx.restore();
  }

  // 7. Eventos de controles de ajustes
  rangeBrightness.addEventListener('input', (e) => {
    state.brightness = Number(e.target.value);
    valBrightness.textContent = state.brightness + '%';
    render();
  });

  rangeContrast.addEventListener('input', (e) => {
    state.contrast = Number(e.target.value);
    valContrast.textContent = state.contrast + '%';
    render();
  });

  rangeSaturation.addEventListener('input', (e) => {
    state.saturation = Number(e.target.value);
    valSaturation.textContent = state.saturation + '%';
    render();
  });

  rangeBlur.addEventListener('input', (e) => {
    state.blur = Number(e.target.value);
    valBlur.textContent = state.blur + 'px';
    render();
  });

  // Filtros rápidos
  document.querySelectorAll('.filter-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeFilter = btn.dataset.filter;
      render();
    });
  });

  // Rotar 90°
  btnRotateCw.addEventListener('click', () => {
    state.rotation = (state.rotation + 90) % 360;
    render();
  });

  // Voltear horizontal
  btnFlipH.addEventListener('click', () => {
    state.flipH = !state.flipH;
    render();
  });

  // Restaurar valores iniciales
  function resetControls() {
    state.brightness = 100;
    state.contrast = 100;
    state.saturation = 100;
    state.blur = 0;
    state.rotation = 0;
    state.flipH = false;
    state.activeFilter = 'none';
    state.isCropping = false;

    rangeBrightness.value = 100;
    rangeContrast.value = 100;
    rangeSaturation.value = 100;
    rangeBlur.value = 0;
    valBrightness.textContent = '100%';
    valContrast.textContent = '100%';
    valSaturation.textContent = '100%';
    valBlur.textContent = '0px';

    cropControls.classList.add('hidden');
    document.querySelectorAll('.filter-chip').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === 'none');
    });
  }

  btnReset.addEventListener('click', () => {
    activeImage = originalImage;
    resetControls();
    render();
  });

  // 8. Herramienta de Recorte (Crop)
  btnCrop.addEventListener('click', () => {
    state.isCropping = !state.isCropping;
    cropControls.classList.toggle('hidden', !state.isCropping);
    vscode.postMessage({
      type: 'showMessage',
      level: 'info',
      text: state.isCropping ? 'Modo recorte activo. Ajusta el área deseada.' : 'Modo recorte desactivado.'
    });
  });

  btnApplyCrop.addEventListener('click', () => {
    // Ejemplo de recorte central del 80% del área
    const cropW = Math.floor(canvas.width * 0.8);
    const cropH = Math.floor(canvas.height * 0.8);
    const cropX = Math.floor((canvas.width - cropW) / 2);
    const cropY = Math.floor((canvas.height - cropH) / 2);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const croppedImg = new Image();
    croppedImg.onload = () => {
      activeImage = croppedImg;
      state.isCropping = false;
      cropControls.classList.add('hidden');
      render();
    };
    croppedImg.src = tempCanvas.toDataURL();
  });

  btnCancelCrop.addEventListener('click', () => {
    state.isCropping = false;
    cropControls.classList.add('hidden');
  });

  // 9. Guardar y Exportar la imagen hacia el sistema de archivos de VS Code
  function exportImage(saveAsNew = false) {
    if (!canvas) return;
    const mime = currentFormat === 'jpeg' || currentFormat === 'jpg' ? 'image/jpeg' : 'image/png';
    const base64 = canvas.toDataURL(mime, 0.95);

    vscode.postMessage({
      type: 'saveImage',
      base64: base64,
      saveAsNew: saveAsNew
    });
  }

  btnSave.addEventListener('click', () => exportImage(false));
  btnSaveAs.addEventListener('click', () => exportImage(true));

  // 10. Drag & Drop directo en la ventana del Webview
  ['dragenter', 'dragover'].forEach(name => {
    window.addEventListener(name, (e) => e.preventDefault());
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        loadImageFromDataUri(evt.target.result, file.name, file.type.split('/')[1]);
      };
      reader.readAsDataURL(file);
    }
  });
})();