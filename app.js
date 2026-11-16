(function () {
'use strict';
const { calculateOptics, computeMosaic, getMosaicSpans, formatAngle, raToHms, decToDms } = window.SkyOptics;
const { TARGETS, TELESCOPES, CAMERAS } = window.SkyCatalog;
const ALADIN_URL = 'https://cdn.jsdelivr.net/npm/aladin-lite@3.8.2/dist/aladin.js';
let A = null;
const SURVEYS = {
  dss: ['https://alasky.cds.unistra.fr/DSS/DSSColor', 'https://skies.esac.esa.int/DSSColor', 'https://irsa.ipac.caltech.edu/data/hips/CDS/DSS2/color'],
  '2mass': ['https://alasky.cds.unistra.fr/2MASS/Color', 'https://irsa.ipac.caltech.edu/data/hips/CDS/2MASS/Color']
};

async function surveyUrl(key) {
  const mirrors = SURVEYS[key] || SURVEYS.dss;
  for (const url of mirrors) {
    try {
      const r = await fetch(url + '/properties', { signal: AbortSignal.timeout(4000) });
      if (r.ok) return url;
    } catch (e) {}
  }
  return mirrors[0];
}

const $ = (id) => document.getElementById(id);
const formatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const decimal = (n, d=2) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits:d, maximumFractionDigits:d });
const defaultState = Object.freeze({
  ra: 56.75, dec: 24.1167, targetId: 'M45', title: 'M45 · Les Pléiades',
  telescopeId: 'newton1000', focal:1000, cameraId: 'asi294mc',
  pixelsX: 4144, pixelsY: 2822, pixelUm: 4.63,
  factor:1, rotation:0, mosaic:1, overlap:15, survey:'dss'
});
let state = { ...defaultState };
let aladin = null, frameOverlay = null, errorTimeout = null;
let lastCalculated = null;

function report(message, persistent=false) {
  const box = $('error');
  box.textContent = message;
  box.hidden = !message;
  window.clearTimeout(errorTimeout);
  if (message && !persistent) errorTimeout = window.setTimeout(() => { box.hidden=true; }, 7000);
}

function populateSelect(selectId, entries, selected) {
  const select = $(selectId);
  select.innerHTML = '';
  for (const item of entries) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    select.append(option);
  }
  select.value = selected;
}

function populateTargets() {
  const select = $('targetPreset');
  select.innerHTML = '';
  for (const groupName of ['Galaxies','Nébuleuses','Amas']) {
    const group = document.createElement('optgroup');
    group.label = groupName;
    TARGETS.filter(item => item.group === groupName).forEach(item => {
      const opt = document.createElement('option'); opt.value = item.id; opt.textContent = item.name; group.append(opt);
    });
    select.append(group);
  }
  const manual = document.createElement('option'); manual.value='custom';manual.textContent='Cible personnalisée'; select.append(manual);
  select.value=state.targetId;
}

function updateControls() {
  for (const key of ['ra','dec','focal','pixelsX','pixelsY','pixelUm','rotation','mosaic','overlap','survey']) $(key).value=state[key];
  $('targetPreset').value = TARGETS.some(t=>t.id===state.targetId) ? state.targetId : 'custom';
  $('telescope').value = state.telescopeId;
  $('camera').value = state.cameraId;
  const preset = $('factor').querySelector(`option[value="${state.factor}"]`);
  $('factor').value = preset ? String(state.factor) : 'custom';
  $('customFactorRow').classList.toggle('hidden', Boolean(preset));
  $('customFactor').value = state.factor;
  $('rotationValue').textContent=`${state.rotation}°`;
  $('overlap').disabled=Number(state.mosaic)===1;
}

function validateSettings() {
  const optics = calculateOptics({focalMm:state.focal, factor:state.factor, pixelsX:state.pixelsX, pixelsY:state.pixelsY, pixelUm:state.pixelUm});
  const ra = Number(state.ra), dec=Number(state.dec), rotation=Number(state.rotation);
  if (![ra,dec,rotation].every(Number.isFinite) || ra<0 || ra>360 || dec < -90 || dec > 90) throw new RangeError('Coordonnées célestes hors plage : AD 0–360°, DEC −90 à +90°.');
  if (Number(state.overlap)<0 || Number(state.overlap)>60) throw new RangeError('Recouvrement : 0 à 60 %.');
  const spans=getMosaicSpans(optics, state.mosaic, state.overlap);
  return {optics,spans};
}

