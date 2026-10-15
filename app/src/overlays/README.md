# Overlays

Sube aquí las imágenes de la fila de overlays de la página principal, con **estos nombres exactos**:

```
overlay-1.jpg
overlay-2.jpg
overlay-3.jpg
overlay-4.jpg
overlay-5.jpg
```

- Proporción **16:9** (por ejemplo 640 × 360 px). Con otra proporción se recortan al centro.
- Formato JPG. Mejor si pesa menos de 100 KB cada una.
- Hasta que subas una imagen, su casilla muestra un marcador con el número.
- No hace falta tocar código. Si cambias los nombres o añades más casillas, hay que editar la lista
  en `index.html` (sección «Overlays»).
- Estas imágenes **no** están en la lista `PRECACHE` de `sw.js` a propósito: si faltara una, el service
  worker no podría instalarse y la app dejaría de funcionar sin conexión. Se guardan en la copia sin
  conexión después de verlas una vez con conexión.

## Catálogo (`catalog.json`)

Es la lista que muestra la pantalla **Overlays** (ítem del menú, antes «Proyectos»). Cada overlay es una
línea; añadir uno no obliga a tocar código:

```json
{ "name": "Niebla suave", "category": "Humo", "duration": 5, "new": true,
  "thumb": "thumbs/niebla-suave.webp", "video": "videos/niebla-suave.webm" }
```

- `name` y `category` son obligatorios. Las categorías de los botones salen solas de este campo.
- `duration` en segundos. `new: true` pone la etiqueta «Nuevo».
- `thumb` (miniatura 16:9) y `video` (1080p) son opcionales. Sin `thumb`, la tarjeta muestra un marcador con
  su número; sin `video`, el botón de descarga queda desactivado con un aviso.
- `base` (arriba del todo) es la carpeta o dirección donde están `thumb` y `video`. Vacío = junto a
  `catalog.json`. Para usar un bucket de almacenamiento propio basta con poner aquí su dirección pública
  (con CORS abierto, para que la app pueda descargar el archivo); el código no cambia.
- Los videos y las miniaturas **no** van en `PRECACHE` (pesan demasiado); `catalog.json` sí.
- Mientras no haya videos ni miniaturas, las 8 entradas de ejemplo son marcadores.
