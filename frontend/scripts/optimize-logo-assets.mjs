// (perf: #480) — one-time asset optimization script for the logo images
// flagged by Lighthouse's "Improve image delivery" audit: logo-full-web.png
// and logo-icon-web.png were both raster copies sized for the largest
// usage across all sites (up to 666x120), but never displayed anywhere
// near that size (max real usage is 144x26 for the full wordmark, 28x24
// for the icon) — Lighthouse flagged ~46 KiB of avoidable download size
// as a result.
//
// This regenerates both from their un-web-optimized master files
// (logo-full.png / logo-icon.png, already in frontend/public/ from #385),
// resized to 2x their largest real render dimensions (for retina
// sharpness) and re-encoded as both WebP (primary) and PNG (fallback for
// browsers without WebP support — negligible market share today, but
// cheap insurance since this is a <picture> swap, not a hard cutover).
//
// Run from inside frontend/:
//   npm install --save-dev sharp
//   node scripts/optimize-logo-assets.mjs
//
// Overwrites the existing logo-full-web.png / logo-icon-web.png in place
// and adds logo-full-web.webp / logo-icon-web.webp alongside them.

import sharp from "sharp";
import path from "path";

const PUBLIC_DIR = path.resolve("public");

// [source master, output basename, target width, target height] — width/
// height are 2x the largest real usage of each image across the app:
//   logo-full: MarketingHeader renders it at 144x26 (the largest of its
//   3 usage sites — AppTopbar's sm+ variant is 133x24) -> 288x52 at 2x.
//   logo-icon: AppTopbar's sub-sm variant renders it at 28x24 (its only
//   usage site as a *logo* — the loading-shell's icon usage in index.html
//   is a separate, larger placeholder graphic, not this file) -> 56x48
//   at 2x.
const targets = [
  { src: "logo-full.png", base: "logo-full-web", width: 288, height: 52 },
  { src: "logo-icon.png", base: "logo-icon-web", width: 56, height: 48 },
];

for (const { src, base, width, height } of targets) {
  const input = path.join(PUBLIC_DIR, src);
  const webpOut = path.join(PUBLIC_DIR, `${base}.webp`);
  const pngOut = path.join(PUBLIC_DIR, `${base}.png`);

  await sharp(input)
    .resize(width, height, { fit: "inside" })
    .webp({ quality: 90 })
    .toFile(webpOut);

  await sharp(input)
    .resize(width, height, { fit: "inside" })
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(pngOut);

  console.log(`Generated ${base}.webp and ${base}.png at ${width}x${height} (from ${src})`);
}

console.log("\nDone. Check the file sizes in frontend/public/ — each should now be a few KB rather than 40+.");
