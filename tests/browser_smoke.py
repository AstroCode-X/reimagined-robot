"""Browser integration smoke test. Mock upstream endpoints; no real NASA/Groq calls."""
import asyncio
import json
import datetime as dt
import base64
import re
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:8743/'

def inline_browser_html():
    """Use in-memory page because this sandbox blocks localhost Chromium navigation."""
    text=(ROOT/'index.html').read_text()
    urls={}
    for file in ('moon_illustrative.jpg','south_pole_illustrative.jpg'):
        urls['assets/'+file]='data:image/jpeg;base64,'+base64.b64encode((ROOT/'assets'/file).read_bytes()).decode()
    script_texts={}
    for f in ('default-data.js','ml-model.js','astro.js','moon-webgl.js','app.js','worker-diagnostics.js','chat.js'):
        script=(ROOT/'assets'/f).read_text()
        for k,v in urls.items():script=script.replace(k,v)
        if f=='app.js':script=script.replace('realImage.src=`${WORKER}/texture`;',"realImage.src='"+urls['assets/moon_illustrative.jpg']+"';")
        script_texts[f]=script
    def substitute(m):return '<script>'+script_texts[Path(m.group(1)).name]+'</script>'
    return re.sub(r'<script src="([^"]+)"></script>',substitute,text)

MOCK_FETCH=r"""
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input.url, 'https://apikey.elias256.workers.dev');
 if(url.pathname==='/health')return new Response(JSON.stringify({status:'ok',service:'Dancing with SARS API',version:'TEST',groq_configured:true,chat_rate_limit_configured:true,data_rate_limit_configured:true,origin_allowed:true}),{status:200,headers:{'Content-Type':'application/json'}});
 if(url.pathname==='/ephemeris'){
   const id=url.searchParams.get('site'),hours=Number(url.searchParams.get('hours'));
   const start=new Date(url.searchParams.get('start')+':00Z');
   const samples=(v)=>Array.from({length:hours+1},(_,i)=>({time:new Date(start.getTime()+i*3600000).toISOString(),az:100.5,el:v}));
   return new Response(JSON.stringify({source:'NASA/JPL Horizons',step_hours:1,sites:{[id]:{sun:samples(5),earth:samples(2)}}}),{status:200,headers:{'Content-Type':'application/json'}});
 }
 if(url.pathname==='/chat')return new Response(JSON.stringify({answer:'Die NASA/JPL-Horizons-Daten zeigen geometrische Höhenwinkel.',model:'llama-3.3-70b-versatile'}),{status:200,headers:{'Content-Type':'application/json'}});
 return new Response('',{status:404});
};
"""
async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-webgl'])
        context=await browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=1)
        page=await context.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        await page.add_init_script(MOCK_FETCH)
        await page.evaluate("() => {"+MOCK_FETCH+"}")
        await page.set_content(inline_browser_html(),wait_until='load',timeout=60000)
        await page.wait_for_timeout(2500)
        print('DEBUG',errors,await page.locator('#sun-now').inner_text(),await page.locator('#source-note').inner_text(),await page.evaluate('!!window.DancingApp'))
        await page.wait_for_function("document.querySelector('#sun-now').textContent.includes('+5')",timeout=10000)
        assert 'JPL LIVE' in await page.locator('#top-mode').inner_text()
        assert await page.locator('#texture-note').inner_text()!=''
        assert await page.locator('canvas#canvas-3d').count()==1
        await page.locator('#chat-open').click()
        await page.locator('#chat-input').fill('Was zeigt die NASA hier?')
        await page.locator('#chat-send').click()
        await page.get_by_text('Die NASA/JPL-Horizons-Daten zeigen geometrische Höhenwinkel.').wait_for(timeout=15000)
        await page.screenshot(path=str(ROOT/'tests'/'browser-desktop.png'),full_page=True)
        await page.locator('#chat-close').click()
        await page.locator('button[data-view="globe"]').click()
        assert not await page.locator('#moon-full-canvas').evaluate('(el)=>el.classList.contains("hidden")')
        await page.screenshot(path=str(ROOT/'tests'/'browser-moon-3d.png'))
        mobile=await browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1)
        mob=await mobile.new_page()
        mob.on('pageerror',lambda e:errors.append('mobile: '+str(e)))
        await mob.add_init_script(MOCK_FETCH)
        await mob.evaluate("() => {"+MOCK_FETCH+"}")
        await mob.set_content(inline_browser_html(),wait_until='load',timeout=60000)
        await mob.wait_for_timeout(1200)
        overflow=await mob.evaluate('document.documentElement.scrollWidth > window.innerWidth + 2')
        assert not overflow,'horizontal overflow on mobile'
        await mob.screenshot(path=str(ROOT/'tests'/'browser-mobile.png'),full_page=True)
        await mobile.close()
        print('browser UI / JPL mocked / Groq mocked / 3D / mobile: PASS')
        print('JavaScript errors:',errors)
        assert not errors,errors
        await browser.close()

if __name__=='__main__':asyncio.run(main())
