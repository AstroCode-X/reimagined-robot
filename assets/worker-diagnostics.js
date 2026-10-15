/* Public Worker diagnostics. No secret value is downloaded or displayed. */
(()=>{
  'use strict';
  const base='https://apikey.elias256.workers.dev';
  const $=id=>document.getElementById(id);
  const msg=$('worker-message'), badge=$('worker-badge');
  function render(lines,level){
    if(!msg||!badge)return;
    msg.textContent=lines.join('\n');msg.classList.remove('ok','bad');if(level)msg.classList.add(level);
    badge.textContent=level==='ok'?'BEREIT':level==='bad'?'PROBLEM':'PRÜFEN';
    badge.style.color=level==='ok'?'#00ff88':'#ffbd69';
  }
  async function check(){
    render(['Cloudflare Worker wird geprüft ...'],'');
    if(location.protocol==='file:'){
      render(['Lokale Datei (file://) erkannt.', 'Bitte die App über http://localhost:8000 oder Cloudflare Pages öffnen. Danach erneut prüfen.'],'bad');
      return {status:'file-protocol',message:'Lokale file://-URL – bitte mit lokalem HTTP-Server starten.'};
    }
    try{
      const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),11000);
      let r;
      try{r=await fetch(base+'/health',{mode:'cors',cache:'no-store',signal:ctrl.signal});}finally{clearTimeout(timeout);}
      const contentType=r.headers.get('content-type')||'';
      if(r.status===404)return renderFail('Auf /health kommt HTTP 404. Der Worker enthält wahrscheinlich noch nicht den neuen Projekt-Code. worker.js neu deployen.');
      if(!contentType.includes('application/json'))return renderFail('Worker liefert keine JSON-Diagnose (HTTP '+r.status+'). Prüfe, ob der richtige Worker unter apikey.elias256.workers.dev liegt.');
      const d=await r.json();if(!r.ok)return renderFail('Statusfehler HTTP '+r.status+': '+(d.error||'Unbekannt'));
      if(d.service!=='Dancing with SARS API')return renderFail('Falsche/alte Worker-Version: Der /health-Endpunkt ist nicht aktuell. Aktualisiere worker.js.');
      const lines=[
        'Worker: erreichbar · Version '+d.version,
        'Groq Secret: '+(d.groq_configured?'vorhanden':'FEHLT: GROQ_API_KEY'),
        'Rate-Limit CHAT: '+(d.chat_rate_limit_configured?'vorhanden':'FEHLT: CHAT_RATE_LIMITER'),
        'Rate-Limit DATA: '+(d.data_rate_limit_configured?'vorhanden':'optional nicht gesetzt'),
        'Website-Origin: '+(d.origin_allowed?'freigegeben':'NICHT FREIGEGEBEN: '+location.origin),
      ];
      const ok=d.groq_configured&&d.chat_rate_limit_configured&&d.origin_allowed;
      lines.push(ok?'KI bereit zur Anfrage; die Verbindung zu Groq wurde noch nicht live getestet.':'Bitte Worker-Einstellungen korrigieren und erneut deployen.');
      render(lines,ok?'ok':'bad');
      return {...d,status:ok?'ready':'incomplete',message:lines.join(' / ')};
    }catch(e){
      const detail=e.name==='AbortError'?'Zeitüberschreitung':'Netzwerk, Firewall, DNS oder Worker nicht erreichbar';
      return renderFail('Keine Verbindung zu '+base+'/health ('+detail+'). Worker-URL und Deployment prüfen.');
    }
  }
  function renderFail(text){render([text],'bad');return {status:'unreachable',message:text};}
  if($('worker-check'))$('worker-check').addEventListener('click',check);
  window.DancingWorkerDiagnostics={check};
  check();
})();
