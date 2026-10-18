/**
 * depthstyle.js — pantalla «DepthStyle»: su propia página, separada de Inicio.
 *
 *  - Se abre con el ítem «DepthStyle» del menú (barra de iconos y drawer).
 *  - Ocupa el lugar de la página principal (ver screens.js); no toca Inicio.
 */

const MOBILE_QUERY = '(max-width: 760px)';   // debe coincidir con menu.js

const nameOf = (item) => item.dataset.tip ?? item.dataset.x ?? null;

export function initDepthstyle({ app, menu, screens }) {
  const mobile = window.matchMedia(MOBILE_QUERY);

  function showDepthstyle() {
    if (mobile.matches && menu.isOpen()) menu.close();   // en el móvil el menú se superpone: se aparta
    screens.show('depthstyle');
  }

  app.addEventListener('click', (e) => {
    const item = e.target.closest('.item');
    if (item && app.contains(item) && nameOf(item) === 'DepthStyle') showDepthstyle();
  });
}