function syncMetrics(optics, spans) {
  $('statFocal').innerHTML=`${formatter.format(optics.effectiveFocalMm)} <span>mm</span>`;
  $('statFactor').textContent=Number(state.factor)===1?'Sans réducteur ni Barlow':`Focale native ${formatter.format(state.focal)} mm × ${decimal(state.factor,2)}`;
  const single=Number(state.mosaic)===1;
  $('statFov').innerHTML=`${formatAngle(single?optics.fovWidthDeg:spans.widthDeg)} <span>×</span> ${formatAngle(single?optics.fovHeightDeg:spans.heightDeg)}`;
  $('statMosaic').textContent=single?'Champ d’une seule prise':`Mosaïque ${state.mosaic} × ${state.mosaic} · ${state.overlap} % de recouvrement`;
  $('statScale').innerHTML=`${decimal(optics.scaleArcsecPerPixel,2)} <span>″/px</span>`;
  $('statSensor').innerHTML=`${decimal(optics.sensorWidthMm)} <span>×</span> ${decimal(optics.sensorHeightMm)} <span>mm</span>`;
  $('statPixels').textContent=`${formatter.format(state.pixelsX)} × ${formatter.format(state.pixelsY)} pixels`;
  $('positionLabel').textContent=`AD ${raToHms(state.ra)} · DEC ${decToDms(state.dec)}`;
  $('objectTitle').textContent=state.title;
  $('legendLabel').textContent=single?'Champ de la caméra':`${spans.panels} champs mosaïque (${state.overlap} %)`;
}

function renderFrame() {
  const {optics,spans}=validateSettings();
  lastCalculated = {optics,spans};
  syncMetrics(optics,spans);
  if (!frameOverlay || !A) return;
  // Celestial polylines are transformed by Aladin itself, on pan/zoom/resize.
  // This avoids a drifting pixel-space overlay and handles high declinations.
  const panels=computeMosaic({raDeg:state.ra,decDeg:state.dec,rotationDeg:state.rotation,mosaic:state.mosaic,overlapPercent:state.overlap,optics});
  frameOverlay.removeAll();
  for (const panel of panels) frameOverlay.add(A.polyline(panel.footprint));
}

function rerender() {
  try { report(''); renderFrame(); }
  catch (err) { report(err.message,true); }
}

function fitFrame() {
  if (!aladin || !lastCalculated) return;
  const {spans}=lastCalculated;
  aladin.gotoRaDec(state.ra,state.dec);
  const size=aladin.getSize?.() || [900,550];
  // Give the mosaic diagonal room to rotate without cropping at 45°.
  const diagonal=Math.hypot(spans.widthDeg,spans.heightDeg);
  const aspect=(size[0] && size[1]) ? size[0]/size[1] : 1.5;
  const targetFov=Math.max(diagonal*1.35,spans.heightDeg*aspect*1.25, 0.04);
  aladin.setFov(Math.min(180,targetFov));
}

function goToTarget(ra,dec,title,id='custom') {
  state.ra=ra; state.dec=dec; state.title=title; state.targetId=id;
  updateControls(); rerender(); fitFrame();
}

function changeTarget() {
  const item=TARGETS.find(t=>t.id===$('targetPreset').value);
  if (item) goToTarget(item.ra,item.dec,item.name,item.id);
}

const SESAME = [
  'https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?',
  'https://vizier.cfa.harvard.edu/viz-bin/nph-sesame/-oxp/SNV?'
];

function localTarget(query) {
  const q = query.toLowerCase().replace(/\s+/g, '');
  return TARGETS.find(t => t.id.toLowerCase() === q || t.name.toLowerCase().replace(/\s+/g, '').startsWith(q));
}

