# NutriBook 🌸

Aplicación de recetas con almacenamiento local y sincronización opcional con Supabase.

## Arranque en VS Code

Abre la carpeta y ejecuta **Live Server** sobre `index.html`. No necesitas Node ni un sistema de compilación.

## Configurar Supabase (solo una vez)

1. Crea un proyecto en https://supabase.com y espera a que esté activo.
2. Abre **SQL Editor**, pega el contenido de [supabase.sql](./supabase.sql) y ejecútalo. Se crea la tabla `nutribook_data` con **Row Level Security** para que cada persona solo pueda leer/escribir sus datos.
3. Abre **Project Settings → API** (o **Connect** según la interfaz). Copia **Project URL** y la **publishable key** (o la clave pública `anon` heredada) a [supabase-config.js](./supabase-config.js). Estas dos son públicas; **nunca** compartas una clave `service_role` o `secret`.
4. En **Authentication → URL Configuration**, añade la URL de tu web desplegada a los **Redirect URLs**. Para usar enlaces de acceso desde correo, se recomienda publicar la web bajo HTTPS (por ejemplo GitHub Pages). Si utilizas localhost, añade también la URL local correspondiente.
5. Abre la página → **Mi perfil → Mi cuenta y sincronización**, introduce tu correo y accede desde el enlace recibido. La primera vez, confirma subir las recetas locales o recuperar los datos existentes en la nube.

### Importante
- Sin configuración o sin iniciar sesión, la aplicación sigue usando `localStorage` y **no** está sincronizada.
- Al acceder desde otro dispositivo con la misma cuenta, se descarga el mismo recetario.
- Si hay diferencias entre datos locales y la nube, **no se sobrescriben automáticamente**: se pide confirmación. Exporta un JSON desde Mi perfil antes de recuperar datos de la nube.
- La sincronización es una copia JSON completa de recetas/calendario/despensa/perfil, adecuada como primera etapa. No combina ediciones simultáneas entre dispositivos; la última guardada puede prevalecer.
- Si el navegador está sin conexión, usa la exportación JSON como copia de seguridad. El estado de sincronización se muestra en **Mi perfil**.
- GitHub almacena el código, **no** las recetas privadas.

## Nuevas funciones: hierro y entrenamiento

- En **Mi equilibrio**, registra las comidas consumidas manualmente o seleccionando una receta existente; consulta hierro diario y semanal. Los valores faltantes no se cuentan como cero verificado.
- En **Entrenamientos**, anota deporte, minutos y calorías activas estimadas.
- Garmin Connect: en la web ve a **Actividades → Todas las actividades → Export CSV**, e importa ese CSV en NutriBook. Esta importación es un resumen inicial; comprueba fechas y calorías. Las calorías CSV se guardan como `reportedCalories` y no se suponen activas.
- Todo forma parte del JSON local y de la carga de Supabase existente cuando haya una sesión y una sincronización activas.
- La conexión automática OAuth/Developer Program con Garmin y las recomendaciones nutricionales basadas en entrenamientos aún **no** están integradas.

## Hierro: dónde se ve y cómo se calcula

- **Inicio**: anillo del día (comido / previsto / objetivo), comidas de hoy con botón «Marcar comido» y gráfico de la semana.
- **Calendario**: cada día muestra su barra de hierro (fuerte = comido, claro = previsto). Cada receta planificada tiene su mg y un botón «Comido».
- **Mi hierro**: totales de la semana, días con objetivo cumplido y detalle por día. Los objetivos (16 mg/día y 5 mg/comida por defecto) se cambian en **Mi perfil**.
- El hierro de una receta se escribe a mano o lo estima la IA (Gemini) desde **Ver receta → Calcular hierro con IA**. La clave de Gemini **nunca** llega al navegador: la usa la Edge Function `iron-estimate` (solo con sesión iniciada).

## Menú del RAK

La Edge Function `rak-fetch` lee la web del RAK (semana actual y siguiente), guarda los platos en `rak_menus` y analiza gluten y hierro con Gemini por lotes pequeños. La app carga el menú sola al abrir el calendario; si falta o tiene más de 24 h, lo pide en segundo plano. El botón «Actualizar» fuerza una nueva lectura.

## Despliegue (automático al hacer push a `main`)

El workflow `.github/workflows/deploy.yml` ejecuta `rak.sql`, publica las funciones `rak-fetch` e `iron-estimate` y despliega GitHub Pages.
Secretos necesarios en GitHub: `SUPABASE_ACCESS_TOKEN` y `GEMINI_KEY` (este último solo se copia a los secretos de Supabase, no a la web).
