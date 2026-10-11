# Auditoría NutriBook (11-oct-2026)

## Qué fallaba
| # | Problema | Estado |
|---|----------|--------|
| 1 | **Menú RAK de la semana siguiente no aparecía**: el botón solo traía la semana visible, nada se cargaba solo, y la función de servidor lo analizaba todo en *una* llamada a Gemini (respuesta truncada ⇒ todo «desconocido», o timeout sin guardar nada). | Corregido: carga automática (semana actual + siguiente), refresco si hay >24 h, lotes de 12 platos, los platos se guardan antes de analizarlos, errores claros en el banner. |
| 2 | **Clave Gemini en el navegador** (inyectada por el workflow en la web pública) | Corregido: ahora vive solo en el servidor (`iron-estimate`). **Hay que revocar la clave actual** y crear otra. |
| 3 | Enlaces rotos entre páginas: «Lista de la compra» y «Mi equilibrio» volvían a la semana actual al navegar; tras volver de Strava (`?strava=connected`) no pasaba nada; las tarjetas de receta parecían clicables pero solo el botón funcionaba; «Hoy en tu menú» no enlazaba a nada. | Corregido |
| 4 | Guardar una receta **sobrescribía siempre el hierro manual** con la estimación de la IA. | Corregido |
| 5 | «Pegar receta» guardaba una receta a medias aunque se cancelara. | Corregido (borrador) |
| 6 | El total semanal de hierro no incluía el RAK (el diario sí). | Corregido (cálculo único `dayIron`) |
| 7 | Compra: un ingrediente con apóstrofo rompía la casilla; kg/g y l/ml no se sumaban; el parser leía «1 lechuga» como «1 l + echuga». | Corregido |
| 8 | Interfaz mezclada en español y francés, `prompt()`/`alert()` del navegador para registrar comidas. | Todo en español, formularios y avisos propios con «Deshacer». |
| 9 | `app.js` era una sola línea minificada de 40 KB. | Reescrito legible por secciones |

## Pendiente / a decidir
- **Sincronización**: copia JSON completa, gana el último en guardar (dos dispositivos pueden pisarse).
- El análisis de gluten/hierro del RAK lo estima una IA a partir del *nombre* del plato; no sustituye la ficha oficial de alérgenos.
- Sin tests automáticos. Sin modo offline (service worker).
