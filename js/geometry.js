// Mouth geometry: turns lip landmarks into the shapes the preview needs
// (mouth opening, lip outline, and where braces sit along the upper teeth).

// MediaPipe Face Landmarker lip landmark indices, corner to corner.
const LIP = {
  upperInner: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
  lowerInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308],
  upperOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
  lowerOuter: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
};

function interp(pts, u) {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (u <= pts[i][0]) {
      const [u0, v0] = pts[i - 1], [u1, v1] = pts[i];
      return u1 === u0 ? v1 : v0 + ((u - u0) / (u1 - u0)) * (v1 - v0);
    }
  }
  return pts[pts.length - 1][1];
}

// Each contour is a list of [x, y] points running from one mouth corner to the other.
export function makeGeometry(upIn, loIn, upOut, loOut, known = true) {
  if (upIn[0][0] > upIn[upIn.length - 1][0]) [upIn, loIn, upOut, loOut] = [upIn, loIn, upOut, loOut].map(c => [...c].reverse());
  const cL = upIn[0], cR = upIn[upIn.length - 1];
  const dx = cR[0] - cL[0], dy = cR[1] - cL[1], len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const toLocal = ([x, y]) => [((x - cL[0]) * ux + (y - cL[1]) * uy) / len, ((x - cL[0]) * nx + (y - cL[1]) * ny) / len];
  const toImage = (u, v) => [cL[0] + (u * ux + v * nx) * len, cL[1] + (u * uy + v * ny) * len];
  const up = upIn.map(toLocal).sort((p, q) => p[0] - q[0]);
  const lo = loIn.map(toLocal).sort((p, q) => p[0] - q[0]);
  let openness = 0;
  for (let u = 0.1; u <= 0.9; u += 0.05) openness = Math.max(openness, interp(lo, u) - interp(up, u));
  const inner = [...upIn, ...loIn.slice(1, -1).reverse()];
  const outer = [...upOut, ...loOut.slice(1, -1).reverse()];
  const oL = upOut[0], oR = upOut[upOut.length - 1];
  let cx = 0, cy = 0;
  for (const [x, y] of inner) { cx += x; cy += y; }
  return {
    known, inner, outer, up, lo, len, toImage, openness,
    angle: Math.atan2(dy, dx),
    width: Math.hypot(oR[0] - oL[0], oR[1] - oL[1]),
    center: [cx / inner.length, cy / inner.length],
  };
}

export function geometryFromLandmarks(lm, W, H) {
  const P = i => [lm[i].x * W, lm[i].y * H];
  return makeGeometry(LIP.upperInner.map(P), LIP.lowerInner.map(P), LIP.upperOuter.map(P), LIP.lowerOuter.map(P));
}

// Where to draw brackets on the upper teeth. offset (-12..12) nudges them up or down.
export function bracePositions(g, offset = 0, n = 10) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const u = 0.5 + 0.44 * Math.sin(Math.PI * (t - 0.5)); // closer together toward the corners, like a curved arch
    const vu = interp(g.up, u), vl = interp(g.lo, u);
    const v = vu + Math.max(0, vl - vu) * 0.42 + offset * 0.012;
    const slope = (interp(g.up, u + 0.02) - interp(g.up, u - 0.02)) / 0.04;
    const [x, y] = g.toImage(u, v);
    const s = g.width * 0.062 * (0.72 + 0.28 * Math.cos(Math.PI * (t - 0.5)));
    out.push({ x, y, s, angle: g.angle + Math.atan(slope) * 0.5 });
  }
  return out;
}

// Rough mouth placement used when no face is found in a photo.
export function fallbackGeometry(W, H) {
  const w = Math.min(W, H) * 0.3, cx = W / 2, cy = H * 0.62, n = 11;
  const pts = k => Array.from({ length: n }, (_, i) => { const u = i / (n - 1); return [cx - w / 2 + u * w, cy + k * w * Math.sin(Math.PI * u)]; });
  return makeGeometry(pts(-0.1), pts(0.22), pts(-0.2), pts(0.32), false);
}

// The built-in sample smile (see #sample-art), drawn at the given scale.
export function sampleGeometry(scale) {
  const n = 13, q = (p0, p1, p2, t) => (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
  const c = (p0, p1, p2, p3, t) => (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3;
  const upper = Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [q(242, 300, 358, t), q(397, 357, 397, t)]; });
  const lower = [];
  for (let i = 0; i < 7; i++) { const t = i / 6; lower.push([c(242, 247, 272, 300, t), c(397, 438, 461, 461, t)]); }
  for (let i = 1; i < 7; i++) { const t = i / 6; lower.push([c(300, 328, 353, 358, t), c(461, 461, 438, 397, t)]); }
  const s = pts => pts.map(([x, y]) => [x * scale, y * scale]);
  const grow = pts => pts.map(([x, y]) => [300 + (x - 300) * 1.18, 412 + (y - 412) * 1.25]);
  return makeGeometry(s(upper), s(lower), s(grow(upper)), s(grow(lower)));
}
