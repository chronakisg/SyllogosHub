import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");

const BG = "#800000";
const FG = "#ffffff";

function svgFor(size, { safeZonePct = 0 } = {}) {
  const fontSize = Math.round(size * (safeZonePct > 0 ? 0.36 : 0.45));
  const safePad = Math.round((size * safeZonePct) / 2);
  const innerSize = size - safePad * 2;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" fill="${BG}"/>
      <g transform="translate(${safePad},${safePad})">
        <rect width="${innerSize}" height="${innerSize}" fill="${BG}"/>
        <text
          x="${innerSize / 2}"
          y="${innerSize / 2}"
          fill="${FG}"
          font-family="Arial, Helvetica, sans-serif"
          font-weight="700"
          font-size="${fontSize}"
          text-anchor="middle"
          dominant-baseline="central"
        >SH</text>
      </g>
    </svg>
  `;
}

async function render(svg, outPath) {
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log("Wrote", outPath);
}

await mkdir(outDir, { recursive: true });

await render(svgFor(192), join(outDir, "icon-192.png"));
await render(svgFor(512), join(outDir, "icon-512.png"));
await render(svgFor(512, { safeZonePct: 0.2 }), join(outDir, "icon-maskable-512.png"));
await render(svgFor(180), join(outDir, "apple-touch-icon.png"));
