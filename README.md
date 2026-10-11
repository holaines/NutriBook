# NutriBook 🌸

Seguimiento diario del hierro en la comida: recetas, calendario, menú del restaurante universitario (RAK), registro rápido, complementos, análisis de sangre e informe para el médico. App web sin compilación, con datos en el navegador y sincronización opcional con Supabase.

## Arranque

Abre la carpeta y ejecuta **Live Server** sobre `index.html` (o `python3 -m http.server`). No hace falta compilar nada.

Para los tests (solo desarrollo): `npm install` y `npm test` (Node 20+, usa `node:test` y `jsdom`).

## Qué hace

| Página | Para qué sirve |
|---|---|
| **Inicio** | «Ahora toca»: la próxima comida (receta planificada o mejor opción del RAK) con su hierro y un toque para marcarla; anillo del día, consejos de absorción y sugerencias «para llegar a tu objetivo». |
| **Calendario** | Semana (en móvil, un día con selector y deslizar). «Sugerir semana» muestra una propuesta que apunta a tu objetivo de hierro antes de aplicarla; copiar a la semana siguiente; arrastrar recetas entre huecos. Menú del RAK integrado. |
| **Recetas** | Biblioteca. El hierro se calcula **con los ingredientes** (base de 138 alimentos, con desglose); la IA solo es el repuesto y nunca pisa un valor puesto a mano. Importa desde texto o desde un enlace. |
| **Mi hierro** | Semana o mes: total, media, días con objetivo, racha, de dónde viene tu hierro, comparación con el periodo anterior, absorción estimada, complementos y análisis de sangre. |
| **Mi compra** | Lista por rayones con lo que ya tienes en la despensa, extras, compartir (menú del móvil o WhatsApp) y sugerencias para subir el hierro de la semana. |
| **Informe** | Resumen imprimible (PDF) y CSV para llevar al médico o dietista. |
| **Mi perfil** | Objetivo de hierro recomendado según tu perfil, tema claro/oscuro, instalar la app, copia JSON. |

Atajos: botón **+** (o la tecla `n`) abre el registro rápido: busca un alimento y añade ½, 1 o 2 raciones.

> Los valores de hierro y de absorción son **estimaciones** (tablas de composición y modelos simples). Las referencias del objetivo son de población general; no sustituyen el consejo de un profesional sanitario. El análisis de gluten del RAK lo hace una IA a partir del nombre del plato.

## Configurar Supabase (solo una vez)

1. Crea un proyecto en https://supabase.com y espera a que esté activo.
2. En **SQL Editor** ejecuta [supabase.sql](./supabase.sql): crea `nutribook_data` con **Row Level Security** (cada persona solo ve lo suyo).
3. En **Project Settings → API** copia **Project URL** y la **publishable key** a [supabase-config.js](./supabase-config.js). Son públicas; **nunca** compartas una clave `service_role` o `secret`.
4. En **Authentication → URL Configuration** añade la URL de tu web a los **Redirect URLs** (mejor bajo HTTPS, p. ej. GitHub Pages).
5. En la app: **Mi perfil → Mi cuenta y sincronización**, introduce tu correo y entra con el enlace que recibirás.

### Sincronización

- Sin sesión, todo vive en `localStorage` y **no** se sincroniza.
- Con sesión, el documento JSON de la nube se **une** con el local elemento a elemento (recetas, despensa, comidas, plan, compra, complementos, análisis, favoritos, perfil): dos dispositivos pueden editar a la vez; si tocan lo mismo, gana la modificación más reciente. Los borrados se propagan con «tumbas» que caducan a los 90 días. Lógica en `src/merge.js`.
- Sin conexión, los cambios quedan en el dispositivo y se suben solos al volver la red. La app abre sin conexión (service worker).
- GitHub almacena el código, **no** tus datos.

## Arquitectura (sin framework ni build)

```
index.html            carga los scripts en orden (sin código en línea: CSP estricta)
src/core.js           constantes, utilidades, estado, migraciones (schemaVersion) y dayIron()
src/html.js, events.js  plantillas con escape automático y delegación de eventos (data-click…)
src/merge.js          sincronización por elemento
src/foods.js          base de alimentos con hierro       src/recipe-iron.js  hierro de una receta
src/absorption.js     hierro absorbido y consejos         src/stats.js        estadísticas por periodo
src/planner.js        planificador de la semana           src/suggest.js      «para llegar al objetivo»
src/pages/*.js        una página por archivo              src/rak-ui.js       menú del RAK
cloud-sync.js         Supabase (sesión, unión, cola sin conexión)      rak.js   datos del RAK
sw.js, manifest.webmanifest, icons/    PWA
supabase/functions/   rak-fetch · iron-estimate · recipe-import · _shared (lógica pura probada con node)
tests/                node --test (jsdom): ~220 pruebas
```

Convenciones: los manejadores se declaran con `on('click', 'accion', arg…)` (nunca `onclick=`); `dayIron(fecha)` es el único cálculo de hierro del día; los datos nuevos del JSON se añaden con una migración en `MIGRATIONS`.

## Menú del RAK

La Edge Function `rak-fetch` (solo con sesión, máximo una lectura completa por minuto) lee la web del RAK (semana actual y siguiente), guarda los platos en `rak_menus` y analiza gluten y hierro con Gemini por lotes pequeños. La app carga el menú sola al abrir el calendario; si falta o tiene más de 24 h lo pide en segundo plano. Avisa una vez cuando aparece el menú de la semana siguiente.

## Despliegue (automático al hacer push a `main`)

`.github/workflows/deploy.yml`: **tests** y **deno check** de las funciones (si fallan, no se despliega) → ejecuta `rak.sql`, publica `rak-fetch`, `iron-estimate` y `recipe-import`, y despliega GitHub Pages.
Secretos en GitHub: `SUPABASE_ACCESS_TOKEN` y `GEMINI_KEY` (este último solo se copia a los secretos de Supabase; nunca llega a la web). El workflow falla con un mensaje claro si falta alguno.
