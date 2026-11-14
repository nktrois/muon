(function (root) {
  'use strict';
  // Presets are approximate ICRS/J2000 target centres, sufficient for the initial
  // view. Remote name resolution in Aladin can refine them when searching.
  const TARGETS = [
    { id:'M31', name:'M31 · Andromède', ra:10.6847, dec:41.2688, group:'Galaxies' },
    { id:'M51', name:'M51 · Tourbillon', ra:202.4696, dec:47.1953, group:'Galaxies' },
    { id:'M63', name:'M63 · Tournesol', ra:198.9555, dec:42.0293, group:'Galaxies' },
    { id:'M81', name:'M81 · Bode', ra:148.8882, dec:69.0653, group:'Galaxies' },
    { id:'M82', name:'M82 · Cigare', ra:148.9685, dec:69.6797, group:'Galaxies' },
    { id:'M81-82', name:'M81 + M82 · Duo', ra:148.92, dec:69.37, group:'Galaxies' },
    { id:'NGC4631', name:'NGC 4631 · Baleine', ra:190.5334, dec:32.5406, group:'Galaxies' },
    { id:'M101', name:'M101 · Moulinet', ra:210.8023, dec:54.3489, group:'Galaxies' },
    { id:'M33', name:'M33 · Triangle', ra:23.4621, dec:30.6602, group:'Galaxies' },
    { id:'M42', name:'M42 · Orion', ra:83.8221, dec:-5.3911, group:'Nébuleuses' },
    { id:'M27', name:'M27 · Haltère', ra:299.901, dec:22.721, group:'Nébuleuses' },
    { id:'M57', name:'M57 · Anneau', ra:283.3965, dec:33.0292, group:'Nébuleuses' },
    { id:'NGC7000', name:'NGC 7000 · Amérique du Nord', ra:314.0, dec:44.33, group:'Nébuleuses' },
    { id:'NGC6960', name:'NGC 6960 · Voile occidental', ra:311.418, dec:30.72, group:'Nébuleuses' },
    { id:'NGC2237', name:'NGC 2237 · Rosette', ra:98.05, dec:4.99, group:'Nébuleuses' },
    { id:'IC1396', name:'IC 1396 · Céphée', ra:324.75, dec:57.50, group:'Nébuleuses' },
    { id:'M8', name:'M8 · Lagune', ra:270.921, dec:-24.38, group:'Nébuleuses' },
    { id:'M45', name:'M45 · Pléiades', ra:56.75, dec:24.1167, group:'Amas' },
    { id:'M13', name:'M13 · Hercule', ra:250.4219, dec:36.4613, group:'Amas' },
    { id:'NGC869', name:'NGC 869 · Double amas', ra:34.75, dec:57.13, group:'Amas' }
  ];

  const TELESCOPES = [
    { id:'newton1000', name:'Newton 200/1000', focal:1000, aperture:200 },
    { id:'newton750', name:'Newton 150/750', focal:750, aperture:150 },
    { id:'newton1200', name:'Newton 200/1200', focal:1200, aperture:200 },
    { id:'ed80', name:'Lunette 80/480', focal:480, aperture:80 },
    { id:'ed72', name:'Lunette 72/432', focal:432, aperture:72 },
    { id:'redcat51', name:'Lunette 51/250', focal:250, aperture:51 },
    { id:'sct8', name:'SCT 203/2032', focal:2032, aperture:203 },
    { id:'mak150', name:'Maksutov 150/1800', focal:1800, aperture:150 },
    { id:'lens135', name:'Téléobjectif 135 mm', focal:135, aperture:0 },
    { id:'custom', name:'Personnalisé', focal:1000, aperture:0 }
  ];

  const CAMERAS = [
    { id:'asi294mc', name:'ZWO ASI294MC Pro', pixelsX:4144, pixelsY:2822, pixelUm:4.63 },
    { id:'asi533mc', name:'ZWO ASI533MC Pro', pixelsX:3008, pixelsY:3008, pixelUm:3.76 },
    { id:'asi2600mc', name:'ZWO ASI2600MC Pro', pixelsX:6248, pixelsY:4176, pixelUm:3.76 },
    { id:'asi585mc', name:'ZWO ASI585MC Pro', pixelsX:3840, pixelsY:2160, pixelUm:2.9 },
    { id:'asi183mc', name:'ZWO ASI183MC Pro', pixelsX:5496, pixelsY:3672, pixelUm:2.4 },
    { id:'apsc', name:'APS-C générique · exemple', pixelsX:6000, pixelsY:4000, pixelUm:3.9 },
    { id:'fullframe', name:'Plein format · exemple', pixelsX:6000, pixelsY:4000, pixelUm:6 },
    { id:'custom', name:'Personnalisée', pixelsX:4144, pixelsY:2822, pixelUm:4.63 }
  ];

  const api = { TARGETS, TELESCOPES, CAMERAS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SkyCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
