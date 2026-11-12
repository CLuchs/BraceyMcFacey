# Bracey McFacey

A braces-color try-on app. Take or upload one selfie, then browse the standard brace-color palette and preview each color with a virtual braces overlay.

## Run in a browser

Open `index.html`. Camera access needs HTTPS or localhost and user permission. The app does not upload the selfie; the preview clears after two hours or when leaving the page.

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

- A simple acknowledgment explains that colors and placement are estimates and photos clear after two hours.
- Selfies are held in page memory, not uploaded or saved to an account. Leaving the page clears the selfie sooner; the in-page timer clears it after two hours if the page remains open.
- Palette values are approximate. Screen colors, lighting, and real bands can differ.
- The overlay is a visual approximation with manual adjustment, not clinical advice or a treatment simulation. Confirm available colors and choices with an orthodontist.
