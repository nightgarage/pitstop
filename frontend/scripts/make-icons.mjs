// Generates PWA icons from the vector logo. Run: node scripts/make-icons.mjs
import sharp from "sharp";

const logo = (padding) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0A0A0B"/>
  <path d="M${20 + padding} ${46 - padding}V${20 + padding}a2 2 0 0 1 2-2h${10 - padding}a6 6 0 0 1 6 6v4a6 6 0 0 1-6 6h-8v12"
    fill="none" stroke="#3B9EFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`);

for (const [size, name] of [
  [192, "icon-192.png"],
  [512, "icon-512.png"],
  [180, "apple-touch-icon.png"],
]) {
  await sharp(logo(0), { density: 300 }).resize(size, size).png().toFile(`public/${name}`);
  console.log("wrote public/" + name);
}
