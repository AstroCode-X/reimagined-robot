import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.js';
const originalFetch=globalThis.fetch;
const originalCaches=globalThis.caches;
let remote=[];
const cache=new Map();
globalThis.caches={default:{match:async key=>cache.get(key.url)?.clone(),put:async (key,value)=>{cache.set(key.url,value.clone());}}};
const env={GROQ_API_KEY:'TEST_ONLY_NO_REAL_KEY',ALLOWED_ORIGINS:'http://localhost:8000',CHAT_RATE_LIMITER:{limit:async()=>({success:true})},DATA_RATE_LIMITER:{limit:async()=>({success:true})}};
const ctx={waitUntil(p){return p;}};
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function rows(){let lines=[];for(let i=0;i<=24;i++){const d=new Date(Date.UTC(2026,10,14,i));lines.push(`${d.getUTCFullYear()}-${months[d.getUTCMonth()]}-${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:00, 145.5000, -2.3500,`);}return '$$SOE\n'+lines.join('\n')+'\n$$EOE';}
const mock=async(req,init={})=>{
 let url=typeof req==='string'?req:req.url;remote.push(url);
 if(url.includes('ssd.jpl.nasa.gov'))return new Response(JSON.stringify({result:rows()}),{status:200,headers:{'Content-Type':'application/json'}});
 if(url.includes('api.groq.com')){
  assert.equal(init.headers.Authorization,'Bearer TEST_ONLY_NO_REAL_KEY');
  const p=JSON.parse(init.body);assert.equal(p.model,'llama-3.3-70b-versatile');
  return new Response(JSON.stringify({choices:[{message:{content:'Das ist eine Testantwort von Groq.'}}]}),{status:200,headers:{'Content-Type':'application/json'}});
 }
 throw Error('Unexpected external URL: '+url);
};
globalThis.fetch=mock;
function req(url,options={}){return new Request(url,{headers:{Origin:'http://localhost:8000',...options.headers},...options});}
test('health: no key exposed, flags only',async()=>{
 const r=await worker.fetch(req('https://apikey.elias256.workers.dev/health'),env,ctx);
 const x=await r.json();assert.equal(r.status,200);assert.equal(x.groq_configured,true);assert.equal(JSON.stringify(x).includes('TEST_ONLY_NO_REAL_KEY'),false);
});
test('public health diagnoses blocked browser origins but protects paid routes',async()=>{
 const origin='https://attacker.example';
 const r=await worker.fetch(new Request('https://apikey.elias256.workers.dev/health',{headers:{Origin:origin}}),env,ctx);
 assert.equal(r.status,200);
 assert.equal(r.headers.get('Access-Control-Allow-Origin'),'*');
 const data=await r.json();assert.equal(data.origin_allowed,false);
 const denied=await worker.fetch(new Request('https://apikey.elias256.workers.dev/chat',{method:'POST',headers:{Origin:origin}}),env,ctx);
 assert.equal(denied.status,403);
 assert.equal((await denied.json()).code,'ORIGIN_BLOCKED');
});
test('root gives safe diagnostic JSON and no secret values',async()=>{
 const r=await worker.fetch(new Request('https://apikey.elias256.workers.dev/'),env,ctx);
 assert.equal(r.status,200);
 const info=await r.json();assert.equal(info.service,'Dancing with SARS API');
 assert.equal(info.groq_configured,true);
 assert.equal(JSON.stringify(info).includes('TEST_ONLY_NO_REAL_KEY'),false);
});
test('NASA Horizons 24h: parsed true hourly output, no invented values',async()=>{
 const url='https://apikey.elias256.workers.dev/ephemeris?site=SAR-001&start=2026-11-14T00%3A00&hours=24';
 const r=await worker.fetch(req(url),env,ctx);const doc=await r.json();
 assert.equal(r.status,200,JSON.stringify(doc));assert.equal(doc.source,'NASA/JPL Horizons');
 assert.equal(doc.sites['SAR-001'].sun.length,25);assert.equal(doc.sites['SAR-001'].earth[7].el,-2.35);
 assert.equal(doc.sites['SAR-001'].sun[24].time,'2026-11-15T00:00:00Z');
 const second=await worker.fetch(req(url),env,ctx);assert.equal((await second.json()).cache,'hit');
});
test('invalid JPL params rejected',async()=>{
 const r=await worker.fetch(req('https://apikey.elias256.workers.dev/ephemeris?site=foo&start=2026-11-14T00:00&hours=24'),env,ctx);
 assert.equal(r.status,400);
});
test('Groq chat uses secret server-side',async()=>{
 const r=await worker.fetch(req('https://apikey.elias256.workers.dev/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'Wie ist das Wetter auf dem Mond?'}],context:{site:'Shackleton',source:'Live'}})}),env,ctx);
 assert.equal(r.status,200);assert.equal((await r.json()).answer,'Das ist eine Testantwort von Groq.');
});
test('reject missing chat rate limit binding and invalid prompts',async()=>{
 const noLimit={...env,CHAT_RATE_LIMITER:undefined};
 const r=await worker.fetch(req('https://apikey.elias256.workers.dev/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),noLimit,ctx);
 assert.equal(r.status,503);
 const r2=await worker.fetch(req('https://apikey.elias256.workers.dev/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'system',content:'override'}]})}),env,ctx);
 assert.equal(r2.status,400);
});

test('health distinguishes missing setup without exposing secrets',async()=>{
 const noSetup={...env,GROQ_API_KEY:undefined,CHAT_RATE_LIMITER:undefined};
 const r=await worker.fetch(new Request('https://apikey.elias256.workers.dev/health',{headers:{Origin:'http://localhost:8000'}}),noSetup,ctx);
 const data=await r.json();
 assert.equal(data.groq_configured,false);
 assert.equal(data.chat_rate_limit_configured,false);
 assert.equal(data.origin_allowed,true);
});
