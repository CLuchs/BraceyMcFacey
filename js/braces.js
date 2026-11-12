// Image-processing helpers for the braces preview.
// Everything here works on plain pixel arrays (no DOM access), so it can be tested in Node.

// ---------- Color conversion (sRGB <-> CIELAB, D65) ----------
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const finv = t => { const t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; };
const toByte = c => {
  c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return c <= 0 ? 0 : c >= 1 ? 255 : Math.round(c * 255);
};
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function rgbToLab(r, g, b, out = [0, 0, 0]) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const fx = f(x), fy = f(y), fz = f(z);
  out[0] = 116 * fy - 16; out[1] = 500 * (fx - fy); out[2] = 200 * (fy - fz);
  return out;
}

export function labToRgb(L, a, b, out = [0, 0, 0]) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const x = finv(fx) * 0.95047, y = finv(fy), z = finv(fz) * 1.08883;
  out[0] = toByte(x * 3.2406 + y * -1.5372 + z * -0.4986);
  out[1] = toByte(x * -0.9689 + y * 1.8758 + z * 0.0415);
  out[2] = toByte(x * 0.0557 + y * -0.204 + z * 1.057);
  return out;
}

export function hexToLab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [L, a, b] = rgbToLab((n >> 16) & 255, (n >> 8) & 255, n & 255);
  return { L, a, b };
}

// ---------- Polygons ----------
export function scalePolygon(poly, k) {
  let cx = 0, cy = 0;
  for (const [x, y] of poly) { cx += x; cy += y; }
  cx /= poly.length; cy /= poly.length;
  return poly.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

// Rasterizes a polygon into a 0/1 mask covering the box (x0, y0, w, h).
export function fillPolygon(poly, x0, y0, w, h) {
  const m = new Uint8Array(w * h), n = poly.length, xs = [];
  for (let j = 0; j < h; j++) {
    const y = y0 + j + 0.5;
    xs.length = 0;
    for (let i = 0, k = n - 1; i < n; k = i++) {
      const [xi, yi] = poly[i], [xk, yk] = poly[k];
      if ((yi > y) !== (yk > y)) xs.push(xi + ((y - yi) / (yk - yi)) * (xk - xi));
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const a = Math.max(0, Math.ceil(xs[q] - 0.5 - x0)), b = Math.min(w - 1, Math.floor(xs[q + 1] - 0.5 - x0));
      for (let x = a; x <= b; x++) m[j * w + x] = 1;
    }
  }
  return m;
}

// ---------- Mouth region ----------
// Converts the pixels around the mouth to Lab and records which are inside the mouth opening
// (where braces are visible) and which are lips (used as a "not a band" reference color).
export function buildRegion(data, W, H, geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of geom.outer) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const pad = Math.ceil(geom.width * 0.05);
  const x0 = clamp(Math.floor(minX) - pad, 0, W - 1), y0 = clamp(Math.floor(minY) - pad, 0, H - 1);
  const w = clamp(Math.ceil(maxX) + pad, 1, W) - x0, h = clamp(Math.ceil(maxY) + pad, 1, H) - y0;
  const inside = fillPolygon(scalePolygon(geom.inner, 1.06), x0, y0, w, h);
  const innerRaw = fillPolygon(geom.inner, x0, y0, w, h);
  const outer = fillPolygon(geom.outer, x0, y0, w, h);
  const L = new Float32Array(w * h), A = new Float32Array(w * h), B = new Float32Array(w * h), lip = new Uint8Array(w * h);
  const lab = [0, 0, 0];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const idx = j * w + i, p = ((y0 + j) * W + x0 + i) * 4;
    rgbToLab(data[p], data[p + 1], data[p + 2], lab);
    L[idx] = lab[0]; A[idx] = lab[1]; B[idx] = lab[2];
    lip[idx] = outer[idx] && !innerRaw[idx] ? 1 : 0;
  }
  // core: the mouth opening itself, used for automatic detection (keeps lip-edge pixels out).
  // inside: slightly larger, used for manual taps and recoloring.
  return { x0, y0, w, h, inside, core: innerRaw, lip, L, A, B, mouthW: geom.width };
}

