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
línea; añadir uno no obliga a tocar código. Basta con subir el **video** al bucket y añadir su línea:

```json
{ "name": "Niebla suave", "category": "Humo", "video": "Deep.op009.mp4" }
```

- `name`, `category` y `video` son lo único necesario. Las categorías de los botones salen solas de `category`.
- **No hace falta miniatura.** La tarjeta pide solo el principio del video, pinta su primer cuadro y suelta
  el video. Tampoco hace falta `duration`: se lee del propio video. Ambos se pueden indicar si se quiere
  (`thumb`: imagen 16:9 propia; `duration`: segundos; `new: true`: etiqueta «Nuevo»).
- `base` (arriba del todo) es la dirección donde están los archivos: ahora el bucket de Filebase. Vacío =
  junto a `catalog.json`. Si algún día se cambia de servicio, solo se mueve el contenido y se cambia `base`.
- La lista se muestra en **páginas de 10** con botones Anterior / Siguiente. Con 10 overlays o menos no
  aparece el paginador.
- Para que las vistas previas pesen poco, exporta los videos **optimizados para web** (índice al inicio,
  «faststart»). Si no, el navegador puede tener que bajar el archivo entero solo para sacar el primer cuadro.
- El bucket debe ser **público** (si no, las tarjetas se quedan con el número y la hoja avisa de que no
  se pudo cargar el video). El botón «Descargar overlay» necesita además CORS en el bucket, porque descarga
  el archivo con `fetch`; las vistas previas y la reproducción no lo necesitan.
- Los videos **no** van en `PRECACHE` (pesan demasiado); `catalog.json` sí.
