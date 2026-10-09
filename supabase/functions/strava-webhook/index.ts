import { createClient } from "npm:@supabase/supabase-js@2";
const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const secret=Deno.env.get("STRAVA_CLIENT_SECRET")!;
const id=Deno.env.get("STRAVA_CLIENT_ID")!;
Deno.serve(async req=>{
 try{
  if(req.method==="GET"){
   const u=new URL(req.url);
   if(u.searchParams.get("hub.mode")==="subscribe"&&u.searchParams.get("hub.verify_token")===Deno.env.get("STRAVA_VERIFY_TOKEN"))
    return Response.json({"hub.challenge":u.searchParams.get("hub.challenge")});
   return new Response("Invalid verification token",{status:403});
  }
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  const event=await req.json();
  if(event.object_type!=="activity")return Response.json({ok:true});
  const {data:c}=await admin.from("strava_connections").select("*").eq("athlete_id",event.owner_id).maybeSingle();
  if(!c)return Response.json({ok:true});
  if(event.aspect_type==="delete"){await admin.from("strava_activities").delete().eq("user_id",c.user_id).eq("strava_id",event.object_id);return Response.json({ok:true})}
  let token=c.access_token;
  if(c.expires_at<Math.floor(Date.now()/1000)+120){
   const refresh=await fetch("https://www.strava.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:id,client_secret:secret,grant_type:"refresh_token",refresh_token:c.refresh_token})});
   if(!refresh.ok)throw Error("Token refresh failed");
   const t=await refresh.json();token=t.access_token;
   await admin.from("strava_connections").update({access_token:t.access_token,refresh_token:t.refresh_token,expires_at:t.expires_at}).eq("user_id",c.user_id);
  }
  const r=await fetch("https://www.strava.com/api/v3/activities/"+encodeURIComponent(event.object_id),{headers:{Authorization:"Bearer "+token}});
  if(r.status===404)return Response.json({ok:true});
  if(!r.ok)throw Error("Strava activity fetch: "+r.status);
  const a=await r.json();
  const {error}=await admin.from("strava_activities").upsert({user_id:c.user_id,strava_id:a.id,name:a.name,sport_type:a.sport_type||a.type,start_date:a.start_date,moving_time:a.moving_time,elapsed_time:a.elapsed_time,distance_m:a.distance,total_elevation_gain:a.total_elevation_gain,average_heartrate:a.average_heartrate,calories:a.calories??null,updated_at:new Date().toISOString()});
  if(error)throw error;
  return Response.json({ok:true});
 }catch(e){console.error(e);return Response.json({error:"Webhook processing failed"},{status:500})}
});
