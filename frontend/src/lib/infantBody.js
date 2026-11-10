/* ---------- Anatomical newborn renderer (canvas) ----------
 * Supine infant seen from above, head to the left. Coordinates are in body units:
 * a point (x, y) lands at (cx + x * S, cy + y * S), with S = canvas height / 360.
 * Head centre stays at (-95, 0) so face landmarks from the CV stream keep lining up.
 * modes: 'rgb' (skin), 'thermal' (heat map), 'anatomy' (translucent skin, organs, vessels, hotspots)
 */

const TAU = Math.PI * 2;
let layer; // offscreen canvas reused between frames

// torso outline, neck → shoulders → hips, mirrored; breath widens the chest
const TORSO = (b) => [[-40, -22], [-30, -54 - b], [40, -62 - b], [104, -56], [144, -36], [156, 0], [144, 36], [104, 56], [40, 62 + b], [-30, 54 + b], [-40, 22]];
// flexed "frog" posture typical for a newborn: hands up by the face, knees out
const LIMBS = (s) => [
  { pts: [[-22, 42 * s], [5, 78 * s], [-30, 96 * s]], w: [28, 23], end: [-38, 96 * s, 13, 11, 0.2 * s] },
  { pts: [[121, 30 * s], [167, 68 * s], [207, 48 * s]], w: [42, 30], end: [220, 42 * s, 18, 12, -0.35 * s] },
];

// closed smooth curve through points (quadratic through midpoints)
function smooth(c, P, pts) {
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  c.beginPath(); c.moveTo(...P(...mid(pts.at(-1), pts[0])));
  pts.forEach((p, i) => c.quadraticCurveTo(...P(...p), ...P(...mid(p, pts[(i + 1) % pts.length]))));
  c.closePath();
}

function silhouette(c, P, S, b) {
  smooth(c, P, TORSO(b)); c.fill();
  c.lineCap = 'round'; c.lineJoin = 'round';
  [1, -1].forEach((s) => LIMBS(s).forEach(({ pts, w, end }) => {
    pts.slice(1).forEach((p, i) => { c.lineWidth = w[i] * S; c.beginPath(); c.moveTo(...P(...pts[i])); c.lineTo(...P(...p)); c.stroke(); });
    c.beginPath(); c.ellipse(...P(end[0], end[1]), end[2] * S, end[3] * S, end[4], 0, TAU); c.fill();
  }));
  c.beginPath(); c.ellipse(...P(-40, 0), 26 * S, 26 * S, 0, 0, TAU); c.fill(); // soft neck
  smooth(c, P, [[-157, 0], [-154, -35], [-127, -58], [-91, -61], [-58, -43], [-35, -17], [-35, 17], [-58, 43], [-91, 61], [-127, 58], [-154, 35]]); c.fill();
  [1, -1].forEach((s) => { c.beginPath(); c.ellipse(...P(-89, 54 * s), 9 * S, 6 * S, 0, 0, TAU); c.fill(); });
}

function face(c, P, S, alpha) {
  // A sleeping face: softly closed eyelids, small nose and relaxed lips.
  c.save(); c.strokeStyle = `rgba(104,69,66,${alpha * 0.7})`; c.lineWidth = 1.6 * S; c.lineCap = 'round';
  [1, -1].forEach((sign) => {
    c.fillStyle = radial(c, P, S, -91, 30 * sign, 19, `rgba(231,146,139,${alpha * 0.22})`, 'rgba(231,146,139,0)');
    c.beginPath(); c.ellipse(...P(-91, 30 * sign), 18 * S, 15 * S, 0, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(...P(-115, 9 * sign)); c.bezierCurveTo(...P(-109, 13 * sign), ...P(-109, 21 * sign), ...P(-115, 27 * sign)); c.stroke();
  });
  c.strokeStyle = `rgba(141,91,79,${alpha * 0.5})`; c.lineWidth = 1.2 * S;
  c.beginPath(); c.moveTo(...P(-96, -3)); c.quadraticCurveTo(...P(-91, 0), ...P(-96, 3)); c.stroke();
  c.fillStyle = `rgba(187,113,111,${alpha * 0.55})`; c.beginPath(); c.ellipse(...P(-76, 0), 2.4 * S, 6 * S, 0, 0, TAU); c.fill();
  c.strokeStyle = `rgba(130,79,78,${alpha * 0.4})`; c.lineWidth = S; c.beginPath(); c.moveTo(...P(-76, -4)); c.quadraticCurveTo(...P(-74, 0), ...P(-76, 4)); c.stroke();
  c.restore();
}

function heartShape(c, x, y, k, rot) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(k, k);
  c.beginPath(); c.moveTo(0, -6); c.bezierCurveTo(-4, -16, -20, -14, -20, -2); c.bezierCurveTo(-20, 10, -6, 16, 0, 24); c.bezierCurveTo(6, 16, 20, 10, 20, -2); c.bezierCurveTo(20, -14, 4, -16, 0, -6); c.closePath();
  c.restore();
}