const median = arr => { if (!arr.length) return 0; const s = Float32Array.from(arr).sort(); return s[s.length >> 1]; };

export function regionStats(r) {
  const lipL = [], lipA = [], lipB = [], teeth = [], dark = [];
  for (let i = 0; i < r.L.length; i++) {
    if (r.lip[i]) { lipL.push(r.L[i]); lipA.push(r.A[i]); lipB.push(r.B[i]); }
    else if (r.core[i] && r.L[i] < 30) dark.push(i);
    else if (r.core[i] && Math.hypot(r.A[i], r.B[i]) < 22) teeth.push(i);
  }
  // Teeth: the brightest 40% of the low-color pixels inside the mouth.
  teeth.sort((p, q) => r.L[q] - r.L[p]);
  const top = teeth.slice(0, Math.max(1, Math.round(teeth.length * 0.4)));
  const lip = lipL.length ? { L: median(lipL), a: median(lipA), b: median(lipB) } : null;
  const teethRef = top.length ? { L: median(top.map(i => r.L[i])), a: median(top.map(i => r.A[i])), b: median(top.map(i => r.B[i])) } : { L: 80, a: 0, b: 8 };
  // Dark inside of the mouth (shadows, tongue at the back), only if there is a fair amount of it.
  const darkRef = dark.length > (r.mouthW * 0.05) ** 2 ? { L: median(dark.map(i => r.L[i])), a: median(dark.map(i => r.A[i])), b: median(dark.map(i => r.B[i])) } : null;
  return { lip, teeth: teethRef, dark: darkRef };
}

// ---------- Band detection ----------
// Colors are compared in Lab with lightness down-weighted: shading changes a band's lightness
// far more than its hue.
const dist = (L, a, b, ref) => Math.hypot((L - ref.L) * 0.4, a - ref.a, b - ref.b);

const HUE_BINS = 24;
const hueBin = (a, b) => { const h = Math.atan2(b, a); return ((Math.floor(((h + Math.PI) / (2 * Math.PI)) * HUE_BINS) % HUE_BINS) + HUE_BINS) % HUE_BINS; };
const binDist = (p, q) => { const d = Math.abs(p - q) % HUE_BINS; return Math.min(d, HUE_BINS - d); };

// Lips, gums and skin share a band of red-orange hues. A pixel in that hue range only counts as a
// possible band when it is clearly more saturated than the lips.
const SKIN_SECTOR = Math.PI * 35 / 180;
function looksLikeGum(st, a, b) {
  const lipHue = st.lip ? Math.atan2(st.lip.b, st.lip.a) : 0.55, lipC = st.lip ? Math.hypot(st.lip.a, st.lip.b) : 25;
  let d = Math.abs(Math.atan2(b, a) - lipHue);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d < SKIN_SECTOR && Math.hypot(a, b) < lipC * 1.3 + 6;
}

// Stained or warm-toned teeth look like pale yellow. A pixel near the teeth's own hue only counts
// as a possible band when it is much more saturated than the teeth.
function looksLikeTooth(st, a, b) {
  const tC = Math.hypot(st.teeth.a, st.teeth.b), C = Math.hypot(a, b);
  if (Math.hypot(a - st.teeth.a, b - st.teeth.b) < 11) return true;
  if (tC < 4) return false;
  let d = Math.abs(Math.atan2(b, a) - Math.atan2(st.teeth.b, st.teeth.a));
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d < Math.PI / 6 && C < tC * 1.5 + 22;
}

// A pixel that is clearly not teeth, lips/gums, bare metal or shadow.
function isColorful(r, st, i) {
  const L = r.L[i], a = r.A[i], b = r.B[i];
  if (L < 20 || Math.hypot(a, b) < 8 || looksLikeGum(st, a, b)) return false;
  if (looksLikeTooth(st, a, b)) return false;
  if (st.lip && dist(L, a, b, st.lip) < 12) return false;
  if (st.dark && dist(L, a, b, st.dark) < 10) return false;
  return true;
}

