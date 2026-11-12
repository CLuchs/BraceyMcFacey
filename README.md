# Bracey McFacey

A privacy-first browser app to try braces colors on a sample smile or a selfie, scan an orthodontist's color chart, and browse the available color choices with three personalized suggestions.

## Run

Open `index.html` in a browser. Camera access requires HTTPS or `localhost` and permission from the user. Image upload works without camera access.

## How it works

1. Start with a selfie (camera or upload) or use the sample smile.
2. Take or upload a picture of the orthodontist's color chart. The app samples colorful pixels to suggest likely swatches; this simple image-color scan is approximate, so compare the extracted colors with the physical chart. You can revert to the example palette.
3. Choose or edit your skin tone, hair color, eye color, and face shape. The app ranks the detected (or example) colors and labels its top three; choose any color to see the braces overlay and browse all remaining options.

## Privacy and limitations

- Selfies and color chart photos stay in the browser; this static app has no server and does not upload or persist photos.
- The app does not automatically identify facial features. Users self-describe their skin tone, hair, eye color, and face shape; these optional selections inform playful color recommendations.
- Color-chart detection is a basic browser-side pixel-color estimate, not optical character recognition or guaranteed swatch identification.
- The braces overlay is a visual approximation, not a clinical treatment simulation. Confirm available colors and choices with your orthodontist.
