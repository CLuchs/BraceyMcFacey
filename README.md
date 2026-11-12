# Bracey McFacey

A braces-color try-on app. Take or upload one selfie, then browse the standard brace-color palette and preview each color on your smile.

Two modes, chosen with "Do you already have braces?":

- **Yes, change my colors** (returning patients): the app finds the colored bands on your current braces and repaints them in the new color, keeping the photo's shading. Tools let you fix the outline: *Match color* (tap one of your bands), *Add band*, *Remove*, *Undo*, plus a color-match slider. *Show current color* toggles before/after.
- **Not yet, add braces** (new patients): virtual brackets and wire are drawn along your upper teeth.

Both modes find the mouth automatically with on-device face landmarks (MediaPipe Face Landmarker, bundled in `vendor/mediapipe/`).

## Run in a browser

Run `npm start` and open http://localhost:8080 (opening `index.html` directly from disk does not work, because the app uses JavaScript modules). The live camera needs HTTPS or localhost and user permission; if it is unavailable, "Take selfie" falls back to the device's own camera/photo picker. Fonts (DM Sans and Manrope, SIL Open Font License) are bundled in `fonts/`, so the app makes no third-party network requests. The app does not upload the selfie; the preview clears after two hours or when leaving the page.

## Native iOS and Android setup

The repository includes Capacitor configuration for producing native iOS and Android shells around the same app.

1. Install Node.js (LTS) and npm.
2. Install dependencies: `npm install`.
3. Generate the web assets and synchronize Capacitor: `npm run cap:sync`.
4. Add native projects once: `npx cap add ios` and `npx cap add android`.
5. After web changes, run `npm run cap:sync` again.
6. Open the projects in their native IDEs with `npm run cap:ios` or `npm run cap:android`.

Building/signing for iOS requires macOS and Xcode. Android builds require Android Studio and its SDK. Before release, test the camera/photo picker on physical devices, add native camera permission explanations as required, set store icons/screenshots, and review each store's current privacy and age-rating requirements. The current selfie rendering is a web-based overlay with manual positioning, not automatic facial tracking.

## Advertising recommendations

Keep the try-on flow calm and put any ads outside the selfie/camera task:

- **Best first placement:** a clearly marked, optional sponsor card below the color palette or after the user finishes trying colors. It could feature an orthodontic practice or a relevant oral-care product.
- **Secondary option:** a small, non-personalized banner on a separate tips/about screen, not over the selfie or controls.
- **Avoid:** interstitials while taking/selecting a selfie, ads among color swatches, pop-ups that block the preview, and ads targeted using a face, selfie, inferred traits, or health information.

Start with a direct sponsorship or clearly disclosed affiliate link rather than an ad SDK; it is simpler for a privacy-first app. If adding an ad network later, use age-appropriate, non-personalized ads and get legal/store-policy review, especially because orthodontic users may be minors. Do not send photos or facial data to an advertising provider. The app currently contains no ad code or tracking SDK.

## Privacy and limitations

- Face detection runs on the device. The MediaPipe runtime tries to send anonymous usage statistics to Google; the page's Content-Security-Policy (`connect-src 'self'`) blocks that and every other outside request. Keep that policy when editing `index.html`.
- Automatic band detection works best for clearly colored bands (blue, green, purple, teal). Clear, white, silver, gray and black bands blend in with teeth, metal and shadows, and pink/red bands can match the gums; for those the app asks the person to mark bands with *Add band*. It is tuned to prefer missing a band over coloring gums, lips or teeth.
- The app needs the whole face in the photo to find the mouth (close-ups of only the mouth are not recognized).
- To check detection on more photos: put them in `test-photos/` (git-ignored) and run `node scripts/eval-bands.js test-photos eval-out` while `npm start` is running.
- Small or distant photos give rough results; a close, well-lit smile works best. Only upper-arch brackets are drawn in new-patient mode.
- Under this security policy, WebAssembly (used by face detection) needs iOS 16 or later and a current Android System WebView; on older devices the app still works but without automatic mouth detection.

- A simple acknowledgment explains that colors and placement are estimates and photos clear after two hours.
- Selfies are held in page memory, not uploaded or saved to an account. Leaving the page clears the selfie sooner; the in-page timer clears it after two hours if the page remains open.
- Palette values are approximate. Screen colors, lighting, and real bands can differ.
- The overlay is a visual approximation with manual adjustment, not clinical advice or a treatment simulation. Confirm available colors and choices with an orthodontist.