// Candidate band colors: colorful pixels in the mouth opening, grouped by hue.
// Returns up to four Lab colors, strongest first; detectBands() decides which are really bands.
// Clear, white, gray and black bands are not colorful enough to separate this way.
export function autoDetectRefs(r, st) {
  const cands = [];
  for (let i = 0; i < r.L.length; i++) if (r.core[i] && isColorful(r, st, i)) cands.push(i);
  const minCount = Math.max(8, (r.mouthW * 0.015) ** 2 * 3);
  if (cands.length < minCount) return [];
  const hist = new Float32Array(HUE_BINS), bins = new Uint8Array(cands.length);
  cands.forEach((i, k) => { bins[k] = hueBin(r.A[i], r.B[i]); hist[bins[k]] += Math.hypot(r.A[i] - st.teeth.a, r.B[i] - st.teeth.b); });
  const smooth = p => hist[(p + HUE_BINS - 1) % HUE_BINS] + hist[p] + hist[(p + 1) % HUE_BINS];
  const refs = [], peaks = [];
  let firstWeight = 0;
  for (let round = 0; round < 5; round++) {
    let best = -1, bestW = 0;
    for (let p = 0; p < HUE_BINS; p++) {
      if (peaks.some(q => binDist(p, q) < 3)) continue;
      const w = smooth(p);
      if (w > bestW) { bestW = w; best = p; }
    }
    if (best < 0 || (round > 0 && bestW < firstWeight * 0.03)) break;
    if (round === 0) firstWeight = bestW;
    peaks.push(best);
    const sel = cands.filter((_, k) => binDist(bins[k], best) <= 1);
    if (sel.length < minCount / 2) continue;
    refs.push({ L: median(sel.map(i => r.L[i])), a: median(sel.map(i => r.A[i])), b: median(sel.map(i => r.B[i])) });
  }
  return refs;
}

export const isNeutral = ref => Math.hypot(ref.a, ref.b) < 8;

// A tapped band color too close to gums, lips or teeth to match safely by color.
export const isConfusable = (st, ref) => looksLikeGum(st, ref.a, ref.b) || looksLikeTooth(st, ref.a, ref.b);

// Average Lab color in a small disc around (x, y) in image coordinates.
export function sampleLab(r, x, y, radius) {
  let n = 0, L = 0, a = 0, b = 0;
  const cx = x - r.x0, cy = y - r.y0, rr = Math.max(1, radius);
  for (let j = Math.floor(cy - rr); j <= Math.ceil(cy + rr); j++) for (let i = Math.floor(cx - rr); i <= Math.ceil(cx + rr); i++) {
    if (i < 0 || j < 0 || i >= r.w || j >= r.h || Math.hypot(i - cx, j - cy) > rr) continue;
    const idx = j * r.w + i; n++; L += r.L[idx]; a += r.A[idx]; b += r.B[idx];
  }
  return n ? { L: L / n, a: a / n, b: b / n } : null;
}

export function isInside(r, x, y) {
  const i = Math.floor(x - r.x0), j = Math.floor(y - r.y0);
  return i >= 0 && j >= 0 && i < r.w && j < r.h && r.inside[j * r.w + i] === 1;
}

const BASE_TOL = 18;

