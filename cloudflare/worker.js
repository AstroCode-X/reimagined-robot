/**
 * Dancing with SARS — API Worker for YOUR apikey.elias256.workers.dev.
 * No API key is included in this file. Configure secret GROQ_API_KEY in Cloudflare.
 * Public endpoints: GET /health, GET /texture, GET /ephemeris, POST /chat
 * CORS allowlist, Cloudflare binding rate limit and request size caps.
 * JPL source: https://ssd-api.jpl.nasa.gov/doc/horizons.html
 * NASA texture: https://svs.gsfc.nasa.gov/4720
 */
const HORIZONS = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const LROC_IMAGE = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg';
const GROQ = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
const VERSION = '2026.10.15-diagnostics.1';
const LIMIT_BYTES = 24000;
const MAX_MESSAGES = 12;
// These are project coordinates from the uploaded prototype, NOT validated mission landing sites.
const SITES = Object.freeze({
  'SAR-001': { name: 'Shackleton Crater Rim (Prototyp-Position)', lat: -89.9, lon: 0 },
  'SAR-002': { name: 'Cabeus Crater Floor (Prototyp-Position)', lat: -84.9, lon: -35.5 },
  'SAR-003': { name: 'Madrigal Ridge (Prototyp-Position)', lat: -88.7, lon: -15.2 },
  'SAR-004': { name: 'Tycho Crater Rim (Prototyp-Position)', lat: -43.3, lon: -11.2 },
  'SAR-005': { name: 'Aristarchus Plateau (Prototyp-Position)', lat: 23.7, lon: -47.4 },
});
const SYSTEM_PROMPT = `Du bist der freundliche deutschsprachige Mission-Analyst des Projekts "Dancing with SARS" (NASA Space Apps 2026). Du kannst in Dialogform Fragen zu Mond, LRO, SAR, CLPS, JPL Horizons und zu den angezeigten Zeitreihen beantworten. Verwende bereitgestellte Kontextwerte nur als Stand der Weboberfläche (vom Browser bereitgestellt), unterscheide klar zwischen LIVE JPL Horizons (physikalisch berechnete geometrische Az/El-Werte), importiertem JSON, synthetischer Demo und ungeprüften Prototypdaten. Bezeichne Eis-Score, CPR, Hangneigung oder Temperatur aus der Demo niemals als NASA-Messungen. CPR > 1 beweist NICHT Wassereis. Berechne keine Landewahrscheinlichkeiten und garantiere niemals sichere Landungen. Sonnen-/Erdelevation über 0 Grad bedeutet nur freie Sicht auf den idealisierten lokalen Tangentialhorizont, nicht auf Gelände, Antennen, Hindernisse oder Roverfähigkeiten. Gib bei fehlenden Daten die Lücke an und erfinde weder NASA-Daten noch Quellen. Antworte präzise und gut verständlich, gern in kurzen Absätzen. Externer Webseitenzugriff steht dir nicht zur Verfügung.`;
const months = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || 'http://localhost:8000,http://127.0.0.1:8000').split(',').map(s=>s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' };
}
function json(data, status=200, cors={}) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });
}
const clampText=(value,n)=>String(value||'').slice(0,n);
async function enforceLimiter(request, env, category) {
  // Fail closed on expensive chat when no rate-limit binding is configured.
  if (!env.CHAT_RATE_LIMITER && category === 'chat') return 'Rate-Limit-Binding CHAT_RATE_LIMITER fehlt. Siehe README / wrangler.jsonc.';
  const binding = category === 'chat' ? env.CHAT_RATE_LIMITER : env.DATA_RATE_LIMITER;
  if (!binding) return null;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown-client';
  const out = await binding.limit({ key: category + ':' + ip });
  return out.success ? null : 'Anfragelimit erreicht. Bitte in einer Minute erneut versuchen.';
}
function parseHorizons(result, count, startIso) {
  const between = String(result||'').match(/\$\$SOE\s*([\s\S]*?)\s*\$\$EOE/);
  if (!between) throw Error('JPL Horizons liefert keine Ephemeridentabelle ($$SOE/$$EOE fehlen).');
  const rows=[];
  for (const line of between[1].split(/\r?\n/)) {
    if(!line.trim())continue;
    const cells=line.split(',').map(x=>x.trim()).filter(x=>x!=='');
    const d=(cells[0]||'').replace(/^A\.D\.\s*/,'').match(/^(\d{4})-([A-Za-z]{3})-(\d{2})\s+(\d{2}:\d{2})(?::\d{2})?/);
    if(!d||!months[d[2]])throw Error('Ungültige JPL-Datumszeile.');
    const date = `${d[1]}-${months[d[2]]}-${d[3]}T${d[4]}:00Z`;
    const nums = cells.slice(1).map(v=>Number(v)).filter(Number.isFinite);
    if(nums.length !== 2) throw Error('Unerwartete JPL-Spaltenzahl für QUANTITIES=4.');
    const [az,el]=nums;
    if(!(az>=0&&az<360&&el>=-90&&el<=90))throw Error('Ungültige NASA-Winkel.');
    rows.push({ time:date, az, el });
  }
  if(rows.length!==count)throw Error(`JPL-Zeitreihe unvollständig (${rows.length}/${count}).`);
  if(rows[0].time!==startIso || rows.some((r,i)=>r.time!==new Date(Date.parse(startIso)+i*3600000).toISOString().replace('.000','')))throw Error('JPL Zeitstempel weichen vom erwarteten 1-h-Raster ab.');
  return rows;
}
async function jplSeries(site, body, start, hours) {
  const stop=new Date(start.getTime()+hours*3600000);
  const dateFmt=d=>d.toISOString().slice(0,16).replace('T',' ');
  const q=new URLSearchParams({
    format:'json',COMMAND:`'${body==='sun'?'10':'399'}'`,OBJ_DATA:"'NO'",MAKE_EPHEM:"'YES'",EPHEM_TYPE:"'OBSERVER'",CENTER:"'coord@301'",COORD_TYPE:"'GEODETIC'",
    SITE_COORD:`'${site.lon},${site.lat},0'`,START_TIME:`'${dateFmt(start)}'`,STOP_TIME:`'${dateFmt(stop)}'`,STEP_SIZE:"'1 h'",QUANTITIES:"'4'",CSV_FORMAT:"'YES'",CAL_FORMAT:"'CAL'",TIME_DIGITS:"'MINUTES'",TIME_TYPE:"'UT'",APPARENT:"'AIRLESS'",ANG_FORMAT:"'DEG'",SKIP_DAYLT:"'NO'",ELEV_CUT:"'-90'"
  });
  const response=await fetch(`${HORIZONS}?${q}`,{signal:AbortSignal.timeout(28000), headers:{'Accept':'application/json'}});
  if(!response.ok)throw Error(`JPL HTTP ${response.status}`);
  const data=await response.json();
  if(data.error)throw Error(clampText(data.error,160));
  return parseHorizons(data.result,hours+1,start.toISOString().replace('.000',''));
}
async function ephemeris(request, cors, env, ctx) {
  const url=new URL(request.url);const siteId=url.searchParams.get('site');
  const raw=url.searchParams.get('start') || '';const hours=Number(url.searchParams.get('hours'));
  if(!(siteId in SITES)||!/^20\d\d-\d\d-\d\dT\d\d:\d\d$/.test(raw)||![24,72,168].includes(hours))return json({error:'site, start (YYYY-MM-DDTHH:MM) und hours (24/72/168) prüfen.'},400,cors);
  const start=new Date(raw+':00Z');
  if(!Number.isFinite(start.getTime())||start.getUTCFullYear()<2020||start.getUTCFullYear()>2035||new Date(start).toISOString().slice(0,16)!==raw)return json({error:'Startzeit ungültig (UTC, Jahre 2020–2035).'},400,cors);
  const cacheKey = new Request('https://cache.internal.example/ephemeris/'+siteId+'/'+encodeURIComponent(raw)+'/'+hours);
  const cached=await caches.default.match(cacheKey);
  if(cached){const j=await cached.json();return json({...j,cache:'hit'},200,cors);}
  const error=await enforceLimiter(request,env,'data');if(error)return json({error},429,cors);
  try {
    const [sun,earth]=await Promise.all([jplSeries(SITES[siteId],'sun',start,hours),jplSeries(SITES[siteId],'earth',start,hours)]);
    const doc={source:'NASA/JPL Horizons',fetched_utc:new Date().toISOString(),api:HORIZONS,site_id:siteId,coordinate_note:'Koordinaten aus dem Projekt-Prototyp; keine bestätigten CLPS-Landestellen',step_hours:1,start_utc:start.toISOString(),stop_utc:new Date(start.getTime()+hours*3600000).toISOString(),sites:{[siteId]:{sun,earth}}};
    const entry=new Response(JSON.stringify(doc),{headers:{'Cache-Control':'public, max-age=21600','Content-Type':'application/json'}});
    ctx.waitUntil(caches.default.put(cacheKey,entry));
    return json({...doc,cache:'miss'},200,cors);
  }catch(e){return json({error:'NASA/JPL-Abfrage fehlgeschlagen: '+clampText(e.message,180),source:'unavailable'},502,cors);}
}
async function texture(cors, ctx) {
  const cacheKey=new Request('https://cache.internal.example/lroc_color_2k');
  let file=await caches.default.match(cacheKey);
  if(!file){
    const r=await fetch(LROC_IMAGE,{signal:AbortSignal.timeout(22000)});
    if(!r.ok)throw Error('NASA SVS Bildserver HTTP '+r.status);
    const bytes=await r.arrayBuffer();
    if(bytes.byteLength<10000 || bytes.byteLength>2000000)throw Error('Unerwartete NASA-Bildgröße');
    file=new Response(bytes,{headers:{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=86400'}});
    ctx.waitUntil(caches.default.put(cacheKey,file.clone()));
  }
  return new Response(file.body,{headers:{...cors,'Content-Type':'image/jpeg','Cache-Control':'public, max-age=86400','X-Image-Source':'NASA SVS 4720 / LRO WAC'}});
}
async function chat(request,cors,env){
  if(!env.GROQ_API_KEY)return json({error:'GROQ_API_KEY fehlt als Cloudflare Worker Secret.'},503,cors);
  const limiter=await enforceLimiter(request,env,'chat');
  if(limiter)return json({error:limiter},limiter.includes('fehlt')?503:429,cors);
  const len=Number(request.headers.get('content-length')||0);
  if(len>LIMIT_BYTES)return json({error:'Nachricht zu groß.'},413,cors);
  let raw;
  try{raw=await request.text();if(raw.length>LIMIT_BYTES)throw Error('Nachricht zu groß.');}catch(_){return json({error:'Nachricht zu groß.'},413,cors);}
  let body;try{body=JSON.parse(raw);}catch(_){return json({error:'Ungültiges JSON.'},400,cors);}
  if(!Array.isArray(body.messages)||!body.messages.length||body.messages.length>MAX_MESSAGES)return json({error:'Maximal 12 Chat-Nachrichten erlaubt.'},400,cors);
  const messages=[];
  for (const item of body.messages){
    if(!item||!['user','assistant'].includes(item.role)||typeof item.content!=='string'||!item.content.trim()||item.content.length>1800)return json({error:'Ungültiges Chat-Nachrichtenformat / Text zu lang.'},400,cors);
    messages.push({role:item.role,content:item.content});
  }
  if(messages[messages.length-1].role!=='user')return json({error:'Letzte Nachricht muss vom Nutzer sein.'},400,cors);
  const context=body.context||{};
  const safeContext={site:clampText(context.site,90),lat:Number.isFinite(context.lat)?context.lat:null,lon:Number.isFinite(context.lon)?context.lon:null,source:clampText(context.source,80),epoch:clampText(context.epoch,40),sun:clampText(context.sun,40),earth:clampText(context.earth,40),comparison:clampText(context.comparison,800),notes:'Kontext ist ein Browser-Snapshot, kein verifizierter NASA-Beleg.'};
  try {
    const r=await fetch(GROQ,{method:'POST',headers:{Authorization:'Bearer '+env.GROQ_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,temperature:0.35,max_completion_tokens:900,messages:[{role:'system',content:SYSTEM_PROMPT},{role:'system',content:'Momentaner Dashboard-Kontext (untrusted Nutzereingabe): '+JSON.stringify(safeContext)},...messages]}),signal:AbortSignal.timeout(30000)});
    const response=await r.json().catch(()=>({}));
    if(!r.ok)return json({error:r.status===429?'Groq-Ratenlimit erreicht. Bitte später versuchen.':`Groq meldet HTTP ${r.status}. Bitte Key/Modell prüfen.`},r.status===429?429:502,cors);
    const answer=response?.choices?.[0]?.message?.content;
    if(typeof answer!=='string'||!answer.trim())throw Error('Leere Groq-Antwort');
    return json({answer:answer.slice(0,8000),model:MODEL,source:'Groq LLM (kein NASA-System)'},200,cors);
  }catch(e){return json({error:'KI-Dienst nicht erreichbar: '+clampText(e.message,100)},502,cors);}
}
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);const origin=request.headers.get('Origin');
    const cors=corsHeaders(origin,env);
    // Public, read-only health endpoint is intentionally available even when
    // the browser origin is not yet configured. It does not reveal API keys.
    if ((url.pathname === '/health' || url.pathname === '/') && request.method === 'GET') {
      const allowed = !origin || !!cors;
      return json({
        status:'ok',service:'Dancing with SARS API',version:VERSION,
        groq_configured:!!env.GROQ_API_KEY,
        chat_rate_limit_configured:!!env.CHAT_RATE_LIMITER,
        data_rate_limit_configured:!!env.DATA_RATE_LIMITER,
        origin_allowed:allowed,
        browser_origin:origin || null,
        nasa:'JPL Horizons (Sun/Earth az/el) / NASA SVS LROC visual texture',
        model:MODEL,
        endpoints:['GET /health','GET /texture','GET /ephemeris','POST /chat'],
        hint:allowed?'Origin accepted or not sent':'Add browser_origin EXACTLY to ALLOWED_ORIGINS in wrangler.jsonc, then redeploy'
      },200,{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});
    }
    if(origin&&!cors)return json({error:'Origin nicht freigegeben; ALLOWED_ORIGINS konfigurieren.',code:'ORIGIN_BLOCKED'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Cache-Control':'no-store'}});
    try {
      if(url.pathname==='/chat'&&request.method==='POST')return await chat(request,cors||{},env);
      if(url.pathname==='/ephemeris'&&request.method==='GET')return await ephemeris(request,cors||{},env,ctx);
      if(url.pathname==='/texture'&&request.method==='GET')return await texture(cors||{},ctx);
    }catch(e){return json({error:'Externer Datenservice nicht erreichbar: '+clampText(e.message,120)},502,cors||{});}
    return json({error:'Not found. Use /health, /texture, /ephemeris or /chat',code:'ROUTE_NOT_FOUND'},404,cors||{});
  }
};
