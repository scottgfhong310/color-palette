# color-palette

> 版本 v1.0｜最後更新 2026-07-05

**English** ｜ [繁體中文](README.zh-Hant.md) ｜ [日本語](README.ja.md)

Upload an image, extract its main colors (≤ 12), and use that swatch row as the image's **alias**. Images that have been analyzed show their color blocks; those not yet analyzed show their filename. The gallery and each alias are ordered by **hue**, so similar-colored images cluster together and each alias becomes a stable visual fingerprint.

Part of the **nodeapp WebApp family** — shared conventions and workflow live at
<https://github.com/scottgfhong310/nodeapp-webapp-family> (`DESIGN_GUIDELINES.md`, `WORKFLOW.md`).

> ⚠️ Not GitHub-Pages compatible: the frontend calls absolute `/api/...` and `/upload/...` paths served by this project's Node server.

## Features

- **Drag-and-drop / click upload** of images (`.png` `.jpg` `.webp` `.gif` `.bmp`), auto-analyzed on upload.
- **Two extraction methods**, toggleable: *median-cut* (color families, even coverage) and *frequency* (dominant colors by area).
- **Palette as alias**: each image's ≤ 12 main colors become a hue-sorted swatch row.
- **Hue ordering**: swatches within an alias and the whole gallery are sorted by hue (achromatic images sort last).
- **Browse by color at scale**: the gallery is grouped into hue families (red/orange/yellow/green/cyan/blue/purple/magenta/neutral) with sticky headers and a left-side jump rail; a density toggle switches between thumbnail cards and a compact **swatch wall**.
- **Persisted registry**: analysis results are stored server-side, so aliases survive reloads and aren't recomputed.
- **Five detail views**: click an alias to see the source image plus each color's hex/share, switching among five colour types — **Families / Dominant / All / Distribution / Accent** (area-representative colours, ΔE≈5 perceptual distribution, chroma-weighted saliency). What each type means and when to use it: [COLOR-TYPES.md](COLOR-TYPES.md).
- **Light / dark** themes, **zh-Hant / en / ja** i18n. Materialize components themed by the shared `materialize-dark.css`.

## Install & run

```bash
npm install
npm start          # → http://localhost:3000/apps/color-palette/
```

Override the port with `PORT` (e.g. `PORT=3005 npm start`).

## Directory structure

```
app.js                                   # Express entry: port 3000; / → 302 /apps/color-palette/
routes/upload.js                         # POST /api/upload?folder=color-palette (shared minimal version)
routes/color-palette.js                  # GET /files, POST /alias, POST /clear (+ registry)
public/apps/color-palette/               # frontend (served at /apps/color-palette/)
├─ index.html                            # structure only
├─ color-palette.css                     # theme tokens + gallery / swatch / modal styles
├─ color-palette.js                      # controller: upload, canvas → getImageData, render
├─ color-palette-lib.js                  # pure core: extraction, hue sort, server comms (window.ColorPaletteLib)
├─ materialize-dark.css · side-tool.css · i18n.js · locales/{zh-Hant,en,ja}.js
public/upload/color-palette/             # uploaded images + .registry.json (not tracked)
```

## API

All endpoints return a `{ ok: boolean, ... }` envelope.

| Method | Path | Description |
|---|---|---|
| POST | `/api/upload?folder=color-palette` | Upload images (multipart field `myFiles`, ≤ 20); same name overwrites |
| GET  | `/api/color-palette/files` | List images, each with its stored `alias` (or `null`) |
| POST | `/api/color-palette/alias` | Persist one image's palette; body `{ name, palette }` (`.bak` before overwrite) |
| POST | `/api/color-palette/clear` | Delete all visible files and empty the registry |

Color extraction runs **in the browser** (canvas + `color-palette-lib.js`); the backend stays thin and only stores the registry.

## Core library (`window.ColorPaletteLib`)

Pure logic, no DOM, native `fetch` only — embeddable anywhere.

```js
// pixels from a canvas: ctx.getImageData(0,0,w,h).data  (RGBA Uint8ClampedArray)
const palette = ColorPaletteLib.buildPalette(pixels, { method: 'median', count: 12 });
await ColorPaletteLib.saveAlias('photo.png', palette);
const files = await ColorPaletteLib.listFiles();
files.sort((a, b) => ColorPaletteLib.compareByHue(a.alias, b.alias));
```

Key methods: `extractPalette(data, opts)`, `buildPalette(data, opts)`, `sortByHue(colors)`,
`representativeHue(palette)`, `compareByHue(aliasA, aliasB)`, `rgbToHsl` / `rgbToHex`,
`uploadFile` / `listFiles` / `saveAlias` / `clearFolder`, `isImage` / `fileUrl` / `formatSize` / `timestamp`.

## Data shapes

```jsonc
// ColorPaletteLib.buildPalette(data, opts) →  Palette
{
  "method": "median",        // 'median' | 'frequency'
  "count": 5,                // number of distinct colors (≤ 12)
  "colors": [                // hue-sorted; duplicates merged
    {
      "r": 220, "g": 40, "b": 40,   // 0–255
      "hex": "#dc2828",             // '#rrggbb'
      "ratio": 0.53,                // share of non-neutral pixels (0–1)
      "hue": 0                      // HSL hue 0–360
    }
    // …
  ],
  "hue": 0                   // representative hue (dominant color); -1 = achromatic image
}

// GET /api/color-palette/files →
{
  "ok": true,
  "files": [
    {
      "name": "photo.png",
      "size": 12345,               // bytes
      "mtime": 1783214392243,      // ms epoch
      "alias": { /* Palette + "analyzedAt": "yyyyMMddHHmmss" */ } | null
    }
  ]
}
```

## License

[MIT](LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