// Marks mouth pixels that are closer to a band color than to teeth, lips, shadow or bare metal,
// then keeps only band-sized blobs. scale (about 0.4-1.7) loosens or tightens the match.
// strict (automatic detection) also rules out gum-like and tooth-like colors; when the person
// tapped a band themselves we trust that color instead.
export function matchMask(r, refs, st, scale = 1, strict = false) {
  const { w, h } = r, m = new Uint8Array(w * h), tol = BASE_TOL * scale;
  for (let i = 0; i < m.length; i++) {
    if (!r.core[i]) continue;
    const L = r.L[i], a = r.A[i], b = r.B[i];
    let best = Infinity;
    for (const ref of refs) best = Math.min(best, dist(L, a, b, ref));
    if (best >= tol) continue;
    if (best >= dist(L, a, b, st.teeth) || best >= Math.hypot(a, b) * 1.1) continue;
    if (strict && (looksLikeGum(st, a, b) || looksLikeTooth(st, a, b))) continue;
    if (st.lip && best >= dist(L, a, b, st.lip)) continue;
    if (st.dark && best >= dist(L, a, b, st.dark)) continue;
    m[i] = 1;
  }
  const minA = Math.max(3, (r.mouthW * 0.01) ** 2), maxA = r.mouthW * r.mouthW * 0.02;
  const depth = edgeDepth(r), deep = Math.max(1.5, r.mouthW * 0.025);
  const seen = new Uint8Array(w * h), stack = [], comp = [];
  let count = 0, kept = 0, total = 0, minX = Infinity, maxX = -Infinity;
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || seen[s]) continue;
    comp.length = 0; stack.push(s); seen[s] = 1;
    let sx = 0, nDeep = 0;
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p - x) / w;
      comp.push(p); sx += x; if (depth[p] >= deep) nDeep++;
      if (x > 0 && m[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < w - 1 && m[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && m[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
      if (y < h - 1 && m[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
    }
    total += comp.length;
    // Too small, too big, or hugging the lip edge (gums, lip shine): not a band.
    if (comp.length < minA || comp.length > maxA || nDeep < comp.length * 0.3) { for (const p of comp) m[p] = 0; continue; }
    count++; kept += comp.length;
    const cx = sx / comp.length; minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
  }
  return { mask: m, count, kept, total, spread: count ? maxX - minX : 0 };
}

// Distance (in pixels, approximate) from each mouth-opening pixel to the lip edge.
function edgeDepth(r) {
  if (r.depth) return r.depth;
  const { w, h } = r, d = new Float32Array(w * h), D = 1, E = 1.41;
  for (let i = 0; i < d.length; i++) d[i] = r.core[i] ? 1e6 : 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const p = j * w + i; if (!d[p]) continue;
    let v = d[p];
    if (i > 0) v = Math.min(v, d[p - 1] + D); else v = Math.min(v, D);
    if (j > 0) { v = Math.min(v, d[p - w] + D); if (i > 0) v = Math.min(v, d[p - w - 1] + E); if (i < w - 1) v = Math.min(v, d[p - w + 1] + E); } else v = Math.min(v, D);
    d[p] = v;
  }
  for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) {
    const p = j * w + i; if (!d[p]) continue;
    let v = d[p];
    if (i < w - 1) v = Math.min(v, d[p + 1] + D); else v = Math.min(v, D);
    if (j < h - 1) { v = Math.min(v, d[p + w] + D); if (i < w - 1) v = Math.min(v, d[p + w + 1] + E); if (i > 0) v = Math.min(v, d[p + w - 1] + E); } else v = Math.min(v, D);
    d[p] = v;
  }
  r.depth = d;
  return d;
}

// Picks the candidate colors that look like bands: several separate band-sized spots spread
// across the smile, rather than one big area (tongue, gums, lips, mouth corners).
// Combines up to two colors for alternating bands.
export function detectBands(r, st, scale = 1) {
  const good = [];
  for (const ref of autoDetectRefs(r, st)) {
    const res = matchMask(r, [ref], st, scale, true);
    if (res.count >= 3 && res.kept >= res.total * 0.5 && res.spread >= r.mouthW * 0.25) good.push({ ref, score: res.kept });
  }
  if (!good.length) return null;
  good.sort((p, q) => q.score - p.score);
  const refs = good.slice(0, 2).filter((g, i) => i === 0 || g.score >= good[0].score * 0.25).map(g => g.ref);
  return { refs, strict: true, ...matchMask(r, refs, st, scale, true) };
}

// Combines the automatic mask with the person's taps. "add" paints a band-shaped ring
// (leaving the metal bracket in the middle alone); "remove" clears a disc.
export function composeAlpha(r, mask, edits) {
  const { w, h } = r, alpha = new Float32Array(w * h);
  for (let i = 0; i < mask.length; i++) alpha[i] = mask[i];
  for (const e of edits) {
    const cx = e.x - r.x0, cy = e.y - r.y0, R = e.type === 'add' ? e.r : e.r * 1.15;
    for (let j = Math.max(0, Math.floor(cy - R)); j <= Math.min(h - 1, Math.ceil(cy + R)); j++)
      for (let i = Math.max(0, Math.floor(cx - R)); i <= Math.min(w - 1, Math.ceil(cx + R)); i++) {
        const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy), idx = j * w + i;
        if (e.type === 'add') { if (d <= R && d >= R * 0.42 && r.inside[idx]) alpha[idx] = 1; }
        else if (d <= R) alpha[idx] = 0;
      }
  }
  // Soften edges so the new color blends into the photo.
  const tmp = new Float32Array(w * h);
  for (let pass = 0; pass < 1; pass++) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const x = i + di, y = j + dj;
        if (x >= 0 && y >= 0 && x < w && y < h) { s += alpha[y * w + x]; n++; }
      }
      tmp[j * w + i] = s / n;
    }
    alpha.set(tmp);
  }
  for (let i = 0; i < alpha.length; i++) if (!r.inside[i]) alpha[i] = 0; else alpha[i] = Math.min(1, alpha[i] * 1.25);
  return alpha;
}

