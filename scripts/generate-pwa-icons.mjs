import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const SOURCE_SVG = path.join(PUBLIC_DIR, 'favicon-white.svg');

const BRAND = '#7C3AED';

const svg = await readFile(SOURCE_SVG);

async function renderIcon({ size, padding, output, background = BRAND }) {
  const inner = Math.round(size * (1 - padding * 2));
  const offset = Math.round((size - inner) / 2);

  const ghostPng = await sharp(svg, { density: 1024 })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: ghostPng, top: offset, left: offset }])
    .png()
    .toFile(path.join(PUBLIC_DIR, output));

  console.log(`wrote ${output} (${size}x${size})`);
}

await renderIcon({ size: 192, padding: 0.12, output: 'icon-192.png' });
await renderIcon({ size: 512, padding: 0.12, output: 'icon-512.png' });
await renderIcon({ size: 512, padding: 0.20, output: 'icon-maskable-512.png' });
await renderIcon({ size: 180, padding: 0.12, output: 'apple-icon-180.png' });

console.log('done');
