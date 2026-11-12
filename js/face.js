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

// Returns the 478 normalized landmarks of the first face, or null when no face is found.
export async function findLandmarks(canvas) {
  const landmarker = await preloadFaceFinder();
  return landmarker.detect(canvas).faceLandmarks?.[0] ?? null;
}
