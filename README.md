# Immersive AR – Tap-to-Place MVP

A web-based immersive AR experience that lets users place a 3D object on real-world surfaces using WebXR hit-test. Built with [Three.js](https://threejs.org/) and the [WebXR Device API](https://immersiveweb.dev/).

## How It Works

1. Open the page on a supported Android device in Chrome.
2. Tap **Start AR** — the camera opens and the system starts scanning for flat surfaces.
3. A white ring reticle appears where a valid surface is detected.
4. **Tap the screen** to place the 3D object at the reticle's location.
5. Walk around — the object stays anchored in the real world.
6. Tap **Reset** to remove the object and place it somewhere else.

## Requirements

| Requirement | Details |
|---|---|
| Device | Android phone/tablet |
| Browser | Chrome 81+ (Android) |
| Connection | **HTTPS** (required by WebXR) |
| Feature | ARCore installed & up-to-date |

> **iOS is not supported** at this stage — Safari does not implement the WebXR `immersive-ar` session type.

---

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Start the HTTPS dev server

```bash
npm run dev
```

Vite starts a local HTTPS server (self-signed certificate via `@vitejs/plugin-basic-ssl`). The terminal will show two URLs:

```
  ➜  Local:   https://localhost:5173/
  ➜  Network: https://192.168.1.42:5173/
```

---

## Accessing from a Mobile Device

WebXR **requires HTTPS**. There are two ways to access the dev server from your phone:

### Option A — Same WiFi network (easiest)

1. Make sure your laptop and Android phone are on the **same WiFi network**.
2. Open the **Network URL** shown in the terminal (e.g. `https://192.168.1.42:5173/`) in **Chrome** on your Android phone.
3. Chrome will warn about the self-signed certificate. Tap **Advanced → Proceed to … (unsafe)** to continue.
4. The AR page will load. Tap **Start AR**.

### Option B — Secure tunnel with ngrok (no certificate warning)

If Option A doesn't work (firewall, different network, etc.), use a secure tunnel:

```bash
# In a separate terminal
npx ngrok http https://localhost:5173 --host-header=localhost
```

ngrok will print a public HTTPS URL like `https://abc123.ngrok-free.app`. Open that URL in Chrome on your phone — no certificate warning needed.

---

## Verifying WebXR Availability

Open `chrome://flags` on your Android device and verify:

| Flag | Value |
|---|---|
| `#webxr-incubations` | Enabled |
| `#webxr-ar-module` | Enabled (if present) |

Also ensure **ARCore** (Google Play Services for AR) is installed and updated from the Play Store.

To programmatically check availability, open DevTools console and run:

```js
navigator.xr.isSessionSupported('immersive-ar').then(console.log);
// true → AR is supported
// false → device/browser doesn't support immersive-ar
```

---

## Project Structure

```
├── index.html          # App shell + UI overlay
├── src/
│   └── main.js         # AR logic (Three.js + WebXR hit-test)
├── vite.config.js      # Dev server with HTTPS + network hosting
└── package.json
```

## Build for Production

```bash
npm run build
```

The output lands in `dist/`. Deploy to any static HTTPS host (Netlify, Vercel, GitHub Pages with a custom domain, etc.).

> **Important:** The production host must serve over HTTPS — WebXR will not work on plain HTTP.
