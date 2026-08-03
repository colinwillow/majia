/* ============================================================
   MAJIA STUDIO — monoline vector font
   Single-stroke geometric letterforms. Each glyph is a list of
   strokes; a stroke is a list of ops:
     ['M',x,y]  move pen
     ['L',x,y]  line to
     ['E',cx,cy,rx,ry,a0,a1]  elliptical arc, degrees, 0°=right 90°=down,
                              sampled a0→a1 (either direction)
   Coordinates: y down, cap height 0..1, baseline at y=1.
   The point of a single-weight line: particles settle evenly along
   it and *are* the drawn text — no filled glyph, no overlay.
   ============================================================ */

export const GLYPHS = {
  A: { w: 0.70, s: [[['M',0,1],['L',0.35,0],['L',0.70,1]], [['M',0.14,0.60],['L',0.56,0.60]]] },
  B: { w: 0.58, s: [[['M',0,0],['L',0,1]],
                    [['M',0,0],['L',0.31,0],['E',0.31,0.25,0.25,0.25,-90,90],['L',0,0.5]],
                    [['M',0,0.5],['L',0.31,0.5],['E',0.31,0.75,0.27,0.25,-90,90],['L',0,1]]] },
  C: { w: 0.66, s: [[['E',0.36,0.5,0.34,0.5,42,318]]] },
  D: { w: 0.62, s: [[['M',0,0],['L',0,1]],
                    [['M',0,0],['L',0.26,0],['E',0.26,0.5,0.34,0.5,-90,90],['L',0,1]]] },
  E: { w: 0.52, s: [[['M',0.50,0],['L',0,0],['L',0,1],['L',0.50,1]], [['M',0,0.52],['L',0.42,0.52]]] },
  F: { w: 0.50, s: [[['M',0.50,0],['L',0,0],['L',0,1]], [['M',0,0.52],['L',0.40,0.52]]] },
  G: { w: 0.70, s: [[['E',0.36,0.5,0.34,0.5,35,360],['L',0.46,0.5]]] },
  H: { w: 0.62, s: [[['M',0,0],['L',0,1]], [['M',0.62,0],['L',0.62,1]], [['M',0,0.5],['L',0.62,0.5]]] },
  I: { w: 0.14, s: [[['M',0.07,0],['L',0.07,1]]] },
  J: { w: 0.50, s: [[['M',0.42,0],['L',0.42,0.75],['E',0.21,0.75,0.21,0.25,0,180]]] },
  K: { w: 0.60, s: [[['M',0,0],['L',0,1]], [['M',0.58,0],['L',0,0.55]], [['M',0,0.55],['L',0.58,1]]] },
  L: { w: 0.50, s: [[['M',0,0],['L',0,1],['L',0.48,1]]] },
  M: { w: 0.82, s: [[['M',0,1],['L',0,0],['L',0.41,0.80],['L',0.82,0],['L',0.82,1]]] },
  N: { w: 0.66, s: [[['M',0,1],['L',0,0],['L',0.66,1],['L',0.66,0]]] },
  O: { w: 0.72, s: [[['E',0.36,0.5,0.36,0.5,0,360]]] },
  P: { w: 0.58, s: [[['M',0,0],['L',0,1]],
                    [['M',0,0],['L',0.31,0],['E',0.31,0.27,0.27,0.27,-90,90],['L',0,0.54]]] },
  Q: { w: 0.72, s: [[['E',0.36,0.5,0.36,0.5,0,360]], [['M',0.50,0.72],['L',0.72,1]]] },
  R: { w: 0.60, s: [[['M',0,0],['L',0,1]],
                    [['M',0,0],['L',0.31,0],['E',0.31,0.27,0.27,0.27,-90,90],['L',0,0.54]],
                    [['M',0.30,0.54],['L',0.60,1]]] },
  S: { w: 0.56, s: [[['E',0.27,0.25,0.25,0.25,-40,-270],['E',0.27,0.75,0.25,0.25,-90,140]]] },
  T: { w: 0.62, s: [[['M',0,0],['L',0.62,0]], [['M',0.31,0],['L',0.31,1]]] },
  U: { w: 0.64, s: [[['M',0,0],['L',0,0.68],['E',0.32,0.68,0.32,0.32,180,0],['L',0.64,0]]] },
  V: { w: 0.70, s: [[['M',0,0],['L',0.35,1],['L',0.70,0]]] },
  W: { w: 0.95, s: [[['M',0,0],['L',0.22,1],['L',0.475,0.22],['L',0.73,1],['L',0.95,0]]] },
  X: { w: 0.62, s: [[['M',0,0],['L',0.62,1]], [['M',0.62,0],['L',0,1]]] },
  Y: { w: 0.66, s: [[['M',0,0],['L',0.33,0.5]], [['M',0.66,0],['L',0.33,0.5]], [['M',0.33,0.5],['L',0.33,1]]] },
  Z: { w: 0.60, s: [[['M',0,0],['L',0.60,0],['L',0,1],['L',0.60,1]]] },
  ' ': { w: 0.40, s: [] },
};

