/* NutriBook: backup y sincronización privada en Supabase. */
(function () {
  'use strict';
  const config = window.NUTRIBOOK_SUPABASE || {};
  const active = /^https:\/\//.test(config.url || '') && Boolean(config.key);
  let client = null, user = null, readLocal = null, applyCloud = null;
  let ready = false, saving = false, pending = null, timer = null, status = '';
  const note = s => { status=s; const el=document.getElementById('cloud-status'); if(el) el.textContent=s; };
  const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\x27':'&#39;'}[c]));
  if(active && window.supabase?.createClient) {
    client = window.supabase.createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true}});
  }
  function panel(){
    if (!active) return '<div class="card" style="margin-bottom:20px"><h3>☁️ Sincronización en la nube</h3><p>Para activarla, completa <code>config.js</code> con la URL y la clave pública de tu proyecto Supabase y ejecuta <code>supabase.sql</code>.</p><p class="muted small">Mientras tanto las recetas siguen guardadas únicamente en este navegador. Exporta una copia JSON.</p></div>';
    if(!client) return '<div class="card">No se pudo cargar Supabase. Revisa la conexión a Internet.</div>';
    return '<div class="card" style="margin-bottom:20px"><h3>☁️ Mi cuenta y sincronización</h3><p id="cloud-status">'+esc(status || (user?'Sesión iniciada':'Sin sesión'))+'</p>'+(user?'<p>'+esc(user.email||'')+'</p><div class="buttons"><button class="btn primary" onclick="NutriCloud.syncNow()">Sincronizar ahora</button><button class="btn" onclick="NutriCloud.signOut()">Cerrar sesión</button></div>':'<p class="muted">Introduce tu correo para recibir un enlace de acceso. Revisa la configuración de correo de Supabase.</p><div class="buttons"><input id="cloud-email" type="email" placeholder="Tu correo electrónico" style="min-width:220px;padding:10px;border-radius:10px;border:1px solid #eddce3"><button class="btn primary" onclick="NutriCloud.signIn()">Recibir enlace</button></div>')+'</div>';
  }
  const refresh=()=>{if(typeof window.render==='function')window.render();else document.querySelector('[onclick="navigate(\'Perfil\')"]')?.click()};
  async function start(opts){
    readLocal=opts.read;applyCloud=opts.apply;
    if (!client) return;
    try {
      const {data,error}=await client.auth.getUser();
      if(error) throw error;
      if(data.user) await connect(data.user);
      client.auth.onAuthStateChange((event,session)=>{
        if(event==='SIGNED_IN' && session?.user && (!user || user.id!==session.user.id)) setTimeout(()=>connect(session.user).catch(e=>note(e.message)),0);
        if(event==='SIGNED_OUT'){user=null;ready=false;pending=null;note('Sesión cerrada. Los cambios solo se guardarán localmente.');}
      });
    } catch(e){note('No se pudo iniciar la nube: '+e.message)}
  }
  async function connect(u){
    user=u;ready=false;pending=null;note('Conectando a la base de datos…');
    const {data,error}=await client.from('nutribook_data').select('payload').eq('user_id',u.id).maybeSingle();
    if(error){note('Error de Supabase: '+error.message);return}
    if(data && data.payload && Object.keys(data.payload).length){
      const cloud=data.payload;
      const local=readLocal();
      const localHasData=(local.recipes?.length||0)+(local.pantry?.length||0)+Object.keys(local.plan||{}).length>0;
      if(localHasData && JSON.stringify(local)!==JSON.stringify(cloud)){
        if(!confirm('Ya hay datos de NutriBook en la nube. ¿Quieres descargarlos a este navegador? ANTES exporta una copia JSON si necesitas conservar los datos locales. Si cancelas, no se sobrescribirá nada.')) {
          note('Diferencias pendientes: exporta una copia JSON y pulsa Sincronizar ahora para decidir.');return;
        }
      }
      applyCloud(cloud);
      ready=true;note('✓ Recetas descargadas de Supabase y sincronización activada.');
    } else {
      const local=readLocal();
      if(!confirm('No hay datos en esta cuenta de Supabase. ¿Quieres subir las recetas que tienes en este navegador?')){note('Sincronización pendiente de confirmar.');return}
      ready=true;
      await write(local);
      note('✓ Recetas locales guardadas en Supabase.');
    }
  }
  async function write(value) {
    if(!client||!user||!ready)return;
    const {error}=await client.from('nutribook_data').upsert({user_id:user.id,payload:value,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if(error)throw error;
  }
  async function drain(){
    if(saving || !ready || !user || !pending)return;
    saving=true;
    try {
      while(pending){const current=pending;pending=null;await write(current)}
      note('✓ Cambios guardados en Supabase.');
    }catch(e){note('⚠ Error al sincronizar: '+e.message+'. Exporta un JSON de respaldo.')}
    finally{saving=false}
  }
  function scheduleSave(value){
    if(!ready||!user)return;
    pending=JSON.parse(JSON.stringify(value));
    clearTimeout(timer);timer=setTimeout(drain,700);
    note('Guardando cambios en la nube…');
  }
  async function signIn(){
    const email=document.getElementById('cloud-email')?.value?.trim();
    if(!email){alert('Introduce tu correo.');return}
    const redirectTo=location.protocol==='https:'?location.origin+location.pathname:undefined;
    const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo}});
    note(error?'Error: '+error.message:'Revisa tu correo electrónico para acceder.');
  }
  async function signOut(){const {error}=await client.auth.signOut();if(error)note(error.message);else {user=null;ready=false;note('Sesión cerrada.');}}
  async function syncNow(){if(!user){note('Inicia sesión primero.');return}await connect(user)}
  window.NutriCloud={panel,start,scheduleSave,signIn,signOut,syncNow,getClient:()=>client,getUser:()=>user};
})();
