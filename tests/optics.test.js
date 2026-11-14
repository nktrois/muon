const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateOptics, computeMosaic, getMosaicSpans, tangentToSky, formatAngle, raToHms, decToDms } = require('../optics.js');

const setup={focalMm:1000,factor:1,pixelsX:4144,pixelsY:2822,pixelUm:4.63};
const opt=calculateOptics(setup);

test('ASI294MC Pro at 1000mm: sensor geometry and angular scale',()=>{
  assert.ok(Math.abs(opt.sensorWidthMm-19.18672)<1e-6);
  assert.ok(Math.abs(opt.sensorHeightMm-13.06586)<1e-6);
  assert.ok(Math.abs(opt.scaleArcsecPerPixel-0.95493)<0.001);
  assert.ok(Math.abs(opt.fovWidthDeg-1.099)<0.005);
  assert.ok(Math.abs(opt.fovHeightDeg-0.748)<0.005);
});

test('Barlow 2x halves pixel scale and framing width',()=>{
  const b=calculateOptics({...setup,factor:2});
  assert.equal(b.effectiveFocalMm,2000);
  assert.ok(Math.abs(b.scaleArcsecPerPixel/opt.scaleArcsecPerPixel-0.5)<1e-9);
  assert.ok(b.fovWidthDeg < opt.fovWidthDeg);
});

test('Rectangular mosaic dimensions include overlap',()=>{
  const s=getMosaicSpans(opt,2,15);
  assert.equal(s.panels,4);
  assert.ok(s.widthDeg > opt.fovWidthDeg);
  assert.ok(s.widthDeg < 2*opt.fovWidthDeg);
});

test('Mosaic footprint is closed, centers and coordinates finite near the pole',()=>{
  const panels=computeMosaic({raDeg:356,decDeg:83,rotationDeg:47,mosaic:3,overlapPercent:20,optics:opt});
  assert.equal(panels.length,9);
  for(const p of panels){
    assert.equal(p.footprint.length,34);
    assert.deepEqual(p.footprint[0],p.footprint[p.footprint.length-1]);
    for(const [ra,dec] of p.footprint){assert.ok(ra>=0&&ra<360);assert.ok(dec>=-90&&dec<=90);}
  }
});

test('Tangent-plane exact center and wrap-around near RA 0',()=>{
  const zero=tangentToSky(0,0,0,0);
  assert.ok(Math.abs(zero[0])<1e-9);
  assert.ok(Math.abs(zero[1])<1e-9);
  const left=tangentToSky(0,0,-0.03,0);
  assert.ok(left[0]>350);
});

test('Input validation rejects impossible parameters',()=>{
  assert.throws(()=>calculateOptics({...setup,pixelUm:0}),RangeError);
  assert.throws(()=>calculateOptics({...setup,focalMm:-12}),RangeError);
  assert.throws(()=>computeMosaic({raDeg:2,decDeg:0,mosaic:5,optics:opt}),RangeError);
});

test('Human-friendly angular and coordinate formatting',()=>{
  assert.equal(formatAngle(0.5),'30.0′');
  assert.match(raToHms(15),/01h 00m/);
  assert.match(decToDms(-30),/−30°/);
});
