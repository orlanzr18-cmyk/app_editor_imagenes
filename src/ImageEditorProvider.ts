import * as vscode from 'vscode';

/**
 * Documento personalizado para representar la imagen en el editor.
 */
class ImageDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}
  dispose(): void {}
}

/**
 * Proveedor de Editor Personalizado para VS Code.
 * Conecta el sistema de archivos del workspace con el Webview interactivo.
 */
export class ImageEditorProvider implements vscode.CustomReadonlyEditorProvider<ImageDocument> {
  public static readonly viewType = 'imageStudio.editor';

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Abre el documento binario cuando el usuario hace clic en un archivo compatible.
   */
  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<ImageDocument> {
    return new ImageDocument(uri);
  }

  /**
   * Inicializa el Webview y configura la comunicación bidireccional (postMessage).
   */
  async resolveCustomEditor(
    document: ImageDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const webview = webviewPanel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      ],
    };

    // Asignar el contenido HTML seguro con Content-Security-Policy
    webview.html = this.getHtmlForWebview(webview);

    // Leer el contenido binario del archivo desde el sistema de archivos local
    const fileBytes = await vscode.workspace.fs.readFile(document.uri);
    const mimeType = this.getMimeType(document.uri.path);
    const base64Data = Buffer.from(fileBytes).toString('base64');
    const dataUri = `data:${mimeType};base64,${base64Data}`;

    // Escuchar mensajes provenientes del Webview (acciones del usuario)
    webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready': {
          // El Webview está listo: enviamos la imagen cargada
          webview.postMessage({
            type: 'initImage',
            dataUri: dataUri,
            fileName: document.uri.path.split('/').pop() || 'image',
            format: mimeType.split('/')[1] || 'png'
          });
          break;
        }

        case 'saveImage': {
          try {
            // El usuario hizo clic en "Guardar": decodificar base64 y escribir al disco
            const rawData = message.base64.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(rawData, 'base64');
            
            // Sobrescribir el archivo actual o guardar como copia
            if (message.saveAsNew) {
              const saveUri = await vscode.window.showSaveDialog({
                defaultUri: document.uri,
                filters: {
                  'Imágenes': ['png', 'jpg', 'jpeg', 'webp']
                }
              });
              if (saveUri) {
                await vscode.workspace.fs.writeFile(saveUri, buffer);
                vscode.window.showInformationMessage(`Imagen guardada con éxito en: ${saveUri.fsPath}`);
              }
            } else {
              await vscode.workspace.fs.writeFile(document.uri, buffer);
              vscode.window.showInformationMessage('¡Imagen actualizada y guardada en el disco!');
            }
          } catch (error: any) {
            vscode.window.showErrorMessage(`Error al guardar la imagen: ${error.message}`);
          }
          break;
        }

        case 'showMessage': {
          if (message.level === 'error') {
            vscode.window.showErrorMessage(message.text);
          } else {
            vscode.window.showInformationMessage(message.text);
          }
          break;
        }
      }
    });
  }

  /**
   * Determina el MIME Type según la extensión del archivo.
   */
  private getMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'webp': return 'image/webp';
      case 'gif': return 'image/gif';
      case 'svg': return 'image/svg+xml';
      default: return 'image/png';
    }
  }

  /**
   * Genera el HTML para el Webview con scripts y estilos locales seguros.
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>Image Studio Editor</title>
</head>
<body>
  <div id="app">
    <!-- Barra de herramientas superior -->
    <header class="toolbar">
      <div class="tool-group">
        <button id="btn-crop" title="Modo Recorte (Crop)" class="tool-btn">✂️ Recortar</button>
        <button id="btn-rotate-cw" title="Rotar 90° horario" class="tool-btn">↻ Rotar</button>
        <button id="btn-flip-h" title="Voltear horizontal" class="tool-btn">⇄ Voltear</button>
      </div>

      <div class="tool-group">
        <button id="btn-reset" title="Restablecer ajustes" class="tool-btn secondary">↺ Restaurar</button>
        <button id="btn-save" class="tool-btn primary">💾 Guardar</button>
        <button id="btn-save-as" class="tool-btn secondary">Exportar como...</button>
      </div>
    </header>

    <!-- Contenedor central de trabajo -->
    <main class="workspace">
      <!-- Panel de ajustes lateral -->
      <aside class="adjustments-panel">
        <h3>Ajustes</h3>
        <label>Brillo: <span id="val-brightness">100%</span>
          <input type="range" id="range-brightness" min="0" max="200" value="100">
        </label>
        <label>Contraste: <span id="val-contrast">100%</span>
          <input type="range" id="range-contrast" min="0" max="200" value="100">
        </label>
        <label>Saturación: <span id="val-saturation">100%</span>
          <input type="range" id="range-saturation" min="0" max="200" value="100">
        </label>
        <label>Desenfoque: <span id="val-blur">0px</span>
          <input type="range" id="range-blur" min="0" max="20" value="0">
        </label>
        
        <h3>Filtros Rápidos</h3>
        <div class="filters-grid">
          <button data-filter="none" class="filter-chip active">Normal</button>
          <button data-filter="grayscale" class="filter-chip">B&N</button>
          <button data-filter="sepia" class="filter-chip">Sepia</button>
          <button data-filter="invert" class="filter-chip">Invertir</button>
        </div>

        <div id="crop-controls" class="crop-controls hidden">
          <h3>Opciones de Recorte</h3>
          <button id="btn-apply-crop" class="tool-btn primary">✓ Aplicar Recorte</button>
          <button id="btn-cancel-crop" class="tool-btn secondary">✕ Cancelar</button>
        </div>
      </aside>

      <!-- Lienzo principal donde se dibuja la imagen -->
      <section class="canvas-viewport" id="viewport">
        <div id="drop-hint" class="drop-hint">Arrastra una imagen aquí o ábrela desde el explorador</div>
        <canvas id="main-canvas"></canvas>
      </section>
    </main>

    <footer class="status-bar">
      <span id="img-info">Sin imagen</span>
      <span id="zoom-info">Zoom: 100%</span>
    </footer>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}