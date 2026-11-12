# MediaPipe Face Landmarker (bundled)

Bundled so face detection runs fully on-device and offline, with no requests to Google's CDN.

- `vision_bundle.mjs`, `wasm/vision_wasm_internal.{js,wasm}`: npm package `@mediapipe/tasks-vision` 1.2.3
- `face_landmarker.task`: Face Landmarker model, float16 v1, from Google's MediaPipe model storage
- License: Apache 2.0 (see `LICENSE`)

The runtime tries to send anonymous usage statistics to `odml.pa.googleapis.com`.
The app's Content-Security-Policy (`connect-src 'self'`) blocks that request; keep that policy in place.

To update: replace these files with a newer package version and re-test face detection.
