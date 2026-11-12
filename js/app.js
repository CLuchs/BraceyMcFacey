import { hexToLab, buildRegion, regionStats, detectBands, matchMask, composeAlpha, recolor, sampleLab, isInside, isNeutral, isConfusable, drawArch } from './braces.js';
import { geometryFromLandmarks, fallbackGeometry, sampleGeometry, bracePositions } from './geometry.js';
import { preloadFaceFinder, findLandmarks } from './face.js';

// Approximate swatch colors, in the order of the standard orthodontic color chart.
const colors = [['Clear', '#f1f0eb'], ['White', '#fffdf8'], ['Pearl', '#e8e4d8'], ['Gold Rush', '#eabf00'], ['Silver', '#b9bec4'], ['Gray', '#77777b'], ['Black', '#17171a'], ['Burgundy', '#641224'], ['Red', '#cf161e'], ['Fire Red', '#ed171d'], ['Dark Orange', '#df4815'], ['Orange', '#f47718'], ['Yellow', '#f5e500'], ['Lime', '#a6cf1d'], ['Shamrock', '#15a94c'], ['Green', '#008b49'], ['Aqua', '#21c2b5'], ['Teal', '#00a6a4'], ['Light Blue', '#20b6e8'], ['Royal Blue', '#064db5'], ['Navy', '#092768'], ['Rose', '#d51a58'], ['Pink', '#f14b8c'], ['Coral', '#f47672'], ['Bubblegum', '#f594c5'], ['Lilac', '#a976cc'], ['Purple', '#7132a4'], ['Lavender', '#9a84dc']].map(([name, hex]) => ({ name, hex }));
const SAMPLE_CURRENT = colors.find(c => c.name === 'Royal Blue');
const SAMPLE_SCALE = 2;
const MAX_SIDE = 1280;
const EXPIRY_MS = 2 * 60 * 60 * 1000;
const DEFAULT_TOL = 24; // slider position; match strength = value / 24

const $ = id => document.getElementById(id);
const stage = $('stage'), view = $('view'), video = $('video');

const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } },
};

const state = {
  mode: storage.get('bmf-mode') === 'new' ? 'new' : 'have',
  color: colors[0],
  photo: null,     // the image being previewed (sample or selfie)
  zoom: true,
  before: false,
  picked: false,   // recolor mode: has the person chosen a new color for this photo yet?
  tool: 'match',
  offset: 0,
  token: 0,        // guards against out-of-order async photo processing
};
let stream = null, expiryTimer = null, toastTimer = null, sampleArt = null;

// ---------- small UI helpers ----------
function showToast(message) {
  $('toast').textContent = message; $('toast').classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200);
}
const setStatus = message => { $('selfie-status').textContent = message; };
const privacyAccepted = () => {
  if ($('privacy-modal').classList.contains('hidden')) return true;
  showToast('Please read and accept the privacy note first.'); return false;
};

function renderPalette() {
  const root = $('palette'); root.innerHTML = '';
  for (const color of colors) {
    const button = document.createElement('button');
    const on = state.color.name === color.name && (state.mode === 'new' || state.picked);
    button.type = 'button'; button.className = 'color' + (on ? ' selected' : '');
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', `Try ${color.name}`);
    button.innerHTML = `<span class="chip" style="background:${color.hex}"></span><span class="color-name">${color.name}</span>`;
    button.addEventListener('click', () => selectColor(color));
    root.append(button);
  }
}

function selectColor(color) {
  state.color = color; state.before = false; state.picked = true;
  if (state.photo) state.photo.outKey = null;
  renderPalette(); updateControls(); render();
}

