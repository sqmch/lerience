/* Rasterises the application icon from its geometry, not from a downscaled bitmap.
 *
 *   pnpm exec electron scripts/render-icon.mjs [--web <dir>]
 *
 * The mark is two rectangles on a rounded tile (build/icon.svg records the
 * derivation), so every size is drawn directly with its coordinates rounded to
 * whole pixels. That keeps the stem, the gap and the base crisp at 16 and 24px,
 * where a generic resampler would smear a two-pixel stroke across three.
 *
 * Writes build/icon.png (1024) and build/icon.ico (16 to 256). With --web it also
 * writes the landing site's set into <dir>: favicon.ico (16, 32, 48, 256),
 * apple-icon.png (180) and icon-192.png / icon-512.png for the web manifest.
 * ICO entries up to 48px are stored as uncompressed BMP, larger ones as PNG, which
 * is what Windows, browsers and electron-builder all accept.
 */
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const MASTER = 1024;
const TILE = { inset: 64, size: 896, radius: 224, fill: "#0b0b0b" };
const MARK = { stroke: 112, gap: 56, leg: 392, fill: "#fafafa" };
const ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const FAVICON_SIZES = [16, 32, 48, 256];
const WEB_PNG = { "apple-icon.png": 180, "icon-192.png": 192, "icon-512.png": 512 };

/** Geometry for one raster size. Everything is rounded to whole pixels; the
 *  stroke and the gap never drop below one pixel, and the box is re-centred
 *  after rounding so the mark sits where the master puts it. */
function geometry(n) {
  const s = n / MASTER;
  const stroke = Math.max(1, Math.round(MARK.stroke * s));
  const gap = Math.max(1, Math.round(MARK.gap * s));
  const leg = Math.round(MARK.leg * s);
  const boxW = leg;
  const boxH = leg + gap + stroke;
  const x = Math.round((n - boxW) / 2);
  const y = Math.round((n - boxH) / 2);
  const inset = Math.round(TILE.inset * s);
  return {
    tile: { x: inset, y: inset, size: n - 2 * inset, radius: Math.round(TILE.radius * s) },
    stem: { x, y, w: stroke, h: leg },
    base: { x, y: y + leg + gap, w: leg, h: stroke },
  };
}

const DRAW = `
(function (n, g, tileFill, markFill) {
  const c = document.createElement("canvas");
  c.width = n; c.height = n;
  const ctx = c.getContext("2d");
  ctx.fillStyle = tileFill;
  ctx.beginPath();
  ctx.roundRect(g.tile.x, g.tile.y, g.tile.size, g.tile.size, g.tile.radius);
  ctx.fill();
  ctx.fillStyle = markFill;
  ctx.fillRect(g.stem.x, g.stem.y, g.stem.w, g.stem.h);
  ctx.fillRect(g.base.x, g.base.y, g.base.w, g.base.h);
  const rgba = ctx.getImageData(0, 0, n, n).data;
  let bin = "";
  for (let i = 0; i < rgba.length; i += 0x8000) bin += String.fromCharCode.apply(null, rgba.subarray(i, i + 0x8000));
  return { png: c.toDataURL("image/png").split(",")[1], rgba: btoa(bin) };
})`;

function bmpEntry(n, rgba) {
  const maskRow = Math.ceil(n / 32) * 4;
  const info = Buffer.alloc(40);
  info.writeUInt32LE(40, 0);
  info.writeInt32LE(n, 4);
  info.writeInt32LE(n * 2, 8); // XOR bitmap plus AND mask
  info.writeUInt16LE(1, 12);
  info.writeUInt16LE(32, 14);
  info.writeUInt32LE(0, 16);
  info.writeUInt32LE(n * n * 4 + maskRow * n, 20);
  const px = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const si = ((n - 1 - y) * n + x) * 4; // BMP rows run bottom-up
      const di = (y * n + x) * 4;
      px[di] = rgba[si + 2];
      px[di + 1] = rgba[si + 1];
      px[di + 2] = rgba[si];
      px[di + 3] = rgba[si + 3];
    }
  }
  return Buffer.concat([info, px, Buffer.alloc(maskRow * n)]);
}

function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dirs = [];
  const blobs = [];
  let offset = 6 + 16 * entries.length;
  for (const { size, png, rgba } of entries) {
    const blob = size <= 48 ? bmpEntry(size, rgba) : png;
    const dir = Buffer.alloc(16);
    dir[0] = size === 256 ? 0 : size;
    dir[1] = size === 256 ? 0 : size;
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(blob.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += blob.length;
    dirs.push(dir);
    blobs.push(blob);
  }
  return Buffer.concat([header, ...dirs, ...blobs]);
}

async function render(win, n) {
  const out = await win.webContents.executeJavaScript(
    `${DRAW}(${n}, ${JSON.stringify(geometry(n))}, ${JSON.stringify(TILE.fill)}, ${JSON.stringify(MARK.fill)})`,
  );
  return { size: n, png: Buffer.from(out.png, "base64"), rgba: Buffer.from(out.rgba, "base64") };
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL("about:blank");
  const webIndex = process.argv.indexOf("--web");
  const webDir = webIndex === -1 ? null : process.argv[webIndex + 1];
  const webSizes = webDir ? [...FAVICON_SIZES, ...Object.values(WEB_PNG)] : [];
  const sizes = new Set([MASTER, ...ICON_SIZES, ...webSizes]);
  const rendered = new Map();
  for (const n of sizes) rendered.set(n, await render(win, n));

  fs.writeFileSync(path.join(root, "build", "icon.png"), rendered.get(MASTER).png);
  fs.writeFileSync(
    path.join(root, "build", "icon.ico"),
    ico(ICON_SIZES.map((n) => rendered.get(n))),
  );
  console.log("wrote build/icon.png (1024) and build/icon.ico", ICON_SIZES.join("/"));
  if (webDir) {
    fs.mkdirSync(webDir, { recursive: true });
    fs.writeFileSync(
      path.join(webDir, "favicon.ico"),
      ico(FAVICON_SIZES.map((n) => rendered.get(n))),
    );
    for (const [name, n] of Object.entries(WEB_PNG))
      fs.writeFileSync(path.join(webDir, name), rendered.get(n).png);
    console.log("wrote web set to", webDir, ["favicon.ico", ...Object.keys(WEB_PNG)].join(", "));
  }
  app.quit();
});