const TRACKING = 0.26;   // space between letters, in cap-height units
const ARC_STEP = 5;      // degrees per arc sample

// flatten one stroke into a polyline (unit space, glyph-local)
function flattenStroke(ops){
  const pts = [];
  for (const op of ops){
    if (op[0] === 'M') pts.push([op[1], op[2]]);
    else if (op[0] === 'L') pts.push([op[1], op[2]]);
    else { // E: cx,cy,rx,ry,a0,a1
      const [,cx,cy,rx,ry,a0,a1] = op;
      const n = Math.max(2, Math.ceil(Math.abs(a1-a0)/ARC_STEP));
      const from = pts.length ? 1 : 0;              // skip duplicate joint point
      for (let i=from; i<=n; i++){
        const a = (a0 + (a1-a0)*i/n) * Math.PI/180;
        pts.push([cx + Math.cos(a)*rx, cy + Math.sin(a)*ry]);
      }
    }
  }
  return pts;
}

// measure a word's advance width in cap-height units
export function wordWidth(word){
  let w = 0;
  for (const ch of word.toUpperCase()){
    const g = GLYPHS[ch]; if (!g) continue;
    w += g.w + TRACKING;
  }
  return Math.max(0, w - TRACKING);
}

// build the word's stroke segments in px space (with cumulative lengths)
function buildSegs(word, size, ox, oy){
  const segs = [];
  let total = 0, advance = 0;
  for (const ch of word.toUpperCase()){
    const g = GLYPHS[ch]; if (!g) continue;
    for (const stroke of g.s){
      const pts = flattenStroke(stroke);
      for (let i=1; i<pts.length; i++){
        const x0 = (advance + pts[i-1][0]) * size + ox, y0 = pts[i-1][1] * size + oy;
        const x1 = (advance + pts[i][0]) * size + ox,   y1 = pts[i][1] * size + oy;
        const len = Math.hypot(x1-x0, y1-y0);
        if (len > 1e-6){ segs.push({x0,y0,x1,y1,len,acc:total}); total += len; }
      }
    }
    advance += g.w + TRACKING;
  }
  return { segs, total };
}

/*  Sample `count` points evenly (by arc length) along the strokes of `word`,
    scaled to cap height `size` px, laid out from (ox, oy) = top-left of the
    text box. Returns [{x,y}, ...] of exactly `count` points.               */
export function sampleWord(word, size, ox, oy, count){
  const { segs, total } = buildSegs(word, size, ox, oy);
  if (!segs.length || count < 1) return [];
  const out = new Array(count);
  const step = total / count;
  let si = 0;
  for (let i=0; i<count; i++){
    const d = (i + 0.5) * step;
    while (si < segs.length-1 && segs[si].acc + segs[si].len < d) si++;
    const s = segs[si], t = Math.min(1, Math.max(0, (d - s.acc) / s.len));
    out[i] = { x: s.x0 + (s.x1-s.x0)*t, y: s.y0 + (s.y1-s.y0)*t };
  }
  return out;
}

// total stroke length of a word at cap height `size` (px) — for choosing particle counts
export function wordLength(word, size){
  return buildSegs(word, size, 0, 0).total;
}