// ---------- image loading ----------
function toWorkingCanvas(source, w, h) {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function fileToCanvas(file) {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const canvas = toWorkingCanvas(bitmap, bitmap.width, bitmap.height); bitmap.close(); return canvas;
    } catch { /* fall back to <img> decoding below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    return toWorkingCanvas(img, img.naturalWidth, img.naturalHeight);
  } finally { URL.revokeObjectURL(url); }
}

async function loadSampleArt() {
  if (sampleArt) return sampleArt;
  const svg = $('sample-art').innerHTML.trim();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image(); img.src = url; await img.decode();
    sampleArt = document.createElement('canvas');
    sampleArt.width = 600 * SAMPLE_SCALE; sampleArt.height = 700 * SAMPLE_SCALE;
    sampleArt.getContext('2d').drawImage(img, 0, 0, sampleArt.width, sampleArt.height);
    return sampleArt;
  } finally { URL.revokeObjectURL(url); }
}

// ---------- photo pipeline ----------
// The sample smile gets "current" braces drawn on in recolor mode, so it can demonstrate recoloring.
async function useSample() {
  const art = await loadSampleArt(), geom = sampleGeometry(SAMPLE_SCALE);
  const canvas = document.createElement('canvas');
  canvas.width = art.width; canvas.height = art.height;
  const ctx = canvas.getContext('2d'); ctx.drawImage(art, 0, 0);
  if (state.mode === 'have') drawArch(ctx, bracePositions(geom), SAMPLE_CURRENT.hex, geom.inner);
  setPhoto(canvas, 'sample', geom);
}

async function usePhoto(canvas) {
  const token = ++state.token;
  stopCamera();
  setStatus('Finding your smile…');
  stage.classList.add('busy');
  let geom = null;
  try {
    const lm = await findLandmarks(canvas);
    if (lm) geom = geometryFromLandmarks(lm, canvas.width, canvas.height);
  } catch (error) {
    console.warn('Face finder unavailable', error);
  }
  if (token !== state.token) return;
  stage.classList.remove('busy');
  setPhoto(canvas, 'photo', geom);
  clearTimeout(expiryTimer);
  expiryTimer = setTimeout(() => clearSelfie(), EXPIRY_MS);
}

function setPhoto(canvas, kind, geom) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const photo = {
    kind, canvas, geom, W: canvas.width, H: canvas.height,
    base: ctx.getImageData(0, 0, canvas.width, canvas.height),
    region: null, stats: null, refs: [], mask: null, edits: [], tol: DEFAULT_TOL,
    out: null, outKey: null, maskVersion: 0,
  };
  state.photo = photo; state.before = false; state.picked = false; state.zoom = true; state.offset = 0;
  $('position').value = '0';
  if (geom) {
    photo.region = buildRegion(photo.base.data, photo.W, photo.H, geom);
    photo.stats = regionStats(photo.region);
  }
  const isSelfie = kind === 'photo';
  $('preview-tag').textContent = isSelfie ? 'YOUR SELFIE' : 'SAMPLE SMILE';
  $('take-selfie').textContent = isSelfie ? 'Retake selfie' : 'Take selfie';
  $('upload-selfie').textContent = isSelfie ? 'Upload a different photo' : 'Upload photo';
  $('hint').classList.toggle('hidden', true);
  analyze();
  renderPalette(); updateControls(); render();
}

// Recolor mode: look for the current bands automatically.
function analyze() {
  const p = state.photo;
  if (!p) return;
  if (state.mode === 'new') { setStatus(newModeStatus()); return; }
  p.refs = []; p.mask = null; p.edits = []; p.tol = DEFAULT_TOL; p.outKey = null;
  $('tolerance').value = String(DEFAULT_TOL);
  if (!p.geom) {
    setStatus('We couldn’t find a smile in this photo. Try a closer, well-lit photo with your teeth and braces showing.');
    return;
  }
  const found = detectBands(p.region, p.stats, p.tol / DEFAULT_TOL);
  if (found) { p.refs = found.refs; p.mask = found.mask; p.strict = true; }
  p.maskVersion++;
  state.tool = 'match';
  if (p.mask) setStatus(`${p.kind === 'sample' ? 'This sample has blue bands. ' : ''}We found your current bands. Tap a color to try it. Missed a band? Use the tools below.`);
  else if (p.geom.openness < 0.1) setStatus('Your teeth aren’t showing much. Smile wide so your braces show, then retake the photo.');
  else setStatus('We couldn’t spot your bands automatically. Tap “Match color”, then tap one of your bands. For clear, white, gray or black bands, use “Add band” and tap each one.');
}

function newModeStatus() {
  const p = state.photo;
  if (!p) return '';
  if (p.kind === 'sample') return 'Using the sample smile. Take a selfie whenever you are ready.';
  if (!p.geom) return 'We couldn’t find a smile, so the braces are in a rough spot. Use the slider to line them up.';
  return 'Selfie ready. Pick a color, and use the slider if the braces need nudging.';
}

function ensureOutput() {
  const p = state.photo, key = `${state.color.name}|${p.maskVersion}|${p.edits.length}`;
  if (p.out && p.outKey === key) return p.out;
  const out = new ImageData(new Uint8ClampedArray(p.base.data), p.W, p.H);
  const hasEdits = p.mask || p.edits.length;
  if (p.region && hasEdits) {
    const mask = p.mask ?? new Uint8Array(p.region.w * p.region.h);
    const alpha = composeAlpha(p.region, mask, p.edits);
    const target = { ...hexToLab(state.color.hex), translucent: state.color.name === 'Clear' };
    recolor(out.data, p.W, p.region, alpha, target);
  }
  if (!p.out) { p.out = document.createElement('canvas'); p.out.width = p.W; p.out.height = p.H; }
  p.out.getContext('2d').putImageData(out, 0, 0);
  p.outKey = key;
  return p.out;
}

// ---------- rendering ----------
function viewRect() {
  const p = state.photo, cw = view.width, ch = view.height, asp = cw / ch;
  let w, h, cx, cy;
  if (state.zoom && p.geom) {
    w = Math.min(p.W, p.geom.width * (state.mode === 'have' ? 1.5 : 2.6)); h = w / asp;
    if (h > p.H) { h = p.H; w = h * asp; }
    [cx, cy] = p.geom.center;
  } else {
    if (p.W / p.H > asp) { h = p.H; w = h * asp; } else { w = p.W; h = w / asp; }
    cx = p.W / 2; cy = p.H / 2;
  }
  return { x: Math.min(Math.max(0, cx - w / 2), p.W - w), y: Math.min(Math.max(0, cy - h / 2), p.H - h), w, h };
}

function render() {
  const p = state.photo;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.round(stage.clientWidth * dpr), ch = Math.round(stage.clientHeight * dpr);
  if (view.width !== cw || view.height !== ch) { view.width = cw; view.height = ch; }
  const ctx = view.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  if (!p) return;
  const r = viewRect(), k = cw / r.w;
  ctx.setTransform(k, 0, 0, k, -r.x * k, -r.y * k);
  ctx.imageSmoothingQuality = 'high';
  if (state.mode === 'have') {
    ctx.drawImage(state.before || !state.picked || !p.region ? p.canvas : ensureOutput(), 0, 0);
  } else {
    ctx.drawImage(p.canvas, 0, 0);
    const geom = p.geom ?? fallbackGeometry(p.W, p.H);
    drawArch(ctx, bracePositions(geom, state.offset), state.color.hex, p.geom ? geom.inner : null);
  }
  const label = state.mode === 'have' && (state.before || !state.picked) ? 'Your current bands' : `${state.color.name} ${state.mode === 'have' ? 'bands' : 'braces'} preview`;
  $('caption').textContent = label;
  view.setAttribute('aria-label', label);
}

function updateControls() {
  const p = state.photo, have = state.mode === 'have';
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  $('mode-copy').textContent = have
    ? 'We’ll find the bands on your braces and show them in a new color.'
    : 'We’ll add virtual braces to your smile.';
  const canEdit = have && p && p.region;
  $('recolor-tools').classList.toggle('hidden', !canEdit);
  $('position-tools').classList.toggle('hidden', have);
  $('tools-card').classList.toggle('hidden', have && !canEdit);
  $('zoom').classList.toggle('hidden', !(p && p.geom));
  $('zoom').textContent = state.zoom ? 'Show full photo' : 'Zoom to smile';
  $('compare').classList.toggle('hidden', !(canEdit && state.picked));
  $('compare').setAttribute('aria-pressed', String(state.before));
  $('compare').textContent = state.before ? 'Show new color' : 'Show current color';
  for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === state.tool));
  $('undo').disabled = !(p && p.edits.length);
  stage.classList.toggle('tappable', Boolean(canEdit) && !state.before);
}

// ---------- recolor-mode taps ----------
function toImagePoint(event) {
  const rect = view.getBoundingClientRect(), r = viewRect();
  return [r.x + ((event.clientX - rect.left) / rect.width) * r.w, r.y + ((event.clientY - rect.top) / rect.height) * r.h];
}

function handleTap(x, y) {
  const p = state.photo, region = p.region;
  if (!isInside(region, x, y)) { showToast('Tap a band inside your smile.'); return; }
  if (state.tool === 'match') {
    const ref = sampleLab(region, x, y, Math.max(1.5, region.mouthW * 0.008));
    if (!ref) return;
    if (isNeutral(ref) || ref.L < 20) {
      state.tool = 'add'; updateControls();
      showToast('That color blends in with teeth and shadows. Tap each band to mark it instead.');
      return;
    }
    if (isConfusable(p.stats, ref)) {
      state.tool = 'add'; updateControls();
      showToast('That color is very close to your gums, lips or teeth, so matching it could spill over. Tap each band to mark it instead.');
      return;
    }
    const { mask, count } = matchMask(region, [ref], p.stats, p.tol / DEFAULT_TOL);
    p.refs = [ref]; p.mask = mask; p.strict = false; p.maskVersion++;
    setStatus(count ? 'Matched your band color. Missed or extra spots? Use Add band or Remove.' : 'No bands matched that color. Try a looser match, or use Add band.');
  } else {
    p.edits.push({ type: state.tool === 'add' ? 'add' : 'remove', x, y, r: region.mouthW * 0.05 });
  }
  state.before = false; state.picked = true;
  renderPalette(); updateControls(); render();
}

view.addEventListener('pointerdown', event => {
  const p = state.photo;
  if (state.mode !== 'have' || !p?.region || state.before || stage.classList.contains('video-on')) return;
  const [x, y] = toImagePoint(event);
  handleTap(x, y);
});

// ---------- camera ----------
function stopCamera() {
  if (stream) { stream.getTracks().forEach(track => track.stop()); stream = null; }
  video.srcObject = null;
  stage.classList.remove('video-on');
  $('capture').classList.add('hidden'); $('cancel-camera').classList.add('hidden'); $('take-selfie').classList.remove('hidden');
}

async function startCamera() {
  if (!privacyAccepted()) return;
  if (!navigator.mediaDevices?.getUserMedia) { $('camera-file').click(); return; }
  try {
    stopCamera();
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
    video.srcObject = stream;
    stage.classList.add('video-on');
    $('hint').textContent = state.mode === 'have' ? 'Smile wide so your braces show' : 'Smile wide and center your face';
    $('hint').classList.remove('hidden');
    setStatus('Camera on. Tap “Snap photo” when you are ready.');
    $('take-selfie').classList.add('hidden'); $('capture').classList.remove('hidden'); $('cancel-camera').classList.remove('hidden');
  } catch (error) {
    stopCamera(); $('hint').classList.add('hidden');
    if (error?.name === 'NotAllowedError') showToast('Camera access was blocked. You can upload a photo instead.');
    else $('camera-file').click();
  }
}

function clearSelfie(message = 'Your selfie was cleared for privacy. Take another whenever you like.') {
  state.token++;
  stopCamera(); clearTimeout(expiryTimer);
  const p = state.photo;
  if (p && p.kind === 'photo') { p.canvas.width = 0; if (p.out) p.out.width = 0; }
  state.photo = null;
  $('hint').classList.add('hidden');
  stage.classList.remove('busy');
  useSample().then(() => setStatus(message));
}

// ---------- wiring ----------
$('accept-privacy').addEventListener('click', () => {
  $('privacy-modal').classList.add('hidden');
  preloadFaceFinder().catch(error => console.warn('Face finder unavailable', error));
});
$('take-selfie').addEventListener('click', startCamera);
$('cancel-camera').addEventListener('click', () => { stopCamera(); $('hint').classList.add('hidden'); setStatus('Camera closed.'); render(); });
$('upload-selfie').addEventListener('click', () => { if (privacyAccepted()) $('selfie-file').click(); });
const onFile = async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please choose a photo image.'); return; }
  try { await usePhoto(await fileToCanvas(file)); }
  catch { showToast('That photo couldn’t be opened. Try a JPEG or PNG.'); }
};
$('selfie-file').addEventListener('change', onFile);
$('camera-file').addEventListener('change', onFile);
$('capture').addEventListener('click', () => {
  if (!stream || !video.videoWidth) { showToast('Camera is still getting ready. Try again in a moment.'); return; }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0); ctx.scale(-1, 1); ctx.drawImage(video, 0, 0);
  $('hint').classList.add('hidden');
  usePhoto(toWorkingCanvas(canvas, canvas.width, canvas.height));
});
$('sample').addEventListener('click', () => clearSelfie('Using the sample smile. Take a selfie whenever you are ready.'));

for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => {
  if (state.mode === b.dataset.mode) return;
  state.mode = b.dataset.mode; storage.set('bmf-mode', state.mode);
  state.before = false; state.picked = false;
  if (!state.photo || state.photo.kind === 'sample') useSample();
  else { analyze(); renderPalette(); updateControls(); render(); }
});
for (const b of document.querySelectorAll('[data-tool]')) b.addEventListener('click', () => { state.tool = b.dataset.tool; updateControls(); });
$('undo').addEventListener('click', () => { state.photo?.edits.pop(); updateControls(); render(); });
$('reset').addEventListener('click', () => { analyze(); updateControls(); render(); });
$('compare').addEventListener('click', () => { state.before = !state.before; updateControls(); render(); });
$('zoom').addEventListener('click', () => { state.zoom = !state.zoom; updateControls(); render(); });
$('tolerance').addEventListener('change', event => {
  const p = state.photo;
  if (!p?.region || !p.refs.length) return;
  p.tol = Number(event.target.value);
  p.mask = matchMask(p.region, p.refs, p.stats, p.tol / DEFAULT_TOL, p.strict).mask; p.maskVersion++;
  render();
});
$('position').addEventListener('input', event => { state.offset = Number(event.target.value); render(); });
new ResizeObserver(() => render()).observe(stage);
window.addEventListener('pageshow', () => { if (!state.photo) useSample(); });
window.addEventListener('pagehide', () => {
  stopCamera(); clearTimeout(expiryTimer);
  const p = state.photo;
  if (p && p.kind === 'photo') { p.canvas.width = 0; if (p.out) p.out.width = 0; state.photo = null; }
});

renderPalette();
updateControls();
useSample().then(() => updateControls());