function radial(c, P, S, x, y, r, inner, outer) {
  const g = c.createRadialGradient(...P(x, y), 0, ...P(x, y), r * S); g.addColorStop(0, inner); g.addColorStop(1, outer); return g;
}

// vessel paths; arteries run away from the heart, veins back to it
const ARTERIES = (s) => [
  [[24, 6], [36, 4], [138, 4], [180, 76 * s], [224, 52 * s]],
  [[20, 4], [-30, 8 * s], [-62, 14 * s], [-92, 22 * s]],
  [[12, 2], [-20, 44 * s], [14, 88 * s], [-34, 108 * s]],
];
const VEINS = (s) => [
  [[226, 58 * s], [184, 84 * s], [136, -4], [30, -6]],
  [[-96, -30 * s], [-64, -18 * s], [-30, -12 * s], [16, -4]],
  [[-40, 114 * s], [20, 94 * s], [-14, 50 * s], [10, -2]],
];
function vessel(c, P, S, pts, color, t, dir) {
  const path = () => { c.beginPath(); c.moveTo(...P(...pts[0])); pts.slice(1).forEach((p) => c.lineTo(...P(...p))); };
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = color; c.globalAlpha = 0.45; c.lineWidth = 2.6 * S; path(); c.stroke();
  c.globalAlpha = 1; c.lineWidth = 2 * S; c.setLineDash([3 * S, 12 * S]); c.lineDashOffset = -dir * t * 40 * S; path(); c.stroke(); c.setLineDash([]);
}

const BONE = 'rgba(198,220,227,.18)';
function skeleton(c, P, S) {
  c.strokeStyle = BONE; c.lineCap = 'round';
  // Keep the face intact; no exposed skull outline.
  c.fillStyle = BONE; for (let x = -44; x <= 140; x += 9) { c.beginPath(); c.roundRect(...P(x - 3, -3.5), 6 * S, 7 * S, 1.5 * S); c.fill(); } // spine
  c.lineWidth = 4.5 * S;
  [1, -1].forEach((s) => {
    LIMBS(s).forEach(({ pts }) => { c.beginPath(); c.moveTo(...P(...pts[0])); pts.slice(1).forEach((p) => c.lineTo(...P(...p))); c.stroke(); });
    c.lineWidth = 3 * S; c.beginPath(); c.moveTo(...P(-30, 6 * s)); c.lineTo(...P(-24, 44 * s)); c.stroke(); // clavicle
    c.beginPath(); c.ellipse(...P(132, 16 * s), 16 * S, 14 * S, 0, 0, TAU); c.stroke(); // pelvis
    c.lineWidth = 4.5 * S;
  });
}
function ribs(c, P, S) {
  c.strokeStyle = 'rgba(226,232,240,.32)'; c.lineWidth = 2.2 * S; c.lineCap = 'round';
  [1, -1].forEach((s) => { for (let i = 0; i < 7; i++) { const x = -20 + i * 10; c.beginPath(); c.moveTo(...P(x, 5 * s)); c.quadraticCurveTo(...P(x - 6, 52 * s), ...P(x + 16, 58 * s)); c.stroke(); } });
}

