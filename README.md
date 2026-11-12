# Bracey McFacey

A privacy-first browser app to try braces colors on a sample smile or a selfie, scan an orthodontist's color chart, and browse the colors in their order of appearance in the chart photo.

## Run

Open `index.html` in a browser. Camera access requires HTTPS or `localhost` and camera permission. Image upload works without camera access.

## How it works

1. Start with a selfie (camera or upload) or use the sample smile.
2. Take or upload a photo of the orthodontist's color chart. The app estimates colorful swatches on-device and lists them in approximate reading order (left to right, then top to bottom). The user can compare the detected shades and order with the physical chart.
3. Tap any displayed color to preview it on the smile. No colors are ranked or labeled as suggested.

## Privacy and limitations

- Selfies and color chart photos stay in the browser; this static app has no server and does not upload or persist photos.
- Chart color extraction is a basic pixel-color estimate and cannot reliably identify chart layout, names, or exact swatches. Use a clear, straight-on photo and verify the resulting sequence against the physical chart.
- The braces overlay is a visual approximation, not a clinical treatment simulation. Confirm available colors and choices with your orthodontist.
