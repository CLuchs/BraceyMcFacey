// On-device face landmark detection (MediaPipe Face Landmarker, Apache-2.0).
// The model and runtime are bundled in vendor/mediapipe/, so no photo or request leaves the device.
// Note: the MediaPipe runtime tries to send anonymous usage statistics to Google; the page's
// Content-Security-Policy (connect-src 'self') blocks that request.

let landmarkerPromise = null;

async function load() {
  const base = new URL('../vendor/mediapipe/', import.meta.url).href;
  const { FaceLandmarker } = await import('../vendor/mediapipe/vision_bundle.mjs');
  return FaceLandmarker.createFromOptions(
    { wasmLoaderPath: base + 'wasm/vision_wasm_internal.js', wasmBinaryPath: base + 'wasm/vision_wasm_internal.wasm' },
    { baseOptions: { modelAssetPath: base + 'face_landmarker.task', delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 1 },
  );
}

export function preloadFaceFinder() {
  landmarkerPromise ??= load().catch(error => { landmarkerPromise = null; throw error; });
  return landmarkerPromise;
}

// Returns the 478 landmarks of the first face, normalized to the given canvas (values outside
// 0..1 mean that part of the face is outside the photo), or null when no face is found.
// When the face runs off the edge of the photo, the detector often misses it; adding an empty
// margin around the photo gives it room, so we retry that way.
export async function findLandmarks(canvas) {
  const landmarker = await preloadFaceFinder();
  const direct = landmarker.detect(canvas).faceLandmarks?.[0];
  if (direct) return direct;
  for (const pad of [0.3, 0.15]) {
    const px = Math.round(canvas.width * pad), py = Math.round(canvas.height * pad);
    const padded = document.createElement('canvas');
    padded.width = canvas.width + 2 * px; padded.height = canvas.height + 2 * py;
    const ctx = padded.getContext('2d');
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, padded.width, padded.height);
    ctx.drawImage(canvas, px, py);
    const lm = landmarker.detect(padded).faceLandmarks?.[0];
    padded.width = 0;
    if (lm) return lm.map(q => ({ ...q, x: (q.x * (canvas.width + 2 * px) - px) / canvas.width, y: (q.y * (canvas.height + 2 * py) - py) / canvas.height }));
  }
  return null;
}
