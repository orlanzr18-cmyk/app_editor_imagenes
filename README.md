# Image Studio para Visual Studio Code 🎨

Extensión moderna para VS Code que permite abrir, visualizar, editar, recortar, aplicar filtros y guardar imágenes locales directamente sin salir del editor.

## ✨ Características
- **Carga y Arrastre Directo**: Suelta archivos PNG, JPG o WebP en la vista lateral o el editor.
- **Custom Editor**: Haz clic derecho en cualquier imagen del explorador y elige *"Abrir con... -> Image Studio Editor"*.
- **Ajustes en Tiempo Real**: Brillo, Contraste, Saturación y Desenfoque instantáneos.
- **Transformaciones**: Rotar 90°, voltear horizontal y vertical, recorte interactivo de proporción.
- **Guardado Nativo**: Guarda los cambios directamente en el archivo original con `vscode.workspace.fs.writeFile` o exporta con *"Guardar como..."*.

## 🚀 Cómo compilar y probar en tu máquina

1. **Instala dependencias**:
   ```bash
   npm install
   ```

2. **Compila el código TypeScript**:
   ```bash
   npm run compile
   ```

3. **Inicia la extensión**:
   - Presiona **F5** en VS Code (o ve a *Run and Debug* -> *Ejecutar Extensión*).
   - Se abrirá una nueva ventana especial de VS Code llamada **Extension Development Host**.
   - En esa nueva ventana, abre cualquier carpeta con imágenes y haz clic derecho en una imagen -> *Abrir con... -> Image Studio Editor*.

4. **Empaquetar como archivo .vsix para instalarlo permanentemente**:
   ```bash
   npx @vscode/vsce package
   code --install-extension vscode-image-editor-1.0.0.vsix
   ```
