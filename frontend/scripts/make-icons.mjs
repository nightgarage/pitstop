// Generates the favicon and app icons from one vector source.
// Run from frontend/:  node scripts/make-icons.mjs
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const BG = "#0A0A0B";
const ACCENT = "#3B9EFF";

// The "P" mark. Ink spans x 22->42 and y 18->46 on a 64 grid, so it is centred
// both ways (canvas centre is 32,32). Shifting the opening M moves the whole
// glyph, since every following command is relative or an absolute V.
const MARK = `<path d="M22 46V20a2 2 0 0 1 2-2h12a6 6 0 0 1 6 6v4a6 6 0 0 1-6 6h-8v12"
    fill="none" stroke="${ACCENT}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;

// rounded: for the browser tab, where nothing masks it for us
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${BG}"/>
  ${MARK}
</svg>`;

// square: iOS and Android apply their own mask, so supplying our own corners
// would double-round the shape
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${BG}"/>
  ${MARK}
</svg>`;

writeFileSync("public/favicon.svg", rounded);
console.log("wrote public/favicon.svg");

for (const [size, name, svg] of [
  [192, "icon-192.png", rounded],
  [512, "icon-512.png", rounded],
  [180, "apple-touch-icon.png", square],
]) {
  await sharp(Buffer.from(svg), { density: 400 }).resize(size, size).png().toFile(`public/${name}`);
  console.log("wrote public/" + name);
}
