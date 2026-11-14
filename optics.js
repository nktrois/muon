(function (root) {
  'use strict';
  /** Pure optics/astrometry functions, no runtime dependencies. */
  const RADIANS = Math.PI / 180;
  const DEGREES = 180 / Math.PI;

  function requirePositive(value, label) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) throw new RangeError(`${label} doit être positif.`);
    return n;
  }

  function calculateOptics({ focalMm, factor, pixelsX, pixelsY, pixelUm }) {
    const focal = requirePositive(focalMm, 'La focale');
    const multiplier = requirePositive(factor, 'Le multiplicateur');
    const nx = requirePositive(pixelsX, 'La largeur en pixels');
    const ny = requirePositive(pixelsY, 'La hauteur en pixels');
    const px = requirePositive(pixelUm, 'La taille des pixels');
    if (nx > 100000 || ny > 100000 || focal > 100000 || px > 1000 || multiplier > 20) {
      throw new RangeError('Valeur hors plage de simulation.');
    }
    const effectiveFocalMm = focal * multiplier;
    const sensorWidthMm = nx * px / 1000;
    const sensorHeightMm = ny * px / 1000;
    // Exact rectilinear field angles for an ideal flat detector.
    const fovWidthDeg = 2 * Math.atan(sensorWidthMm / (2 * effectiveFocalMm)) * DEGREES;
    const fovHeightDeg = 2 * Math.atan(sensorHeightMm / (2 * effectiveFocalMm)) * DEGREES;
    const fovDiagonalDeg = 2 * Math.atan(Math.hypot(sensorWidthMm, sensorHeightMm) / (2 * effectiveFocalMm)) * DEGREES;
    const scaleArcsecPerPixel = 206264.806247 * (px / 1000) / effectiveFocalMm;
    return { effectiveFocalMm, sensorWidthMm, sensorHeightMm, fovWidthDeg, fovHeightDeg, fovDiagonalDeg, scaleArcsecPerPixel };
  }

  /** Convert tangent-plane camera coordinates (physical mm / focal mm) to ICRS sky coordinates.
   * Positive u points towards increasing RA (east); positive v towards north.
   * Angle rotates the sensor counter-clockwise in the east/north tangent plane.
   */
  function tangentToSky(raDeg, decDeg, u, v, rotationDeg = 0) {
    const ra0 = Number(raDeg) * RADIANS;
    const dec0 = Number(decDeg) * RADIANS;
    if (![ra0, dec0, u, v, rotationDeg].every(Number.isFinite) || Math.abs(decDeg) > 90) {
      throw new RangeError('Coordonnées ou orientation invalides.');
    }
    const a = rotationDeg * RADIANS;
    const x = u * Math.cos(a) - v * Math.sin(a);
    const y = u * Math.sin(a) + v * Math.cos(a);
    const den = Math.cos(dec0) - y * Math.sin(dec0);
    const ra = ra0 + Math.atan2(x, den);
    const dec = Math.atan2(Math.sin(dec0) + y * Math.cos(dec0), Math.hypot(x, den));
    return [(ra * DEGREES + 3600) % 360, dec * DEGREES];
  }

  /** Each panel: closed sky polygon from a physical detector grid, with overlap. */
  function computeMosaic({ raDeg, decDeg, rotationDeg = 0, mosaic = 1, overlapPercent = 15, optics, samplesPerEdge = 8 }) {
    const n = Number(mosaic);
    const overlap = Number(overlapPercent);
    if (!Number.isInteger(n) || n < 1 || n > 4) throw new RangeError('Mosaïque invalide.');
    if (overlap < 0 || overlap >= 70) throw new RangeError('Recouvrement invalide.');
    const hx = optics.sensorWidthMm / (2 * optics.effectiveFocalMm);
    const hy = optics.sensorHeightMm / (2 * optics.effectiveFocalMm);
    const stepx = 2 * hx * (1 - overlap / 100);
    const stepy = 2 * hy * (1 - overlap / 100);
    const edge = Math.max(2, Math.floor(samplesPerEdge));
    const panels = [];
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const u0 = (col - (n - 1) / 2) * stepx;
        const v0 = ((n - 1) / 2 - row) * stepy;
        const boundary = [];
        for (let i = 0; i <= edge; i++) boundary.push([u0 - hx + 2 * hx * i / edge, v0 + hy]);
        for (let i = 1; i <= edge; i++) boundary.push([u0 + hx, v0 + hy - 2 * hy * i / edge]);
        for (let i = 1; i <= edge; i++) boundary.push([u0 + hx - 2 * hx * i / edge, v0 - hy]);
        for (let i = 1; i <= edge; i++) boundary.push([u0 - hx, v0 - hy + 2 * hy * i / edge]);
        boundary.push(boundary[0]);
        panels.push({ row, col, footprint: boundary.map(([u,v]) => tangentToSky(raDeg, decDeg, u, v, rotationDeg)), center: tangentToSky(raDeg, decDeg, u0, v0, rotationDeg) });
      }
    }
    return panels;
  }

  function getMosaicSpans(optics, mosaic, overlapPercent) {
    const n = Number(mosaic);
    const overlap = Number(overlapPercent) / 100;
    const widthMm = optics.sensorWidthMm * (1 + (n - 1) * (1 - overlap));
    const heightMm = optics.sensorHeightMm * (1 + (n - 1) * (1 - overlap));
    return {
      widthDeg: 2 * Math.atan(widthMm / (2 * optics.effectiveFocalMm)) * DEGREES,
      heightDeg: 2 * Math.atan(heightMm / (2 * optics.effectiveFocalMm)) * DEGREES,
      panels: n * n
    };
  }

  function formatAngle(degrees) {
    const value = Math.abs(degrees);
    if (value < 1) return `${(value * 60).toFixed(1)}′`;
    return `${value.toFixed(value < 10 ? 2 : 1)}°`;
  }

  function raToHms(degrees) {
    let hours = ((Number(degrees) / 15) % 24 + 24) % 24;
    let hh = Math.floor(hours);
    let mm = Math.floor((hours - hh) * 60);
    let ss = ((hours - hh) * 60 - mm) * 60;
    if (ss >= 59.995) {ss = 0; mm += 1;}
    if (mm >= 60) {mm = 0; hh = (hh + 1) % 24;}
    return `${String(hh).padStart(2,'0')}h ${String(mm).padStart(2,'0')}m ${ss.toFixed(1).padStart(4,'0')}s`;
  }

  function decToDms(degrees) {
    const sign = Number(degrees) < 0 ? '−' : '+';
    const a = Math.abs(Number(degrees));
    let dd = Math.floor(a); let mm = Math.floor((a-dd)*60); let ss = ((a-dd)*60-mm)*60;
    if (ss >= 59.95) {ss=0;mm+=1;} if(mm>=60){mm=0;dd+=1;}
    return `${sign}${String(dd).padStart(2,'0')}° ${String(mm).padStart(2,'0')}′ ${ss.toFixed(0).padStart(2,'0')}″`;
  }

  const api = { requirePositive, calculateOptics, tangentToSky, computeMosaic, getMosaicSpans, formatAngle, raToHms, decToDms };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SkyOptics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
