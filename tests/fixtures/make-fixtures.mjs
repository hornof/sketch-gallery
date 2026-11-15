// Makes the test drawings in tests/fixtures/drawings/ (#13).
// Run it again with `npm run fixtures`; it writes the same files every time.
//
// The drawings are simple shapes with their date written on them. The tests use
// them instead of the drawings in drawings/. One of them is made like a photo
// taken sideways on a phone: its pixels are stored on their side, a hidden note
// (the EXIF orientation tag) says to turn it upright, and it carries the place
// where it was taken (a GPS location, in both the EXIF and the XMP notes).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'drawings');

// The location written into the phone photo: the Royal Observatory, Greenwich.
export const PHONE_PHOTO = {
  date: '2026-02-28',
  // Upright size; the stored pixels are 400 wide and 300 high.
  width: 300,
  height: 400,
  orientation: 6, // "turn 90 degrees clockwise to show upright"
  latitude: [51, 28, 40], // N
  longitude: [0, 0, 5], // W
};

function svg(width, height, label, ink) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#f7f3ea"/>
  <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 3}" fill="none" stroke="${ink}" stroke-width="${Math.max(2, width / 120)}"/>
  <path d="M ${width * 0.1} ${height * 0.85} Q ${width / 2} ${height * 0.6} ${width * 0.9} ${height * 0.85}" fill="none" stroke="${ink}" stroke-width="${Math.max(2, width / 160)}"/>
  <text x="50%" y="${height * 0.15}" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(width / 12)}" text-anchor="middle" fill="${ink}">${label}</text>
</svg>`);
}

async function drawing(width, height, label, ink) {
  return sharp(svg(width, height, label, ink)).flatten({ background: '#f7f3ea' }).jpeg({ quality: 85 }).toBuffer();
}

// The phone photo: upright it's red on top and blue below, so a test can tell
// which way up a copy is. Stored turned a quarter left, as a sideways phone would.
async function phonePhoto() {
  const { width, height } = PHONE_PHOTO;
  const upright = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height / 2}" fill="#d01010"/>
  <rect y="${height / 2}" width="${width}" height="${height / 2}" fill="#1030d0"/>
</svg>`);
  const stored = await sharp(upright).rotate(-90).jpeg({ quality: 90 }).toBuffer();
  return insertAfterStart(stored, [exifSegment(), xmpSegment()]);
}

// A big-endian TIFF block holding Orientation and a GPS location, as phones write it.
function exifSegment() {
  const tiff = Buffer.alloc(140);
  tiff.write('MM', 0, 'latin1');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  // First folder of tags (IFD0), at 8: Orientation and a pointer to the GPS tags.
  tiff.writeUInt16BE(2, 8);
  entry(tiff, 10, 0x0112, 3, 1, PHONE_PHOTO.orientation << 16);
  entry(tiff, 22, 0x8825, 4, 1, 38);
  tiff.writeUInt32BE(0, 34);
  // GPS tags, at 38.
  tiff.writeUInt16BE(4, 38);
  entry(tiff, 40, 0x0001, 2, 2, 0x4e000000); // "N"
  entry(tiff, 52, 0x0002, 5, 3, 92);
  entry(tiff, 64, 0x0003, 2, 2, 0x57000000); // "W"
  entry(tiff, 76, 0x0004, 5, 3, 116);
  tiff.writeUInt32BE(0, 88);
  rationals(tiff, 92, PHONE_PHOTO.latitude);
  rationals(tiff, 116, PHONE_PHOTO.longitude);
  return segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]));
}

function xmpSegment() {
  const [d, m, s] = PHONE_PHOTO.latitude;
  const [e, n, t] = PHONE_PHOTO.longitude;
  const xml = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="${d},${m + s / 60}N" exif:GPSLongitude="${e},${n + t / 60}W"/>
</rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
  return segment(0xe1, Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'), Buffer.from(xml, 'utf8')]));
}

function entry(buf, at, tag, type, count, value) {
  buf.writeUInt16BE(tag, at);
  buf.writeUInt16BE(type, at + 2);
  buf.writeUInt32BE(count, at + 4);
  buf.writeUInt32BE(value >>> 0, at + 8);
}

function rationals(buf, at, values) {
  values.forEach((v, i) => {
    buf.writeUInt32BE(v, at + i * 8);
    buf.writeUInt32BE(1, at + i * 8 + 4);
  });
}

function segment(marker, payload) {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

function insertAfterStart(jpeg, segments) {
  return Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)]);
}

async function main() {
  rmSync(out, { recursive: true, force: true });
  const files = {
    '2024/2024-02-29.jpg': await drawing(800, 600, '2024-02-29', '#2a2a2a'),
    // The shape of the TDD's example drawing, big enough that its thumbnail is made smaller.
    '2025/2025-10-07.jpg': await drawing(1440, 1671, '2025-10-07', '#1f3a5e'),
    '2025/2025-12-31.jpg': await drawing(600, 600, '2025-12-31', '#5e1f3a'),
    [`2026/${PHONE_PHOTO.date}.jpg`]: await phonePhoto(),
  };
  for (const [name, data] of Object.entries(files)) {
    mkdirSync(join(out, dirname(name)), { recursive: true });
    writeFileSync(join(out, name), data);
    console.log(`Wrote tests/fixtures/drawings/${name} (${data.length} bytes)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
