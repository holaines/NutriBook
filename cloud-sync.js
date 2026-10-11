/* NutriBook: backup y sincronización privada en Supabase. */
(function () {
  'use strict';
  const config = window.NUTRIBOOK_SUPABASE || {};
  const active = /^https:\/\//.test(config.url || '') && Boolean(config.key);
  let client = null, user = null, readLocal = null, applyCloud = null;
  let ready = false, saving = false, pending = null, timer = null, status = '', dirty = false;
  const note = s => { status=s; const el=document.getElementById('cloud-status'); if(el) el.textContent=s; const slot=document.getElementById('sync-slot'); if(slot) slot.innerHTML=syncBadge(); };
  const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\x27':'&#39;'}[c]));
  if(active && window.supabase?.createClient) {
    client = window.supabase.createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true}});
  }
  function panel(){
    if (!active) return '<div class="card" style="margin-bottom:20px"><h3>&#x2601;&#xFE0F; Sincronización en la nube</h3><p>Para activarla, completa <code>supabase-config.js</code> con la URL y la clave pública de tu proyecto Supabase y ejecuta <code>supabase.sql</code>.</p><p class="muted small">Mientras tanto las recetas siguen guardadas únicamente en este navegador. Exporta una copia JSON.</p></div>';
    if(!client) return '<div class="card">No se pudo cargar Supabase. Revisa la conexión a Internet.</div>';
    const meta = user?.user_metadata || {};
    return '<div class="card" style="margin-bottom:20px"><h3>&#x2601;&#xFE0F; Mi cuenta y sincronización</h3><p id="cloud-status">'+esc(status || (user?'Sesión iniciada':'Sin sesión'))+'</p>'+(user
      ? '<p>'+esc(user.email||'')+'</p><div class="buttons"><button class="btn primary" data-click="cloudSyncNow" data-args=\'["@el"]\'>Sincronizar ahora</button><button class="btn" data-click="cloudSignOut">Cerrar sesión</button></div>'
      : '<p class="muted">Introduce tu correo para recibir un enlace de acceso.</p><div class="buttons"><input id="cloud-email" type="email" placeholder="Tu correo electrónico" style="min-width:220px;padding:10px;border-radius:10px;border:1px solid #eddce3"><button class="btn primary" data-click="cloudSignIn">Recibir enlace</button></div>')+'</div>';
  }
  const refresh=()=>{if(typeof window.render==='function')window.render()};
  async function start(opts){
    readLocal=opts.read;applyCloud=opts.apply;
    if (!client) { opts.onReady?.(); return; }
    try {
      const {data,error}=await client.auth.getSession();
      if(error) throw error;
      if(data.session?.user) { await connect(data.session.user); opts.onConnect?.(); }
      client.auth.onAuthStateChange((event,session)=>{
        if(event==='SIGNED_IN' && session?.user && (!user || user.id!==session.user.id)) setTimeout(()=>connect(session.user).then(()=>opts.onConnect?.()).catch(e=>note(e.message)),0);
        if(event==='SIGNED_OUT'){user=null;ready=false;pending=null;note('Sesión cerrada. Los cambios solo se guardarán localmente.');refresh();}
      });
    } catch(e){note('No se pudo iniciar la nube: '+e.message)}
    finally { opts.onReady?.(); }
  }
  const merge = (local, cloud) => (window.NBMerge && cloud && Object.keys(cloud).length ? window.NBMerge.mergeStates(local, cloud) : local);
  async function fetchCloud(u){
    const {data,error}=await client.from('nutribook_data').select('payload').eq('user_id',u.id).maybeSingle();
    if(error)throw error;
    return data?.payload||null;
  }
  async function connect(u){
    user=u;ready=false;pending=null;note('Conectando a la base de datos\u2026');
    let cloud;
    try{cloud=await fetchCloud(u)}catch(e){note('Error de Supabase: '+e.message);return}
    // La unión conserva lo de ambos lados (gana el cambio más reciente de cada elemento): no hace falta preguntar.
    const merged=merge(readLocal(),cloud);
    applyCloud(merged);
    ready=true;
    await write(merged,{merged:true});
    note(cloud?'\u2713 Datos sincronizados con Supabase.':'\u2713 Recetas locales guardadas en Supabase.');
  }
  // Antes de escribir se vuelve a leer la nube y se une: otro dispositivo pudo guardar entretanto.
  async function write(value,opts={}) {
    if(!client||!user||!ready)return;
    let out=value;
    if(!opts.merged){
      out=merge(JSON.parse(JSON.stringify(readLocal())),await fetchCloud(user));   // estado actual, no la copia pendiente
      if(JSON.stringify(out)!==JSON.stringify(value))applyCloud(out);
    }
    const {error}=await client.from('nutribook_data').upsert({user_id:user.id,payload:out,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if(error)throw error;
  }
  async function drain(){
    if(saving || !ready || !user || !pending)return;
    saving=true;
    try {
      while(pending){const current=pending;pending=null;await write(current)}
      dirty=false;
      note('\u2713 Cambios guardados en Supabase.');
    }catch(e){dirty=true;note('\u26a0 Sin conexión o error al sincronizar ('+e.message+'). Se reintentará solo; tus cambios están a salvo en este dispositivo.')}
    finally{saving=false}
  }
  function scheduleSave(value){
    if(!ready||!user)return;
    dirty=true;pending=JSON.parse(JSON.stringify(value));
    clearTimeout(timer);timer=setTimeout(drain,700);
    note('Guardando cambios en la nube\u2026');
  }
  async function signIn(){
    const email=document.getElementById('cloud-email')?.value?.trim();
    if(!email){note('Introduce tu correo.');return}
    const redirectTo=location.protocol==='https:'?location.origin+location.pathname:undefined;
    const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo}});
    note(error?'Error: '+error.message:'Revisa tu correo electrónico para acceder.');
  }
  async function signOut(){clearTimeout(timer);pending=null;const {error}=await client.auth.signOut();if(error)note(error.message);else {user=null;ready=false;note('Sesión cerrada.');}}
  async function syncNow(){if(!user){note('Inicia sesión primero.');return}await connect(user)}
  function syncBadge(){
    if(!active)return'';
    if(!user)return'<div class="sync-badge no-session">\u2601 Sin sesión</div>';
    const meta=user.user_metadata||{};
    const img=meta.avatar_url?'<img src="'+esc(meta.avatar_url)+'" class="sync-avatar" alt="">':'';
    if(status.startsWith('\u2713'))return'<div class="sync-badge ok">'+img+'\u2601 Guardado</div>';
    if(status.startsWith('\u26a0'))return'<div class="sync-badge warn">'+img+'\u26a0 Error sync</div>';
    if(status.includes('Guardando'))return'<div class="sync-badge saving">'+img+'\u2601 Guardando\u2026</div>';
    return'<div class="sync-badge ok">'+img+'\u2601 '+esc(user.email?.split('@')[0]||'')+'</div>';
  }
  // Cola de escrituras: un único «pendiente» (siempre el estado más reciente, así no se duplican) que se reintenta al volver la red.
  window.addEventListener('online',()=>{if(dirty&&ready&&user&&!saving){pending=JSON.parse(JSON.stringify(readLocal()));drain()}});
  window.NBEvents?.register({
    cloudSyncNow: (btn) => { btn.disabled=true;btn.textContent='Sincronizando\u2026';syncNow().finally(()=>{btn.disabled=false;btn.textContent='Sincronizar ahora'}) },
    cloudSignOut: () => signOut(),
    cloudSignIn: () => signIn(),
  });
  window.NutriCloud={panel,start,scheduleSave,signIn,signOut,syncNow,syncBadge,getClient:()=>client,getUser:()=>user,getUserMeta:()=>user?.user_metadata||{}};
})();
