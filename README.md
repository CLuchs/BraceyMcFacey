# Bracey McFacey

A small browser-based braces color try-on. Take or upload one selfie, then tap through the standard color chart in the order shown in the image provided by the user. The selected color appears as a virtual braces overlay on the photo.

## Run

Open `index.html` in a browser. Camera access requires HTTPS or `localhost` and camera permission. You can also use the device's photo picker to take or upload a selfie.

## Privacy and limitations

- A short acknowledgment explains that colors and placement are estimates and photos are cleared after two hours.
- Selfies are handled in page memory only. They are not uploaded or saved to an account, and the page clears the selfie after two hours while it remains open. Closing or navigating away from the page clears it sooner.
- Standard chart colors and names are approximate values transcribed from the user-provided image. Screen colors, lighting, and the physical bands can differ.
- The overlay is an AR-style visual preview with a manual position control; it does not track facial landmarks or simulate clinical treatment. Ask the orthodontist about exact colors and fit.
