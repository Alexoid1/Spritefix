# SpriteForge

Herramienta para crear sprite sheets / atlases para videojuegos. Carga una imagen, detecta sprites automáticamente, escálalos a tamaño uniforme y exporta PNG + JSON en múltiples formatos.

## Requisitos

- [Node.js](https://nodejs.org/) >= 18
- [npm](https://www.npmjs.com/)

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm start
```

Visita [http://localhost:4200](http://localhost:4200).

## Funcionalidades

- **Carga de imagen** por filepicker o drag & drop
- **4 modos de edición**: Seleccionar, Dibujar, Mover, Pan
- **Grid uniforme**: divide la imagen en filas/columnas
- **Auto-detección**: detecta sprites por color de fondo con tolerancia ajustable
- **Auto Escalado**: normaliza todos los sprites al tamaño máximo y los ordena en cuadrícula
- **Auto Scaling**: re-escala sprites con modos Fit/Stretch/Crop/1:1
- **Exportación**: PNG + JSON (Phaser, PixiJS v8, Array, CSS)
- **Fondo transparente** en exportación
- **Atajos de teclado**: S/D/M/P para modos, flechas para mover/redimensionar, +/- zoom