function organs(c, P, S, t, b, pulse) {
  skeleton(c, P, S);
  // A translucent region marker instead of an exposed brain or skull.
  c.fillStyle = radial(c, P, S, -112, 0, 42, 'rgba(175,193,232,.28)', 'rgba(175,193,232,0)');
  c.beginPath(); c.ellipse(...P(-112, 0), 39 * S, 40 * S, 0, 0, TAU); c.fill();
  face(c, P, S, 0.55);
  // trachea and bronchi
  c.strokeStyle = 'rgba(226,232,240,.75)'; c.lineWidth = 6 * S; c.lineCap = 'round'; c.beginPath(); c.moveTo(...P(-46, 0)); c.lineTo(...P(-8, 0)); c.moveTo(...P(-8, 0)); c.lineTo(...P(6, -16)); c.moveTo(...P(-8, 0)); c.lineTo(...P(6, 16)); c.stroke();
  // lungs breathe
  [[-30, 40, 24], [31, 38, 25]].forEach(([y, rx, ry]) => {
    c.fillStyle = radial(c, P, S, 14, y, rx + 6, 'rgba(189,221,219,.8)', 'rgba(102,166,171,.45)');
    c.beginPath(); c.ellipse(...P(14, y + Math.sign(y) * b * 0.5), (rx + b) * S, (ry + b * 0.6) * S, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 26; i++) { const a = i * 2.4, r = Math.sqrt(i / 26) * 0.8; c.beginPath(); c.arc(...P(14 + Math.cos(a) * r * rx, y + Math.sin(a) * r * ry), 1.6 * S, 0, TAU); c.fill(); }
  });
  ribs(c, P, S);
  // kidneys sit behind the gut
  [1, -1].forEach((s) => { c.fillStyle = 'rgba(169,132,145,.5)'; c.beginPath(); c.ellipse(...P(98, 40 * s), 9 * S, 14 * S, 0, 0, TAU); c.fill(); });
  // liver, stomach, bladder
  c.fillStyle = radial(c, P, S, 66, -24, 34, 'rgba(208,174,139,.7)', 'rgba(170,140,118,.4)'); c.beginPath(); c.ellipse(...P(66, -24), 30 * S, 26 * S, 0.2, 0, TAU); c.fill();
  c.fillStyle = 'rgba(253,186,116,.85)'; c.beginPath(); c.ellipse(...P(62, 24), 17 * S, 12 * S, -0.4, 0, TAU); c.fill();
  c.fillStyle = 'rgba(253,230,138,.75)'; c.beginPath(); c.ellipse(...P(148, 0), 9 * S, 11 * S, 0, 0, TAU); c.fill();
  // small intestine coils
  c.lineCap = 'round'; c.lineJoin = 'round';
  const gut = () => { c.beginPath(); [-24, -8, 8, 24].forEach((y, i) => { const [a, z] = i % 2 ? [134, 92] : [92, 134]; if (i === 0) c.moveTo(...P(a, y)); else c.lineTo(...P(a, y)); c.lineTo(...P(z, y)); }); };
  c.strokeStyle = 'rgba(212,177,171,.7)'; c.lineWidth = 10 * S; gut(); c.stroke();
  c.strokeStyle = 'rgba(254,226,226,.6)'; c.lineWidth = 3 * S; gut(); c.stroke();
  // vessels with moving blood
  c.save(); c.globalAlpha = 0.45; vessel(c, P, S, [[12, 0], [50, 0], [92, 0], [136, 0]], '#A8C9D6', t, 1); c.restore();
  // heart beats with the pulse
  const k = S * (1 + Math.max(0, pulse) * 0.08);
  c.fillStyle = radial(c, P, S, 22, 10, 26, '#DE99A4', '#AD7085'); heartShape(c, ...P(22, 10), k, -0.9); c.fill();
}

