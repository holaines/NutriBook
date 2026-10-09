# Garmin → Strava → NutriBook

La implementación se ha añadido al código, pero **NO queda activada** hasta configurar Strava y desplegar las funciones en Supabase. No introduzcas nunca el Client Secret en `config.js` ni lo subas a GitHub.

## A. Configurar la aplicación Strava

1. Entra en https://www.strava.com/settings/api y crea una aplicación.
2. **Application Name:** NutriBook; **Website:** `https://holaines.github.io/NutriBook/`.
3. **Authorization Callback Domain:** `cyewzqlkjbvsllotaywu.supabase.co` (solo dominio, sin https, sin ruta).
4. Conserva el **Client ID** y **Client Secret** para configurar los secretos de Supabase. El Client Secret se introduce **solo** en Supabase.
5. Confirma que Garmin Connect está vinculado a Strava y sube una actividad de prueba.

## B. Tablas en Supabase

En Supabase → SQL Editor ejecuta [strava.sql](./strava.sql). No sustituye el `supabase.sql` existente.

## C. Secretos de Supabase

En Supabase Dashboard → Edge Functions → Secrets, introduce:

- `STRAVA_CLIENT_ID`: el ID de Strava.
- `STRAVA_CLIENT_SECRET`: el **secreto privado** de Strava.
- `STRAVA_VERIFY_TOKEN`: un valor largo y aleatorio que inventes (solo backend).
- `NUTRIBOOK_SITE_URL`: `https://holaines.github.io/NutriBook/`.

La plataforma proporciona `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` según configuración/entorno de tu proyecto. Si tu proyecto utiliza nuevas secret keys, tendrás que adaptar las funciones a esas claves de servicio; **nunca** añadirlas al navegador.

## D. Desplegar las funciones

Instala Supabase CLI e inicia sesión, luego, dentro del proyecto:

```bash
supabase login
supabase link --project-ref cyewzqlkjbvsllotaywu
supabase functions deploy strava-oauth --no-verify-jwt
supabase functions deploy strava-webhook --no-verify-jwt
```

Ambas funciones aceptan solicitudes externas sin JWT de plataforma: `strava-oauth` verifica **en su código** el JWT de la persona en la solicitud de inicio, y su callback valida un nonce de un solo uso con caducidad. `strava-webhook` responde al challenge y procesa solamente actividades asociadas a una cuenta Strava previamente vinculada. No publiques ninguna clave privada en código cliente.

## E. Registrar un webhook de Strava (obligatorio para actualización automática)

Con las funciones desplegadas, registra una suscripción mediante un terminal privado, **sin pegar credenciales en conversaciones**:

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=TU_CLIENT_ID \
  -F client_secret=TU_CLIENT_SECRET \
  -F callback_url=https://cyewzqlkjbvsllotaywu.supabase.co/functions/v1/strava-webhook \
  -F verify_token=TU_STRAVA_VERIFY_TOKEN
```

Strava verificará la URL mediante GET; si funciona devolverá un subscription id. No hay necesidad de ejecutar esto desde el navegador. Una app solo debe tener su suscripción correcta.

## F. Conectar tu cuenta

1. Inicia sesión en **Mi perfil** en NutriBook mediante Supabase.
2. Ve a **Entrenamientos → Conectar Strava** y autoriza los permisos de lectura de actividades.
3. Al volver a NutriBook, pulsa **Actualizar actividades**. La primera conexión solicita las 100 actividades más recientes.
4. Las actividades nuevas que lleguen a Strava se procesarán a través del webhook y se guardarán en `strava_activities`. La pantalla consulta ese almacenamiento al pulsar **Actualizar actividades**; **la interfaz no se refresca sola en tiempo real** todavía.

Notas: el gasto calórico, la frecuencia cardíaca y otras métricas dependen de lo que Strava exponga. No son necesariamente calorías activas ni energía total del día. Las tablas incluyen RLS para lectura privada de actividades. Los tokens se guardan separados de los datos personales del recetario.

**Limitación:** Strava puede limitar el acceso a los datos de atletas o requerir una revisión para ampliar su uso. Las actividades anteriores a la conexión están limitadas inicialmente a 100 y pueden faltar hasta que implementemos paginación.
