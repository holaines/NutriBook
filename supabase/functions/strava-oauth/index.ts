import { createClient } from "npm:@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(url,service,{auth:{persistSession:false}});
const clientId=Deno.env.get("STRAVA_CLIENT_ID")!,secret=Deno.env.get("STRAVA_CLIENT_SECRET")!;
const site=Deno.env.get("NUTRIBOOK_SITE_URL")||"https://holaines.github.io/NutriBook/";
const callback=url+"/functions/v1/strava-oauth";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{"Content-Type":"application/json",...cors}});
Deno.serve(async req=>{
try{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 const u=new URL(req.url);
 if(req.method==="POST"){
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const {data:{user},error}=await admin.auth.getUser(token);
  if(error||!user)return json({error:"Inicia sesión en NutriBook primero."},401);
  const nonce=crypto.randomUUID()+crypto.randomUUID();
  const {error:dbErr}=await admin.from("strava_oauth_states").insert({nonce,user_id:user.id,expires_at:new Date(Date.now()+10*60*1000).toISOString()});
  if(dbErr)throw dbErr;
  const params=new URLSearchParams({client_id:clientId,redirect_uri:callback,response_type:"code",approval_prompt:"auto",scope:"activity:read_all",state:nonce});
  return json({url:"https://www.strava.com/oauth/authorize?"+params});
 }
 if(req.method==="GET"){
  const state=u.searchParams.get("state"),code=u.searchParams.get("code");
  const record=state?await admin.from("strava_oauth_states").select("user_id,expires_at").eq("nonce",state).maybeSingle():null;
  if(!record?.data||new Date(record.data.expires_at).getTime()<Date.now())return new Response("Estado OAuth caducado o inválido",{status:400});
  await admin.from("strava_oauth_states").delete().eq("nonce",state);
  if(!code)return Response.redirect(site+"?strava=cancelled",302);
  const response=await fetch("https://www.strava.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:clientId,client_secret:secret,code,grant_type:"authorization_code"})});
  const auth=await response.json();if(!response.ok||!auth.access_token)throw Error("Strava OAuth: "+JSON.stringify(auth));
  const {error:dbErr}=await admin.from("strava_connections").upsert({user_id:record.data.user_id,athlete_id:auth.athlete.id,access_token:auth.access_token,refresh_token:auth.refresh_token,expires_at:auth.expires_at,updated_at:new Date().toISOString()});
  if(dbErr)throw dbErr;
  // Importa un lote inicial: las futuras actividades llegarán por webhook.
  const list=await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=100",{headers:{Authorization:"Bearer "+auth.access_token}});
  if(list.ok){const activities=await list.json();for(const a of activities){await admin.from("strava_activities").upsert({user_id:record.data.user_id,strava_id:a.id,name:a.name,sport_type:a.sport_type||a.type,start_date:a.start_date,moving_time:a.moving_time,elapsed_time:a.elapsed_time,distance_m:a.distance,total_elevation_gain:a.total_elevation_gain,average_heartrate:a.average_heartrate,calories:a.calories??null,updated_at:new Date().toISOString()})}}
  return Response.redirect(site+"?strava=connected",302);
 }
 return json({error:"Método no permitido"},405);
}catch(e){console.error(e);return json({error:String(e)},500)}
});
