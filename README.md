# NutriBook 🌸

Aplicación de recetas con almacenamiento local y sincronización opcional con Supabase.

## Arranque en VS Code

Abre la carpeta y ejecuta **Live Server** sobre `index.html`. No necesitas Node ni un sistema de compilación.

## Configurar Supabase (solo una vez)

1. Crea un proyecto en https://supabase.com y espera a que esté activo.
2. Abre **SQL Editor**, pega el contenido de [supabase.sql](./supabase.sql) y ejecútalo. Se crea la tabla `nutribook_data` con **Row Level Security** para que cada persona solo pueda leer/escribir sus datos.
3. Abre **Project Settings → API** (o **Connect** según la interfaz). Copia **Project URL** y la **publishable key** (o la clave pública `anon` heredada) a [config.js](./config.js). Estas dos son públicas; **nunca** compartas una clave `service_role` o `secret`.
4. En **Authentication → URL Configuration**, añade la URL de tu web desplegada a los **Redirect URLs**. Para usar enlaces de acceso desde correo, se recomienda publicar la web bajo HTTPS (por ejemplo GitHub Pages). Si utilizas localhost, añade también la URL local correspondiente.
5. Abre la página → **Mi perfil → Mi cuenta y sincronización**, introduce tu correo y accede desde el enlace recibido. La primera vez, confirma subir las recetas locales o recuperar los datos existentes en la nube.

### Importante
- Sin configuración o sin iniciar sesión, la aplicación sigue usando `localStorage` y **no** está sincronizada.
- Al acceder desde otro dispositivo con la misma cuenta, se descarga el mismo recetario.
- Si hay diferencias entre datos locales y la nube, **no se sobrescriben automáticamente**: se pide confirmación. Exporta un JSON desde Mi perfil antes de recuperar datos de la nube.
- La sincronización es una copia JSON completa de recetas/calendario/despensa/perfil, adecuada como primera etapa. No combina ediciones simultáneas entre dispositivos; la última guardada puede prevalecer.
- Si el navegador está sin conexión, usa la exportación JSON como copia de seguridad. El estado de sincronización se muestra en **Mi perfil**.
- GitHub almacena el código, **no** las recetas privadas.
