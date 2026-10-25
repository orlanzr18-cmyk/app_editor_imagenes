import * as vscode from 'vscode';

/**
 * Proveedor para la barra lateral (Sidebar) de VS Code.
 * Proporciona una zona de arrastre rápida y vista previa.
 */
export class ImageSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'imageStudio.sidebar';
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'media')
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Manejar eventos desde la barra lateral
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'imageDropped': {
          // El usuario soltó una imagen en la barra lateral
          vscode.window.showInformationMessage(`Imagen recibida: ${data.name} (${Math.round(data.size / 1024)} KB)`);
          break;
        }
        case 'openFilePicker': {
          const files = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { 'Imágenes': ['png', 'jpg', 'jpeg', 'webp'] }
          });
          if (files && files[0]) {
            await vscode.commands.executeCommand('vscode.openWith', files[0], 'imageStudio.editor');
          }
          break;
        }
        case 'exportSidebarImage': {
          const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('imagen_editada.png'),
            filters: { 'Imágenes PNG': ['png'] }
          });
          if (saveUri && data.base64) {
            const raw = data.base64.replace(/^data:image\/\w+;base64,/, '');
            await vscode.workspace.fs.writeFile(saveUri, Buffer.from(raw, 'base64'));
            vscode.window.showInformationMessage(`¡Guardado exitosamente en ${saveUri.fsPath}!`);
          }
          break;
        }
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      padding: 12px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
    }
    .drop-zone {
      border: 2px dashed var(--vscode-focusBorder);
      border-radius: 8px;
      padding: 24px 12px;
      text-align: center;
      cursor: pointer;
      background: var(--vscode-editor-background);
      transition: all 0.2s;
    }
    .drop-zone:hover, .drop-zone.dragover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-button-background);
    }
    button {
      width: 100%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 12px;
      border-radius: 4px;
      margin-top: 10px;
      cursor: pointer;
      font-weight: 500;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .preview-box {
      margin-top: 16px;
      display: none;
    }
    .preview-box img {
      max-width: 100%;
      border-radius: 4px;
      border: 1px solid var(--vscode-widget-border);
    }
  </style>
</head>
<body>
  <h3>Image Studio</h3>
  <p style="font-size: 12px; opacity: 0.8;">Arrastra una imagen (PNG, JPG, WebP) aquí para editar o previsualizar.</p>
  
  <div id="dropZone" class="drop-zone">
    <div style="font-size: 24px; margin-bottom: 8px;">🖼️</div>
    <strong>Suelta tu imagen aquí</strong>
    <p style="font-size: 11px; margin-top: 4px; opacity: 0.7;">o haz clic para explorar archivos</p>
    <input type="file" id="fileInput" accept="image/png,image/jpeg,image/webp" style="display: none;">
  </div>

  <button id="btnBrowse">Seleccionar Archivo...</button>

  <div id="previewBox" class="preview-box">
    <h4>Vista Previa</h4>
    <img id="sidebarPreview" alt="Preview">
    <button id="btnOpenInEditor" style="margin-top: 8px;">Abrir en Editor Completo</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const btnBrowse = document.getElementById('btnBrowse');
    const previewBox = document.getElementById('previewBox');
    const sidebarPreview = document.getElementById('sidebarPreview');

    btnBrowse.addEventListener('click', () => {
      vscode.postMessage({ type: 'openFilePicker' });
    });

    dropZone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        handleFile(file);
      }
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleFile(file);
      }
    });

    function handleFile(file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        sidebarPreview.src = base64;
        previewBox.style.display = 'block';
        vscode.postMessage({
          type: 'imageDropped',
          name: file.name,
          size: file.size,
          base64: base64
        });
      };
      reader.readAsDataURL(file);
    }
  </script>
</body>
</html>`;
  }
}