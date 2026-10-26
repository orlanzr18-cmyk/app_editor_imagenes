# Image Studio 🎨

Editor de imágenes en el navegador, con reconocimiento de texto (OCR). Todo se procesa en tu equipo: las imágenes no se suben a ningún servidor.

🔗 **Demo:** https://orlanzr18-cmyk.github.io/app_editor_imagenes/

## Características

- **Edición:** brillo, contraste, saturación, desenfoque y filtros (B&N, sepia, invertir).
- **Transformaciones:** rotar, voltear y recortar con selección libre o proporciones fijas.
- **OCR:** reconoce el texto de una imagen en español o inglés (Tesseract.js).
- **Tablas:** convierte tablas de una imagen a Excel (.xlsx) o CSV.
- **Editar texto en la imagen:** reemplaza o borra texto directamente sobre la imagen.
- **Exportar:** PNG, JPG o WebP.

## Uso

1. Abre la página y arrastra una imagen, pégala con Ctrl+V o usa **Abrir**.
2. Edita con las herramientas de la barra superior y lateral.
3. Para texto o tablas, pulsa **Reconocer texto** en la sección *Texto (OCR)*.
4. Descarga el resultado.

## Archivos

- `index.html` – estructura de la página
- `style.css` – estilos
- `app.js` – lógica del editor
- `ocr-utils.js` – detección de filas y columnas para las tablas

## Notas

- El OCR necesita internet la primera vez para descargar el motor y el idioma.
- La precisión depende de la calidad de la imagen.