async function resolveName(query) {
  for (const base of SESAME) {
    try {
      const r = await fetch(base + encodeURIComponent(query), { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const xml = await r.text();
      const ra = xml.match(/<jradeg>\s*([-\d.]+)/), dec = xml.match(/<jdedeg>\s*([-\d.]+)/);
      if (ra && dec) return [Number(ra[1]), Number(dec[1])];
      return null;
    } catch (e) {}
  }
  throw new Error('offline');
}

async function searchTarget() {
  const query=$('targetQuery').value.trim();
  if (!query) return report('Saisis un nom d’objet : M31, M45, NGC 4631...',false);
  const local=localTarget(query);
  if (local) { $('targetQuery').value=''; return goToTarget(local.ra,local.dec,local.name,local.id); }
  const button=$('searchTarget'); button.disabled=true; button.textContent='…';
  try {
    const coords=await resolveName(query);
    if (!coords) return report(`« ${query} » introuvable. Essaie une désignation comme M51, NGC 7000 ou IC 1396.`,false);
    goToTarget(coords[0],coords[1],query,'custom');
  } catch (e) {
    report('La recherche par nom a besoin d’Internet. Choisis un objet de la liste ou entre ses coordonnées.',false);
  } finally {
    button.disabled=false; button.textContent='Chercher';
  }
}

function goToCoordinates() {
  const ra=Number($('ra').value),dec=Number($('dec').value);
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || ra<0 || ra>360 || dec< -90 || dec>90) return report('Coordonnées invalides : AD entre 0 et 360°, DEC entre −90 et +90°.',true);
  goToTarget(ra,dec,'Coordonnées personnalisées','custom');
}

function setNumeric(key, elementId, options={}) {
  $(elementId).addEventListener('change', () => {
    const input=$(elementId);
    const v=Number(input.value);
    if (!input.value.trim() || !Number.isFinite(v) || (options.min!==undefined && v<options.min) || (options.max!==undefined && v>options.max)) {
      report(`Valeur invalide pour « ${key} ».`,true); updateControls(); return;
    }
    state[key]=v;
    if (key==='focal') {state.telescopeId='custom';$('telescope').value='custom';}
    if (['pixelsX','pixelsY','pixelUm'].includes(key)){state.cameraId='custom';$('camera').value='custom';}
    rerender();
  });
}

function setupEvents() {
  $('targetPreset').addEventListener('change',changeTarget);
  $('searchTarget').addEventListener('click',searchTarget);
  $('targetQuery').addEventListener('keydown',e=>{if(e.key==='Enter')searchTarget();});
  $('gotoCoords').addEventListener('click',goToCoordinates);
  $('telescope').addEventListener('change',()=>{
    const item=TELESCOPES.find(t=>t.id===$('telescope').value);
    if(!item)return;state.telescopeId=item.id;
    if(item.id!=='custom') state.focal=item.focal;
    $('focal').value=state.focal;rerender();
  });
  $('camera').addEventListener('change',()=>{
    const item=CAMERAS.find(t=>t.id===$('camera').value);
    if(!item)return;state.cameraId=item.id;
    if(item.id!=='custom') for(const k of ['pixelsX','pixelsY','pixelUm'])state[k]=item[k];
    updateControls();rerender();
  });
  $('factor').addEventListener('change',()=>{
    const custom=$('factor').value==='custom';$('customFactorRow').classList.toggle('hidden',!custom);
    state.factor=Number(custom?$('customFactor').value:$('factor').value);rerender();
  });
  setNumeric('focal','focal',{min:1,max:100000});
  setNumeric('pixelUm','pixelUm',{min:0.01,max:1000});
  setNumeric('pixelsX','pixelsX',{min:1,max:100000});
  setNumeric('pixelsY','pixelsY',{min:1,max:100000});
  setNumeric('factor','customFactor',{min:0.01,max:20});
  setNumeric('overlap','overlap',{min:0,max:60});
  $('rotation').addEventListener('input',()=>{state.rotation=Number($('rotation').value);$('rotationValue').textContent=`${state.rotation}°`;rerender();});
  $('mosaic').addEventListener('change',()=>{state.mosaic=Number($('mosaic').value);$('overlap').disabled=state.mosaic===1;rerender();});
  $('survey').addEventListener('change',()=>{
    state.survey=$('survey').value;
    if (aladin) surveyUrl(state.survey).then(url=>aladin.setBaseImageLayer(A.imageHiPS(url,{name:state.survey==='2mass'?'2MASS':'DSS2'}))).catch(()=>report('Ce fond de ciel n’a pas pu être chargé.',false));
  });
  $('fitFrame').addEventListener('click',fitFrame);
  $('centerOnView').addEventListener('click',()=>{
    if(!aladin) return report('La carte du ciel doit être chargée pour ça.',false);
    const coords=aladin.getRaDec();
    if(Array.isArray(coords)&&coords.length>=2)goToTarget(Number(coords[0]),Number(coords[1]),'Pointage personnalisé','custom');
  });
  $('reset').addEventListener('click',()=>{state={...defaultState};updateControls();rerender();fitFrame();report('');});
  $('copyLink').addEventListener('click',async()=>{
    const link=makeShareLink();
    try {await navigator.clipboard.writeText(link);const btn=$('copyLink');const prev=btn.textContent;btn.textContent='Lien copié';setTimeout(()=>btn.textContent=prev,2200);}
    catch {window.prompt('Copie ce lien :',link);}
  });
  $('downloadJson').addEventListener('click',downloadConfig);
}

function makeShareLink() {
  const keys=['ra','dec','title','telescopeId','focal','factor','cameraId','pixelsX','pixelsY','pixelUm','rotation','mosaic','overlap','survey'];
  const url=new URL(window.location.href);url.search='';url.hash='';
  for(const key of keys)url.searchParams.set(key,String(state[key]));
  return url.toString();
}

function restoreFromURL() {
  const params=new URLSearchParams(location.search);
  if(!params.has('focal') && !params.has('ra')) return;
  try {
    const draft={...state};
    const numberKeys=['ra','dec','focal','factor','pixelsX','pixelsY','pixelUm','rotation','mosaic','overlap'];
    const textKeys=['title','telescopeId','cameraId','survey'];
    for(const key of numberKeys) if(params.has(key)){const raw=params.get(key);if(!raw)throw new Error('Paramètre vide');draft[key]=Number(raw);}
    for(const key of textKeys)if(params.has(key))draft[key]=params.get(key).slice(0,120);
    draft.targetId='custom';
    if(!Object.keys(SURVEYS).includes(draft.survey))draft.survey=defaultState.survey;
    if(!TELESCOPES.some(t=>t.id===draft.telescopeId))draft.telescopeId='custom';
    if(!CAMERAS.some(t=>t.id===draft.cameraId))draft.cameraId='custom';
    state=draft;validateSettings();
  }catch(e){state={...defaultState};report('Lien partagé invalide : paramètres par défaut restaurés.',true);}
}

function downloadConfig() {
  try {
    const {optics,spans}=validateSettings();
    const panels=computeMosaic({raDeg:state.ra,decDeg:state.dec,rotationDeg:state.rotation,mosaic:state.mosaic,overlapPercent:state.overlap,optics});
    const output={app:'Muon Ciel profond',version:'0.2',coordinateFrame:'ICRS (J2000 approximation for presets)',
      note:'Geometric ideal-field model; not a plate-solving/WCS solution or an exposure simulation.',
      target:{name:state.title,raDeg:state.ra,decDeg:state.dec},
      telescope:{preset:state.telescopeId,nativeFocalMm:state.focal,opticalFactor:state.factor},
      camera:{preset:state.cameraId,widthPx:state.pixelsX,heightPx:state.pixelsY,pixelSizeUm:state.pixelUm,rotationDeg:state.rotation},
      mosaic:{countPerAxis:state.mosaic,overlapPercent:state.overlap},field:{...optics,...spans},
      panels:panels.map(({row,col,center,footprint})=>({row:row+1,column:col+1,centerRaDeg:center[0],centerDecDeg:center[1],skyFootprint:footprint}))};
    const blob=new Blob([JSON.stringify(output,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='muon-ciel-profond.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }catch(e){report(e.message,true);}
}

async function startAladin() {
  try {
    A = window.A || (await import(ALADIN_URL)).default;
  } catch (e) {
    A = null;
    $('atlasStatus').textContent='Carte du ciel hors ligne';
    $('atlasPlaceholder').querySelector('strong').textContent='Carte du ciel indisponible';
    $('atlasPlaceholder').querySelector('small').textContent='Pas de connexion Internet : les calculs fonctionnent quand même.';
    return;
  }
  try {
    await A.init;
    const survey = await surveyUrl(state.survey);
    aladin=A.aladin('#aladin-lite-div',{
      target:`${state.ra} ${state.dec}`,cooFrame:'ICRSd',fov:2,projection:'TAN',survey,
      showReticle:false,showCooGrid:false,showProjectionControl:false,showFrame:false,
      showZoomControl:true,showFullscreenControl:true,showLayersControl:false,showGotoControl:false,showContextMenu:true
    });
    aladin.setBaseImageLayer(A.imageHiPS(survey, { name: state.survey === '2mass' ? '2MASS' : 'DSS2' }));
    frameOverlay=A.graphicOverlay({name:'Muon',color:'#ffb347',lineWidth:2});
    aladin.addOverlay(frameOverlay);
    renderFrame();
    fitFrame();
    $('atlasPlaceholder').style.display='none';
    $('atlasStatus').textContent='Carte du ciel · CDS';
    window.addEventListener('resize',()=>{if(aladin && frameOverlay)renderFrame();});
  }catch(e){
    $('atlasStatus').textContent='Carte du ciel indisponible';
    $('atlasPlaceholder').querySelector('strong').textContent='Carte du ciel indisponible';
    $('atlasPlaceholder').querySelector('small').textContent=`Les calculs fonctionnent quand même. (${e.message || e})`;
  }
}

populateTargets();
populateSelect('telescope',TELESCOPES,state.telescopeId);
populateSelect('camera',CAMERAS,state.cameraId);
restoreFromURL();
updateControls();
setupEvents();
rerender();
startAladin();
})();
