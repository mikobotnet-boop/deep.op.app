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
