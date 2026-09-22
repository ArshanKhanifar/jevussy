import sharp from "sharp";
const source = "public/favicon.svg";
const sizes = [16, 32, 48];
const pngs = await Promise.all(
  sizes.map((size) => sharp(source).resize(size, size).png().toBuffer()),
);
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const entry = 6 + i * 16;
  header[entry] = sizes[i];
  header[entry + 1] = sizes[i];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(pngs[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += pngs[i].length;
}
await Bun.write("public/favicon.ico", Buffer.concat([header, ...pngs]));
for (const [size, name] of [
  [48, "favicon-48.png"],
  [180, "apple-touch-icon.png"],
  [192, "icon-192.png"],
  [512, "icon-512.png"],
] as const)
  await sharp(source).resize(size, size).png().toFile(`public/${name}`);
console.log("Created SVG, multi-size ICO, PNG, and home-screen icons.");