function hotspot(c, P, S, t, h) {
  const [x, y] = P(h.x, h.y), [lx, ly] = P(h.lx, h.ly), ph = (t * 0.9) % 1;
  c.strokeStyle = h.color; c.lineWidth = 1.5 * S;
  [ph, (ph + 0.5) % 1].forEach((p) => { c.globalAlpha = 1 - p; c.beginPath(); c.arc(x, y, (6 + p * 18) * S, 0, TAU); c.stroke(); });
  c.globalAlpha = 1; c.fillStyle = h.color; c.beginPath(); c.arc(x, y, 4 * S, 0, TAU); c.fill();
  c.beginPath(); c.moveTo(x, y); c.lineTo(lx, ly); c.stroke();
  c.font = `600 ${10.5 * S}px JetBrains Mono, monospace`; const w = Math.max(c.measureText(h.label).width, c.measureText(h.sub).width) + 14 * S;
  const bx = lx - (lx < x ? w : 0), by = ly - 16 * S;
  c.fillStyle = 'rgba(15,23,42,.97)'; c.beginPath(); c.roundRect(bx, by, w, 32 * S, 6 * S); c.fill(); c.stroke();
  c.fillStyle = h.color; c.fillText(h.label, bx + 7 * S, by + 13 * S);
  c.fillStyle = '#CBD5E1'; c.font = `${9.5 * S}px JetBrains Mono, monospace`; c.fillText(h.sub, bx + 7 * S, by + 26 * S);
}

/**
 * opts: cx, cy, S, t (seconds), mode, breath (-1..1), pulse (-1..1),
 *       cyan (0..1 cyanosis tint), heat (v => css colour), core (0..1 core temperature), hotspots
 */
export function drawInfant(ctx, { cx, cy, S, t, mode = 'rgb', breath = 0, pulse = 0, cyan = 0, heat, core = 0.7, hotspots = [] }) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (!layer) layer = document.createElement('canvas');
  if (layer.width !== W || layer.height !== H) { layer.width = W; layer.height = H; }
  const c = layer.getContext('2d'); c.clearRect(0, 0, W, H);
  const P = (x, y) => [cx + x * S, cy + y * S], b = breath * 3;
  const skin = `rgb(${Math.round(232 - cyan * 60)},${Math.round(190 - cyan * 40)},${Math.round(178 + cyan * 40)})`;

  if (mode === 'thermal') {
    const g = radial(c, P, S, 40, 0, 240, heat(core + 0.12), heat(core - 0.45)); c.fillStyle = g; c.strokeStyle = g;
  } else { c.fillStyle = skin; c.strokeStyle = skin; }
  silhouette(c, P, S, b);

  c.globalCompositeOperation = 'source-atop'; // everything below stays inside the body
  if (mode === 'anatomy') {
    c.fillStyle = 'rgba(117,155,164,.24)'; c.fillRect(0, 0, W, H);
    organs(c, P, S, t, b, pulse);
  } else {
    if (mode === 'rgb') {
      c.fillStyle = radial(c, P, S, 30, -20, 240, 'rgba(255,255,255,.22)', 'rgba(151,100,86,.14)'); c.fillRect(0, 0, W, H);
      c.fillStyle = radial(c, P, S, -110, -18, 70, 'rgba(255,255,255,.25)', 'rgba(255,255,255,0)'); c.fillRect(0, 0, W, H);
      // A clean cotton nappy keeps the clinical illustration gentle and modest.
      c.fillStyle = '#F0F2EE'; smooth(c, P, [[100, -53], [149, -37], [158, 0], [149, 37], [100, 53], [107, 16], [107, -16]]); c.fill();
      c.strokeStyle = 'rgba(154,175,177,.4)'; c.lineWidth = S;
      c.beginPath(); c.moveTo(...P(111, -40)); c.quadraticCurveTo(...P(129, 0), ...P(111, 40)); c.stroke();
      c.fillStyle = '#DDE8E5'; [-1, 1].forEach((sign) => { c.beginPath(); c.roundRect(...P(104, 32 * sign - 4), 16 * S, 8 * S, 3 * S); c.fill(); });
    }
    face(c, P, S, mode === 'thermal' ? 0.25 : 0.7);
  }
  c.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.shadowColor = mode === 'anatomy' ? 'rgba(125,185,192,.18)' : 'rgba(0,0,0,.22)'; ctx.shadowBlur = (mode === 'anatomy' ? 10 : 14) * S; ctx.shadowOffsetY = mode === 'anatomy' ? 0 : 6 * S;
  ctx.drawImage(layer, 0, 0); ctx.restore();
  if (mode === 'anatomy') hotspots.forEach((h) => hotspot(ctx, P, S, t, h));
}
