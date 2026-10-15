/* Dancing with SARS — original interface preserved. NASA/JPL live via Cloudflare Worker; Groq LLM chat. */
(()=>{
'use strict';
const $=id=>document.getElementById(id), A=window.LunarAstro;
const DEG=Math.PI/180;
const data=window.DANCING_DATA;
const WORKER='https://apikey.elias256.workers.dev';
const targets=data.targets;
const state={active:'SAR-001',layer:'cpr',view:'polar',zoom:2.5,source:'live',horizons:{source:'NASA/JPL Horizons',step_hours:1,sites:{}},hours:168,frame:0,analyses:[],error:'',loading:false,texture:'offline'};
const workerCache=new Map();let loadToken=0;
const timeSource=()=>state.source==='live'?'NASA/JPL LIVE':state.source==='horizons'?'JPL JSON · IMPORT':'MODELL / DEMO';
const nameById=id=>targets.find(t=>t.id===id);
const selected=()=>nameById(state.active)||targets[0];
const str=t=>String(t||'');
const numeric=s=>{const match=str(s).replace(',','.').match(/[-+]?\d+(?:\.\d+)?/);return match?Number(match[0]):NaN};
const pct=(value,total)=>value===null || !Number.isFinite(value)||!total?'N/A':`${Math.round(100*value/total)} %`;
const fmtDegrees=v=>v===null || !Number.isFinite(v)?'N/A':`${v>=0?'+':''}${v.toFixed(1)}°`;
const isoStart=()=>{const val=$('start-time').value;const d=new Date(val+':00Z');return Number.isFinite(d.getTime())?d:new Date('2026-11-14T00:00:00Z');};
const formatTime=d=>new Date(d).toLocaleString('de-DE',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+' UTC';
const image=new Image(),polarImg=new Image();
image.crossOrigin='anonymous';image.src='assets/moon_illustrative.jpg';polarImg.src='assets/south_pole_illustrative.jpg';
image.onload=()=>{renderMap();if(state.texture==='nasa')reprojectSouthPole();};polarImg.onload=()=>renderMap();
const moonSmall=new window.MoonGlobe($('canvas-3d'),image),moonLarge=new window.MoonGlobe($('moon-full-canvas'),image);
const dataForSite=t=>({id:t.id, name:t.name,lat:Number(t.lat),lon:Number(t.lng)});
function siteSeries(t){const d=A.hourlyTimes(isoStart().toISOString(),state.hours);return A.analyze(dataForSite(t),d,state.source==='demo'?null:state.horizons);}
function updateAnalysis(){state.analyses=targets.map(siteSeries);state.frame=Math.max(0,Math.min(state.frame,state.hours));$('time-scrubber').max=String(state.hours);$('time-scrubber').value=String(state.frame);renderTelemetry();renderAI();renderComparison();renderInstant();renderChart();renderMap();}
function currentResult(){return state.analyses.find(a=>a.site.id===state.active);}
function setTarget(id){if(!nameById(id))return;state.active=id;moonSmall.focus(selected().lat,selected().lng);moonLarge.focus(selected().lat,selected().lng);$('3d-status').textContent=`LOCKED: ${selected().name.toUpperCase()}`;updateAnalysis();if(state.source==='live')loadLiveSite(id);}
function renderTelemetry(){const t=selected();for(const [key,val] of Object.entries({'target-id':t.id,'val-name':t.name,'val-coords':`${Number(t.lat).toFixed(2)}°, ${Number(t.lng).toFixed(2)}°`,'val-ice':t.ice_score,'val-solar':t.illumination_pct,'val-slope':t.slope_deg,'val-thermal':t.thermal_k,'val-backscatter':t.backscatter_db,'val-clps':t.clps_suitability}))$(key).textContent=val||'N/A';$('telemetry-lat').textContent=`${Number(t.lat).toFixed(2)}°`;$('telemetry-lng').textContent=`${Number(t.lng).toFixed(2)}°`;}
function predictAI(target,result){
 if(!result||!result.complete||result.sunny===null||result.contact===null)return null;
 const slope=numeric(target.slope_deg),cold=numeric(target.thermal_k);
 const features=[slope,100*result.sunny/result.total,100*result.contact/result.total,cold];
 if(!features.every(Number.isFinite))return null;
 const m=window.DANCING_ML_MODEL;
 const terms=features.map((v,i)=>((v-m.means[i])/m.scales[i])*m.weights[i]);
 const z=terms.reduce((a,b)=>a+b,m.bias);
 const score=Math.round(100/(1+Math.exp(-Math.max(-30,Math.min(30,z)))));
 return {score,features,terms,source:state.source};
}
function aiResults(){return targets.map(t=>({site:t,estimate:predictAI(t,state.analyses.find(r=>r.site.id===t.id))})).filter(o=>o.estimate).sort((a,b)=>b.estimate.score-a.estimate.score);}
function renderAI(){const t=selected(),a=state.analyses.find(r=>r.site.id===t.id),ai=predictAI(t,a);
 $('ai-site').textContent=t.name;
 if(!ai){$('ai-score').innerHTML='N/A <small>/ 100</small>';$('ai-status').textContent='Keine vollständigen Winkelreihen – keine KI-Bewertung.';$('ai-bar').style.width='0%';$('ai-factors').textContent='';$('ai-recommendation').textContent='JPL-Zeitraum auf vorhandene Daten ändern oder Demo-Modell verwenden.';return;}
 $('ai-score').innerHTML=`${ai.score}<small> / 100</small>`;
 $('ai-status').textContent=ai.score>=70?'Demo-Modell: günstigeres Szenario':ai.score>=40?'Demo-Modell: gemischte Faktoren':'Demo-Modell: erhöhte Einschränkungen';
 $('ai-bar').style.width=`${ai.score}%`;
 const readoutLabel=state.source==='live'?'JPL LIVE':state.source==='horizons'?'JPL JSON':'Modell';const labels=['Hangneigung',`Sonne ↑ (${readoutLabel})`,`Erde ↑ (${readoutLabel})`,'Min. Temperatur'];const values=[`${ai.features[0].toFixed(1)}°`,`${ai.features[1].toFixed(0)} %`,`${ai.features[2].toFixed(0)} %`,`${ai.features[3].toFixed(0)} K`];
 const factor=$('ai-factors');factor.replaceChildren();
 labels.forEach((label,i)=>{const div=document.createElement('div');div.className='ai-factor';const impact=ai.terms[i]>=0?'positiv':'negativ';div.innerHTML=`<span></span><b></b><small></small>`;div.children[0].textContent=label;div.children[1].textContent=values[i];div.children[2].textContent=`ML-Beitrag: ${impact}`;div.children[2].style.color=ai.terms[i]>=0?'#82e6b1':'#e9b18d';factor.appendChild(div);});
 const best=aiResults()[0];$('ai-recommendation').textContent=best&&best.site.id!==t.id?`HÖCHSTER DEMO-ML-SCORE: ${best.site.name} (${best.estimate.score}/100). Nicht als Missionsentscheidung verwenden.`:'Dieser Ort führt aktuell das synthetische ML-Vergleichsmodell an.';
}
function renderComparison(){const tb=$('comparison-body');tb.replaceChildren();for(const r of state.analyses){const row=document.createElement('tr');row.setAttribute('role','button');row.tabIndex=0;row.className=r.site.id===state.active?'selected':'';const data=[r.site.name,pct(r.sunny,r.total),pct(r.contact,r.total),pct(r.both,r.total)];data.forEach((d,i)=>{const td=document.createElement('td');td.textContent=d;if(i)td.className='num';row.appendChild(td);});row.addEventListener('click',()=>setTarget(r.site.id));row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setTarget(r.site.id);}});tb.appendChild(row);}}
function renderInstant(){
 const r=currentResult();const item=r?.series[state.frame];const values=item?.data;
 $('epoch-display').textContent=item?formatTime(item.time):'N/A';
 $('sun-now').textContent=values?fmtDegrees(values.sun.el):'N/A';$('earth-now').textContent=values?fmtDegrees(values.earth.el):'N/A';
 $('top-mode').textContent=timeSource();$('data-badge').textContent=state.loading?'JPL LIVE · LÄDT ...':timeSource();
 $('source-note').textContent=state.source==='live'?(state.error?`LIVE FEHLER: ${state.error} – Keine Demo-Werte als JPL ausgegeben.`:`NASA/JPL Horizons (Az/El) per Worker · 1-h-Abtastung · keine Geländemaske. ${state.horizons?.sites?.[state.active]?'Echte JPL-Winkel für diesen Standort geladen.':'Noch keine JPL-Werte für diesen Standort (N/A).'} Weitere Standorte ohne Abruf: N/A.`):
  state.source==='horizons'?'Importiertes JPL-JSON: strukturell validiert, aber nicht unabhängig als NASA-Original überprüft. Fehlende Zeitwerte: N/A.':'SIMULATION / DEMO: periodische Näherung, nicht auf die reale Position für das angezeigte Datum kalibriert.';
}
function renderChart(){const canvas=$('chart');let w=Math.floor(canvas.getBoundingClientRect().width),h=Math.floor(canvas.getBoundingClientRect().height);if(w<10)return;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#07101c';ctx.fillRect(0,0,w,h);let r=currentResult();const L=29,R=8,T=15,B=18,plotW=w-L-R,plotH=h-T-B;
 for(const ang of [-90,-45,0,45,90]){const y=T+(90-ang)/180*plotH;ctx.lineWidth=ang===0?1.3:0.7;ctx.strokeStyle=ang===0?'#83b29d':'#1b3548';ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();ctx.fillStyle='#7e93a6';ctx.font='10px monospace';ctx.fillText(String(ang),2,y+4);}
 if(r){for(const [kind,color] of [['sun','#ffbd60'],['earth','#5bb7f3']]){ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=2;let pen=false;r.series.forEach((item,i)=>{if(!item.data){pen=false;return;}const x=L+plotW*i/state.hours,y=T+(90-item.data[kind].el)/180*plotH;if(!pen)ctx.moveTo(x,y);else ctx.lineTo(x,y);pen=true;});ctx.stroke();}}
 const xx=L+plotW*state.frame/state.hours;ctx.strokeStyle='#fff8';ctx.beginPath();ctx.moveTo(xx,T);ctx.lineTo(xx,h-B);ctx.stroke();ctx.fillStyle='#ffbd60';ctx.fillRect(L,T-9,8,3);ctx.fillStyle='#cde4ff';ctx.font='10px monospace';ctx.fillText('SONNE',L+12,T-4);ctx.fillStyle='#5bb7f3';ctx.fillRect(w-84,T-9,8,3);ctx.fillStyle='#cde4ff';ctx.fillText('ERDE',w-70,T-4);
 if(!r?.complete){ctx.fillStyle='#f0c187';ctx.fillText('N/A – importierte Werte unvollständig',L+10,T+35);}ctx.fillStyle='#7894a7';ctx.fillText('+0 h',L,h-3);ctx.fillText(`+${state.hours} h`,w-55,h-3);
}
const mapCanvas=$('moon-map');let ctx=mapCanvas.getContext('2d');
function dims(){const rect=mapCanvas.getBoundingClientRect();const dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height));if(mapCanvas.width!==w*dpr||mapCanvas.height!==h*dpr){mapCanvas.width=w*dpr;mapCanvas.height=h*dpr;}ctx.setTransform(dpr,0,0,dpr,0,0);return {w,h};}
function project(lat,lon,w,h){if(state.view==='global')return {x:(lon+180)/360*w,y:(90-lat)/180*h,visible:true};const R=Math.min(w,h)*.45,cx=w*.5,cy=h*.515;const r=((90+lat)/23)*R*state.zoom,a=lon*DEG;return {x:cx+Math.sin(a)*r,y:cy-Math.cos(a)*r,visible:r<=R+15};}
function drawShapes(coords,w,h,stroke,fill){if(!Array.isArray(coords)||coords.length<3)return;let ok=0;ctx.beginPath();coords.forEach(([lat,lon],i)=>{const {x,y,visible}=project(Number(lat),Number(lon),w,h);if(visible)ok++;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.closePath();if(!ok)return;ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.fill();ctx.stroke();}
function renderMap(){if(state.view==='globe')return;const {w,h}=dims(),R=Math.min(w,h)*.45;ctx.fillStyle='#02050a';ctx.fillRect(0,0,w,h);
 if(state.view==='polar'){
   ctx.save();ctx.beginPath();ctx.arc(w*.5,h*.515,R,0,Math.PI*2);ctx.clip();
   const baseSize=R*2*state.zoom;
   if(polarImg.complete&&polarImg.naturalWidth)ctx.drawImage(polarImg,w*.5-baseSize/2,h*.515-baseSize/2,baseSize,baseSize);else{ctx.fillStyle='#152234';ctx.fillRect(0,0,w,h);}
   ctx.strokeStyle='rgba(121,196,225,.16)';ctx.lineWidth=1;
   for(const deg of [2,4,6,8,10,12,16,20]){const radius=R*state.zoom*deg/23;if(radius>R)continue;ctx.beginPath();ctx.arc(w*.5,h*.515,radius,0,Math.PI*2);ctx.stroke();}
   for(let a=0;a<360;a+=30){const th=a*DEG;ctx.beginPath();ctx.moveTo(w*.5,h*.515);ctx.lineTo(w*.5+Math.sin(th)*R,h*.515-Math.cos(th)*R);ctx.stroke();}
   ctx.restore();ctx.strokeStyle='#2c607c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(w*.5,h*.515,R,0,Math.PI*2);ctx.stroke();
 }else{
   if(image.complete&&image.naturalWidth)ctx.drawImage(image,0,0,w,h);else{ctx.fillStyle='#243142';ctx.fillRect(0,0,w,h);}
   ctx.fillStyle='rgba(4,10,20,.18)';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#ffffff18';ctx.lineWidth=1;for(let x=0;x<=w;x+=w/12){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<=h;y+=h/6){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
 }
 if(state.layer==='cpr')data.psr_zones.forEach(zone=>drawShapes(zone.coordinates,w,h,'rgba(9,252,235,.87)','rgba(0,240,255,.19)'));
 if(state.layer==='roughness')data.hazard_zones.forEach(zone=>drawShapes(zone.coordinates,w,h,'rgba(255,51,102,.9)','rgba(255,51,102,.24)'));
 targets.forEach(t=>{const p=project(t.lat,t.lng,w,h);if(!p.visible)return;const active=t.id===state.active;ctx.save();ctx.shadowColor=active?'#5fffea':'#45aed1';ctx.shadowBlur=active?17:6;ctx.fillStyle=active?'#8cfff2':'#00f0ff';ctx.strokeStyle=active?'#fff':'#b6e3ff';ctx.lineWidth=active?3:1.5;ctx.beginPath();ctx.arc(p.x,p.y,active?8:6,0,2*Math.PI);ctx.fill();ctx.stroke();ctx.restore();if(active){ctx.font='bold 12px Consolas,monospace';ctx.textBaseline='middle';ctx.lineWidth=3;ctx.strokeStyle='#07111e';ctx.strokeText(t.name,p.x+13,p.y-11);ctx.fillStyle='#e7faff';ctx.fillText(t.name,p.x+13,p.y-11);}});
 ctx.fillStyle='#e0f4ff';ctx.font='11px monospace';if(state.view==='polar')ctx.fillText('SÜDPOL −90°',w*.5-R+12,h*.515-R+22);
}
function viewportToCoords(x,y,w,h){if(state.view==='global')return {lat:90-y/h*180,lon:x/w*360-180};const R=Math.min(w,h)*.45,dx=x-w*.5,dy=y-h*.515;return {lat:-90+Math.hypot(dx,dy)/R*23/state.zoom,lon:Math.atan2(dx,-dy)/DEG};}
mapCanvas.addEventListener('click',e=>{if(state.view==='globe')return;const rect=mapCanvas.getBoundingClientRect();const x=e.clientX-rect.left,y=e.clientY-rect.top;let best=null,dist=Infinity;for(const t of targets){const p=project(t.lat,t.lng,rect.width,rect.height);if(!p.visible)continue;const distance=Math.hypot(x-p.x,y-p.y);if(distance<dist){best=t;dist=distance;}}if(best&&dist<22)setTarget(best.id);});
mapCanvas.addEventListener('mousemove',e=>{if(state.view==='globe')return;const rect=mapCanvas.getBoundingClientRect();const c=viewportToCoords(e.clientX-rect.left,e.clientY-rect.top,rect.width,rect.height);if(c.lat>=-90&&c.lat<=90){$('telemetry-lat').textContent=`${c.lat.toFixed(2)}°`;$('telemetry-lng').textContent=`${c.lon.toFixed(2)}°`;}});
mapCanvas.addEventListener('mouseleave',()=>{const t=selected();$('telemetry-lat').textContent=`${t.lat.toFixed(2)}°`;$('telemetry-lng').textContent=`${t.lng.toFixed(2)}°`;});
mapCanvas.addEventListener('wheel',e=>{if(state.view!=='polar')return;e.preventDefault();state.zoom=Math.min(5,Math.max(.75,state.zoom+(e.deltaY<0?.25:-.25)));renderMap();},{passive:false});
function setView(view){state.view=view;document.querySelectorAll('.moon-mode').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const globe=view==='globe';$('moon-map').classList.toggle('hidden',globe);$('moon-full-canvas').classList.toggle('hidden',!globe);$('map-zoom-in').classList.toggle('hidden',globe);$('map-zoom-out').classList.toggle('hidden',globe);$('map-caption').textContent=globe?'3D MOND · ZIEHEN ZUM DREHEN · NASA LRO / FALLBACK':view==='polar'?'SÜDPOL / LRO-BILDMOSAIK · PSR-ZONEN = DEMO':'GANZER MOND / LRO WAC · ZIELPUNKTE = PROTOTYP';if(globe)requestAnimationFrame(()=>moonLarge.resize());else renderMap();}
document.querySelectorAll('.moon-mode').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
document.querySelectorAll('.layer-btn').forEach(button=>button.addEventListener('click',()=>{state.layer=button.dataset.layer;document.querySelectorAll('.layer-btn').forEach(x=>x.classList.toggle('active',x===button));renderMap();}));
$('map-zoom-in').addEventListener('click',()=>{state.zoom=Math.min(5,state.zoom+.4);renderMap()});$('map-zoom-out').addEventListener('click',()=>{state.zoom=Math.max(.75,state.zoom-.4);renderMap()});
$('time-scrubber').addEventListener('input',e=>{state.frame=Number(e.target.value);renderInstant();renderChart()});
$('duration').addEventListener('change',e=>{state.hours=Number(e.target.value);state.frame=0;resetLiveRange();});$('start-time').addEventListener('change',()=>{state.frame=0;resetLiveRange();});
function exportCSV(){const r=currentResult();if(!r)return;const escape=v=>'"'+String(v??'N/A').replaceAll('"','""')+'"';const rows=[['time_utc','site','source','sun_az_deg','sun_elev_deg','earth_az_deg','earth_elev_deg'],...r.series.map(x=>[x.time.toISOString(),r.site.name,timeSource(),x.data?.sun.az,x.data?.sun.el,x.data?.earth.az,x.data?.earth.el])];const csv='\ufeff'+rows.map(row=>row.map(escape).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`dancing-with-sars_${r.site.id}_${state.source}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-csv').addEventListener('click',exportCSV);
$('import-btn').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const payload=JSON.parse(await file.text());A.validateEphemeris(payload);loadToken++;state.horizons=payload;state.source='horizons';state.error='';updateAnalysis();alert('Horizons-formatierte JSON importiert (Herkunft nicht verifiziert).');}catch(err){alert('JSON konnte nicht importiert werden: '+err.message);}finally{e.target.value='';}});
function resetLiveRange(){loadToken++;state.horizons={source:'NASA/JPL Horizons',step_hours:1,sites:{}};state.error='';updateAnalysis();if(state.source==='live')loadLiveSite(state.active);}
const rangeKey=(id)=>`${id}|${isoStart().toISOString().slice(0,16)}|${state.hours}`;
async function loadLiveSite(id,{force=false}={}){
 if(state.source!=='live')return;
 const key=rangeKey(id),token=loadToken;
 if(state.horizons.sites[id]&&!force)return;
 if(workerCache.has(key)&&!force){state.horizons.sites[id]=workerCache.get(key);updateAnalysis();return;}
 state.loading=true;state.error='';renderInstant();
 try{
   const api=new URL(`${WORKER}/ephemeris`);api.searchParams.set('site',id);api.searchParams.set('start',isoStart().toISOString().slice(0,16));api.searchParams.set('hours',String(state.hours));
   const resp=await fetch(api.toString(),{mode:'cors',signal:AbortSignal.timeout(48000)});
   const payload=await resp.json();if(!resp.ok)throw Error(payload.error||`HTTP ${resp.status}`);
   const validated=A.validateEphemeris(payload);
   if(!validated.sites[id])throw Error('Standort fehlt in JPL-Antwort');
   if(token!==loadToken||state.source!=='live')return;
   workerCache.set(key,validated.sites[id]);state.horizons.sites[id]=validated.sites[id];state.error='';
 }catch(e){if(token===loadToken&&state.source==='live'){
     const transport=e.name==='TypeError'||/Load failed|Failed to fetch|NetworkError/i.test(e.message||'');
     state.error=transport?'Worker-Netzwerk/CORS nicht erreichbar. Unter „Worker / NASA / KI Status“ prüfen (Origin, Deployment, file://).':(e.message||'API nicht erreichbar');
     if(transport&&window.DancingWorkerDiagnostics)window.DancingWorkerDiagnostics.check();
   }}
 finally{if(token===loadToken){state.loading=false;updateAnalysis();}}
}
async function loadAllSites(){for(const t of targets){if(state.source!=='live')break;await loadLiveSite(t.id);}}
$('load-nasa').addEventListener('click',()=>{if(state.source!=='live'){state.source='live';resetLiveRange();}else loadLiveSite(state.active,{force:true});});
$('load-all-nasa').addEventListener('click',()=>{if(state.source!=='live'){state.source='live';resetLiveRange();}loadAllSites();});
$('demo-mode').addEventListener('click',()=>{loadToken++;state.loading=false;state.error='';state.source='demo';updateAnalysis();});
function reprojectSouthPole(){
 try{
   const src=document.createElement('canvas');src.width=image.naturalWidth;src.height=image.naturalHeight;
   const context=src.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
   const pixels=context.getImageData(0,0,src.width,src.height).data;
   const n=800,out=document.createElement('canvas');out.width=out.height=n;const o=out.getContext('2d');const dest=o.createImageData(n,n);
   const b=dest.data;const cx=n/2,cy=n/2,rad=n/2;
   for(let y=0;y<n;y++)for(let x=0;x<n;x++){
     const dx=x-cx,dy=y-cy,rr=Math.hypot(dx,dy)/rad;if(rr>1)continue;
     const lat=-90+rr*23,lon=Math.atan2(dx,-dy)/DEG;
     const sx=Math.max(0,Math.min(src.width-1,Math.round((lon+180)/360*(src.width-1))));
     const sy=Math.max(0,Math.min(src.height-1,Math.round((90-lat)/180*(src.height-1))));
     const si=(sy*src.width+sx)*4,di=(y*n+x)*4;
     b[di]=pixels[si];b[di+1]=pixels[si+1];b[di+2]=pixels[si+2];b[di+3]=255;
   }
   o.putImageData(dest,0,0);polarImg.src=out.toDataURL('image/jpeg',.92);
 }catch(e){console.warn('NASA-Textur konnte nicht reprojiziert werden',e);$('texture-note').textContent='LRO-Mosaik geladen, Südpol-Reprojektion fehlgeschlagen; Fallback-Karte.';}
}
async function loadNASAtexture(){
 const realImage=new Image();realImage.crossOrigin='anonymous';
 realImage.onload=()=>{state.texture='nasa';image.src=realImage.src;$('texture-note').textContent='Echte NASA LRO WAC-Mondtextur (SVS 4720), für Visualisierung aufbereitet. Südpol wird lokal aus dem Mosaik reprojiziert; keine quantitative SAR-Karte.';renderMap();};
 realImage.onerror=()=>{$('texture-note').textContent='NASA-Bild derzeit nicht erreichbar. Offline: illustrative Ersatztextur (keine NASA-Aufnahme).';};
 realImage.src=`${WORKER}/texture`;
}
function toggleBriefing(show){$('briefing-modal').classList.toggle('active',show);if(show)$('briefing-close').focus();}
$('briefing-open').addEventListener('click',()=>toggleBriefing(true));$('briefing-close').addEventListener('click',()=>toggleBriefing(false));$('briefing-modal').addEventListener('click',e=>{if(e.target===$('briefing-modal'))toggleBriefing(false)});document.addEventListener('keydown',e=>{if(e.key==='Escape')toggleBriefing(false)});
window.addEventListener('resize',()=>{renderMap();renderChart();moonSmall.resize();if(state.view==='globe')moonLarge.resize()});
setTarget('SAR-001');loadNASAtexture();
window.DancingApp={state,setTarget,updateAnalysis,predictAI,renderMap,loadLiveSite}; // debug/test-only stable interface
})();
