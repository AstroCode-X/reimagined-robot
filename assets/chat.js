/* Groq LLM chat — the API key is NEVER stored in this browser code. */
(()=>{
 'use strict';const $=id=>document.getElementById(id);
 const API='https://apikey.elias256.workers.dev/chat';
 const messages=[];let sending=false;
 function add(role,text){const div=document.createElement('div');div.className='chat-message '+role;div.textContent=text;$('chat-messages').appendChild(div);$('chat-messages').scrollTop=$('chat-messages').scrollHeight;return div;}
 function open(){ $('chat-drawer').classList.remove('hidden');$('chat-input').focus(); }
 function close(){ $('chat-drawer').classList.add('hidden'); }
 $('chat-open').addEventListener('click',open);$('ai-open-chat').addEventListener('click',open);$('chat-close').addEventListener('click',close);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('chat-drawer').classList.contains('hidden'))close();});
 document.querySelectorAll('[data-question]').forEach(b=>b.addEventListener('click',()=>{open();$('chat-input').value=b.dataset.question;$('chat-input').focus();}));
 $('chat-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chat-form').requestSubmit();}});
 const truncated=s=>String(s||'').slice(0,800);
 function context(){
   const a=window.DancingApp,st=a?.state||{};
   const s=(window.DANCING_DATA?.targets||[]).find(x=>x.id===st.active)||{};
   const src=st.source==='live'?'NASA/JPL live via Worker':st.source==='horizons'?'manuell importiert (nicht verifiziert)':'synthetische Demo';
   const comparison=(st.analyses||[]).map(o=>`${o.site.name}: Sonne ${o.sunny===null?'N/A':Math.round(100*o.sunny/o.total)+'%'}, Erde ${o.contact===null?'N/A':Math.round(100*o.contact/o.total)+'%'}`).join('; ');
   return {site:truncated(s.name),lat:s.lat,lon:s.lng,source:src,epoch:truncated($('epoch-display').textContent),sun:truncated($('sun-now').textContent),earth:truncated($('earth-now').textContent),comparison:truncated(comparison)};
 }
 $('chat-form').addEventListener('submit',async e=>{
   e.preventDefault();if(sending)return;
   const text=$('chat-input').value.trim();if(!text)return;
   $('chat-input').value='';add('user',text);messages.push({role:'user',content:text});
   const payload={messages:messages.slice(-12),context:context()};
   sending=true;$('chat-send').disabled=true;$('chat-status').textContent='Groq antwortet ...';const bubble=add('assistant','Antwort wird geladen ...');
   try{
     const reply=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(35000)});
     const raw=await reply.text();let data;try{data=JSON.parse(raw);}catch(_){throw Error('Worker antwortet nicht mit JSON (HTTP '+reply.status+'). Eventuell ist ein anderer Worker deployed.');}
     if(!reply.ok)throw Error(data.error||`HTTP ${reply.status}`);
     bubble.textContent=data.answer;messages.push({role:'assistant',content:data.answer.slice(0,1800)});
     $('chat-status').textContent='● Groq Llama 3.3 · via Cloudflare Worker';
   }catch(err){
     let hint='Prüfe die Verbindung im Bereich „Worker / NASA / KI Status“.';
     const transport=err.name==='TypeError'||/Load failed|Failed to fetch|NetworkError/i.test(err.message);
     if(location.protocol==='file:')hint='Die App wurde per file:// geöffnet. Starte einen lokalen Server (python -m http.server 8000) oder Cloudflare Pages.';
     else if(transport){
       hint='Netzwerk-/CORS-Fehler. Öffne /health über die Statusanzeige und kontrolliere origin_allowed, Deployment sowie ALLOWED_ORIGINS.';
     }else if(/429|Ratenlimit/i.test(err.message))hint='Zu viele Anfragen: später erneut versuchen; prüfe Groq-Limits und Worker-Rate-Limits.';
     bubble.textContent='KI derzeit nicht erreichbar: '+err.message+'\n\n'+hint;
     if(transport&&window.DancingWorkerDiagnostics)window.DancingWorkerDiagnostics.check();
     messages.pop();$('chat-status').textContent='● Worker prüfen';
   }
   finally{sending=false;$('chat-send').disabled=false;$('chat-messages').scrollTop=$('chat-messages').scrollHeight;}
 });
})();
