/**
 * nav.js — ítem activo en el menú (barra de iconos y drawer) y en la barra inferior.
 *
 * Al hacer clic en un ítem pasa a ser el activo: clase `.on` (el CSS y motion.css ya animan
 * el cambio) y `aria-current="page"` para los lectores de pantalla.
 *
 *  - Menú: la barra de iconos y el drawer repiten los mismos ítems; se identifican por su
 *    nombre (`data-tip` / `data-x`), así que al elegir uno se marca en los dos a la vez.
 *  - Barra inferior: es independiente del menú. El botón central (`.add`) es una acción,
 *    no un destino: no se marca.
 */

const nameOf = (item) => item.dataset.tip ?? item.dataset.x ?? null;

export function initNav({ app }) {
  const menuItems = app.querySelectorAll('.item');
  const tabs = app.querySelectorAll('.dock .tab');

  function mark(el, on) {
    el.classList.toggle('on', on);
    if (on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }

  function selectItem(name) {
    for (const item of menuItems) mark(item, nameOf(item) === name);
  }

  function selectTab(tab) {
    for (const t of tabs) mark(t, t === tab);
  }

  app.addEventListener('click', (e) => {
    const item = e.target.closest('.item');
    if (item && app.contains(item)) {
      const name = nameOf(item);
      if (name) selectItem(name);
      return;
    }
    const tab = e.target.closest('.dock .tab');
    if (tab) selectTab(tab);
  });

  // Estado inicial: el HTML ya marca Actividad y la pestaña Inicio con `.on`.
  // Aquí solo se completa aria-current para que coincida (la pestaña ya lo trae).
  for (const item of menuItems) if (item.classList.contains('on')) item.setAttribute('aria-current', 'page');

  return { selectItem, selectTab };
}