// Repaints the masked pixels in the target color while keeping the photo's own shading:
// each pixel keeps its lightness difference from the average band, and bright highlights
// stay shiny instead of being flooded with color.
export function recolor(data, W, r, alpha, target) {
  let sum = 0, n = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i] > 0.5) { sum += r.L[i]; n++; }
  const meanL = n ? sum / n : 50, rgb = [0, 0, 0];
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const idx = j * r.w + i, a = alpha[idx];
    if (a < 0.02) continue;
    const L0 = r.L[idx], d = L0 - meanL;
    let nl = clamp(target.L + d * 0.7, 2, 99);
    const shine = d > 12 ? clamp(1 - (d - 12) / 25, 0, 1) : 1;
    let na = target.a * shine, nb = target.b * shine;
    if (target.translucent) { nl = nl * 0.55 + L0 * 0.45; na = na * 0.55 + r.A[idx] * 0.2; nb = nb * 0.55 + r.B[idx] * 0.2; }
    labToRgb(nl, na, nb, rgb);
    const p = ((r.y0 + j) * W + r.x0 + i) * 4;
    data[p] = data[p] + (rgb[0] - data[p]) * a;
    data[p + 1] = data[p + 1] + (rgb[1] - data[p + 1]) * a;
    data[p + 2] = data[p + 2] + (rgb[2] - data[p + 2]) * a;
  }
}

// ---------- Drawing virtual braces (canvas 2D context passed in) ----------
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function drawBrace(ctx, x, y, s, angle, color) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  const m = s * 0.62;
  const g = ctx.createLinearGradient(0, -m / 2, 0, m / 2);
  g.addColorStop(0, '#f4f5f6'); g.addColorStop(0.5, '#a9aeb4'); g.addColorStop(1, '#e2e4e7');
  roundRectPath(ctx, -m / 2, -m / 2, m, m, m * 0.18); ctx.fillStyle = g; ctx.fill();
  ctx.fillStyle = '#6d7277'; ctx.fillRect(-m / 2, -m * 0.09, m, m * 0.18);
  ctx.lineWidth = s * 0.17; ctx.strokeStyle = color;
  roundRectPath(ctx, -s * 0.41, -s * 0.41, s * 0.82, s * 0.82, s * 0.3); ctx.stroke();
  ctx.lineWidth = s * 0.05; ctx.strokeStyle = 'rgba(255,255,255,.45)';
  ctx.beginPath(); ctx.arc(-s * 0.1, -s * 0.1, s * 0.33, Math.PI * 1.05, Math.PI * 1.45); ctx.stroke();
  ctx.restore();
}

// Draws the archwire and brackets, clipped to the mouth opening when one is given.
export function drawArch(ctx, positions, color, clipPoly) {
  if (!positions.length) return;
  ctx.save();
  if (clipPoly) {
    ctx.beginPath();
    clipPoly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath(); ctx.clip();
  }
  const s = Math.max(...positions.map(p => p.s));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [width, style] of [[s * 0.16, 'rgba(70,74,80,.55)'], [s * 0.1, '#dfe2e5']]) {
    ctx.beginPath();
    positions.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.lineWidth = width; ctx.strokeStyle = style; ctx.stroke();
  }
  for (const p of positions) drawBrace(ctx, p.x, p.y, p.s, p.angle, color);
  ctx.restore();
}
