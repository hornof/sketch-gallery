// Removing hidden location from the full-size copies (#13, TDD section 5).
// The checks read the result with exifr, a separate library, and decode the
// pixels with sharp, so they don't rely on the build's own JPEG reader.
import exifr from 'exifr';
import fc from 'fast-check';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { isJpeg, keepOnlyOrientation } from '../build/jpeg.mjs';

let plain; // a small real JPEG with no hidden notes
let progressive; // the same, saved the way some cameras do (several passes)

beforeAll(async () => {
  const picture = sharp({ create: { width: 24, height: 16, channels: 3, background: '#808080' } })
    .composite([{ input: { create: { width: 8, height: 8, channels: 3, background: '#ff0000' } }, left: 0, top: 0 }]);
  plain = await picture.clone().jpeg({ quality: 90 }).toBuffer();
  progressive = await picture.clone().jpeg({ quality: 90, progressive: true }).toBuffer();
});

function segment(marker, payload) {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

// Hidden notes that can carry a location or other private details.
const exifWithGps = () => {
  const tiff = Buffer.alloc(8 + 2 + 12 + 4 + 2 + 12 + 4 + 24);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8825, 10); // pointer to the GPS tags
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt32LE(0, 22);
  tiff.writeUInt16LE(1, 26);
  tiff.writeUInt16LE(0x0002, 28); // latitude
  tiff.writeUInt16LE(5, 30);
  tiff.writeUInt32LE(3, 32);
  tiff.writeUInt32LE(44, 36);
  tiff.writeUInt32LE(0, 40);
  [12, 1, 34, 1, 56, 1].forEach((v, i) => tiff.writeUInt32LE(v, 44 + i * 4));
  return segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]));
};
const xmp = () => segment(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/"/>', 'latin1'));
const iptc = () => segment(0xed, Buffer.from('Photoshop 3.0\0 8BIM city: somewhere', 'latin1'));
const comment = () => segment(0xfe, Buffer.from('taken at home', 'latin1'));
const mpf = () => segment(0xe2, Buffer.from('MPF\0 second picture follows', 'latin1'));
const icc = () => segment(0xe2, Buffer.from('ICC_PROFILE\0\x01\x01 colour data', 'latin1'));
const adobe = () => segment(0xee, Buffer.from('Adobe\0\x64\0\0\0\0\x01', 'latin1'));

const KINDS = {
  exifWithGps: { make: exifWithGps, kept: false },
  xmp: { make: xmp, kept: false },
  iptc: { make: iptc, kept: false },
  comment: { make: comment, kept: false },
  mpf: { make: mpf, kept: false },
  icc: { make: icc, kept: true },
  adobe: { make: adobe, kept: true },
};

function afterStart(jpeg, extra) {
  return Buffer.concat([jpeg.subarray(0, 2), ...extra, jpeg.subarray(2)]);
}

// The picture data: from the start-of-scan marker (FF DA) to the end (FF D9).
function pictureData(jpeg) {
  const start = jpeg.indexOf(Buffer.from([0xff, 0xda]));
  const end = jpeg.lastIndexOf(Buffer.from([0xff, 0xd9]));
  return jpeg.subarray(start, end + 2);
}

async function pixels(jpeg) {
  return sharp(jpeg).raw().toBuffer();
}

async function allNotes(jpeg) {
  return (await exifr.parse(jpeg, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: false, mergeOutput: false, translateValues: false })) ?? {};
}

describe('isJpeg', () => {
  it('says yes to a JPEG and no to anything else', () => {
    expect(isJpeg(plain)).toBe(true);
    expect(isJpeg(Buffer.from('not a picture'))).toBe(false);
    expect(isJpeg(Buffer.from([0xff, 0xd8]))).toBe(false);
    expect(isJpeg(Buffer.alloc(0))).toBe(false);
    expect(isJpeg(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe(false);
  });
});

describe('keepOnlyOrientation', () => {
  it('removes every hidden note except which way is up, and never changes the picture', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...Object.keys(KINDS)), { maxLength: 6 }),
        fc.constantFrom(undefined, 1, 2, 3, 4, 5, 6, 7, 8),
        fc.uint8Array({ maxLength: 40 }),
        fc.boolean(),
        async (kinds, orientation, trailing, useProgressive) => {
          const base = useProgressive ? progressive : plain;
          const input = Buffer.concat([afterStart(base, kinds.map((k) => KINDS[k].make())), Buffer.from(trailing)]);
          const out = keepOnlyOrientation(input, orientation);

          // Still a JPEG with the very same picture data, and nothing after its end.
          expect(isJpeg(out)).toBe(true);
          expect(pictureData(out).equals(pictureData(base))).toBe(true);
          expect(out.subarray(-2).equals(Buffer.from([0xff, 0xd9]))).toBe(true);

          // The only note left is the orientation, when there is one to keep.
          const notes = await allNotes(out);
          const wanted = orientation && orientation !== 1 ? { ifd0: { Orientation: orientation } } : {};
          const found = Object.fromEntries(Object.entries(notes).filter(([, v]) => v && Object.keys(v).length));
          expect(found).toEqual(wanted);

          // The notes a browser needs to draw the colours right are kept, in order.
          const keptTexts = kinds.filter((k) => KINDS[k].kept).map((k) => KINDS[k].make().toString('latin1'));
          let at = 0;
          for (const text of keptTexts) {
            const i = out.toString('latin1').indexOf(text, at);
            expect(i).toBeGreaterThanOrEqual(at);
            at = i + text.length;
          }
          for (const k of kinds.filter((k) => !KINDS[k].kept)) {
            expect(out.includes(KINDS[k].make())).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('keeps the pixels exactly the same', async () => {
    const input = afterStart(plain, [exifWithGps(), xmp(), comment()]);
    const out = keepOnlyOrientation(input, 6);
    expect((await pixels(out)).equals(await pixels(plain))).toBe(true);
  });

  it('leaves a phone photo that browsers still turn upright', async () => {
    const input = afterStart(plain, [exifWithGps()]);
    expect(await exifr.gps(input)).toBeTruthy(); // the test note really holds a location
    const out = keepOnlyOrientation(input, 6);
    expect(await exifr.gps(out)).toBeUndefined();
    expect((await sharp(out).metadata()).orientation).toBe(6);
    expect((await sharp(out).metadata()).autoOrient).toEqual({ width: 16, height: 24 });
  });

  it('refuses a file that isn\'t a JPEG', () => {
    expect(() => keepOnlyOrientation(Buffer.from('hello'), 1)).toThrow(/isn't a JPEG/);
  });

  it('refuses a JPEG cut off before its picture data', () => {
    expect(() => keepOnlyOrientation(plain.subarray(0, 30), 1)).toThrow(/cut off/);
  });
});
