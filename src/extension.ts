import * as vscode from 'vscode';
import { ImageEditorProvider } from './ImageEditorProvider';
import { ImageSidebarProvider } from './ImageSidebarProvider';

/**
 * Función de activación principal llamada por VS Code al iniciar la extensión.
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('[Image Studio] Extensión activada con éxito.');

  // 1. Registrar el proveedor de Editor Personalizado (Custom Editor para archivos .png, .jpg, etc.)
  const editorProvider = new ImageEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      ImageEditorProvider.viewType,
      editorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true, // Mantiene el estado al cambiar de pestaña
        },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  // 2. Registrar el proveedor de la Vista Lateral (Sidebar Webview)
  const sidebarProvider = new ImageSidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ImageSidebarProvider.viewType,
      sidebarProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        }
      }
    )
  );

  // 3. Registrar comando para abrir una imagen seleccionada desde el explorador
  context.subscriptions.push(
    vscode.commands.registerCommand('imageStudio.openActiveFile', async (uri?: vscode.Uri) => {
      const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
      if (!targetUri) {
        vscode.window.showWarningMessage('Por favor selecciona un archivo de imagen en el explorador.');
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', targetUri, ImageEditorProvider.viewType);
    })
  );

  // 4. Registrar comando para crear un lienzo nuevo
  context.subscriptions.push(
    vscode.commands.registerCommand('imageStudio.createNewCanvas', () => {
      vscode.commands.executeCommand('workbench.view.extension.imageStudio-container');
    })
  );
}

/**
 * Función de limpieza al desactivar la extensión.
 */
export function deactivate() {
  console.log('[Image Studio] Extensión desactivada.');
}