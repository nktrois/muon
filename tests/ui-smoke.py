# Optional UI smoke test. Needs Python Playwright + Chromium; no external sky network needed.
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
mock=r'''
window.A={
 init:Promise.resolve(),
 aladin: function(selector, opts){
  const el=document.querySelector(selector);el.style.background='radial-gradient(ellipse at 52% 55%,#223858,#071222 70%)';
  el.innerHTML='<div style="position:absolute;left:30%;top:18%;width:35%;height:67%;background:radial-gradient(ellipse,#b9e3ff13,transparent 72%);filter:blur(10px)"></div>';
  const obj={
   _center:[56.75,24.1167],getSize:()=>[el.offsetWidth,el.offsetHeight],
   gotoRaDec:function(ra,dec){this._center=[ra,dec]},getRaDec:function(){return this._center},
   setFov:function(){},setImageSurvey:function(){},addOverlay:function(){},gotoObject:function(q,ev){ev.success([10.6847,41.2688])}
  };return obj;
 },
 graphicOverlay:()=>({removeAll(){},add(shape){}}),polyline:(points)=>points
};
'''
if True:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1440,'height':960},device_scale_factor=1)
  errs=[]
  page.on('pageerror',lambda err: errs.append(str(err)))
  import re
  html=(ROOT/'index.html').read_text()
  html=re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.S)
  page.set_content(html,wait_until='domcontentloaded')
  page.add_style_tag(content=(ROOT/'style.css').read_text())
  page.add_script_tag(content=mock)
  src='\n'.join((ROOT/f).read_text() for f in ['optics.js','catalog.js','app.js'])
  src=re.sub(r'^import .*?;\s*$', '', src, flags=re.M)
  src=re.sub(r'^export ', '', src, flags=re.M)
  page.evaluate('(src)=>eval(src)',src)
  
  page.wait_for_timeout(500)
  assert page.locator('#statFocal').inner_text().strip().startswith('1'), page.locator('#statFocal').inner_text()
  assert '0,96' in page.locator('#statScale').inner_text(), page.locator('#statScale').inner_text()
  assert page.locator('#error').is_hidden(),page.locator('#error').inner_text()
  page.locator('#focal').fill('500');page.locator('#focal').dispatch_event('change')
  assert '500' in page.locator('#statFocal').inner_text(),page.locator('#statFocal').inner_text()
  page.locator('#factor').select_option('2')
  assert '1\u202f000' in page.locator('#statFocal').inner_text() or '1 000' in page.locator('#statFocal').inner_text(),page.locator('#statFocal').inner_text()
  page.locator('#camera').select_option('asi533mc')
  assert '3 008' in page.locator('#statPixels').inner_text() or '3\u202f008' in page.locator('#statPixels').inner_text()
  page.locator('#mosaic').select_option('2')
  assert '4 champs' in page.locator('#legendLabel').inner_text()
  page.locator('#reset').click()
  assert page.locator('#mosaic').input_value()=='1'
  assert page.locator('#targetPreset').input_value()=='M45'
  assert not errs, errs
  page.screenshot(path='/mnt/data/muon-screenshot.png',full_page=True)
  print('UI SMOKE PASS — calculations, controls, reset, and no JS errors')
  browser.close()

