// Removing hidden notes from a JPEG without changing the picture (#13, TDD section 5).
//
// A JPEG file is a list of blocks, each starting with a two-byte marker, followed
// by the picture data. Some blocks are hidden notes: a phone writes the place a
// photo was taken (EXIF GPS, XMP), and editors add captions, comments and extra
// pictures. keepOnlyOrientation copies the picture data byte for byte and keeps
// only the blocks a browser needs to draw it, plus a fresh, minimal note saying
// which way is up. So the copy shows the same picture, upright, and carries no location.

const SOI = 0xd8; // start of the file
const EOI = 0xd9; // end of the picture
const SOS = 0xda; // start of a pass of picture data
const APP0 = 0xe0; // JFIF: pixel shape, needed
const APP1 = 0xe1; // EXIF and XMP: camera notes, location
const APP2 = 0xe2; // the colour profile (kept), or extra pictures (dropped)
const APP14 = 0xee; // Adobe: how the colours are stored, needed
const COM = 0xfe; // a text comment

const CUT_OFF = 'this JPEG is cut off before the end of its picture data';

export function isJpeg(buf) {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === SOI && buf[2] === 0xff;
}

// Markers that stand alone, with no length or contents.
function hasNoLength(marker) {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);
}

function keepBlock(marker, contents) {
  if (marker === APP0 || marker === APP14) return true;
  if (marker === APP2) return contents.subarray(0, 12).toString('latin1') === 'ICC_PROFILE\0';
  if (marker >= APP1 && marker <= 0xef) return false; // every other application note
  if (marker === COM) return false;
  return true; // tables and frame headers the picture needs
}

// Reads the block at `at`; returns its marker, where its contents start, and where it ends.
// Reading past the end of the file throws.
function block(buf, at) {
  if (buf[at] !== 0xff) throw new Error(CUT_OFF);
  let i = at + 1;
  while (buf[i] === 0xff) i++; // fill bytes
  const marker = buf[i];
  if (hasNoLength(marker)) return { marker, body: i + 1, end: i + 1 };
  return { marker, body: i + 3, end: i + 1 + buf.readUInt16BE(i + 1) };
}

// Skips the coded picture data after a start-of-scan block; returns where the next marker starts.
// Inside the data, FF 00 is an escaped FF byte, FF D0 to FF D7 are restart markers,
// and FF FF is a fill byte; none of them ends the data.
function skipScan(buf, at) {
  for (let i = at; i + 1 < buf.length; i++) {
    const next = buf[i + 1];
    if (buf[i] === 0xff && next !== 0x00 && next !== 0xff && !(next >= 0xd0 && next <= 0xd7)) return i;
  }
  throw new Error(CUT_OFF);
}

// A minimal EXIF note holding only the orientation (2 to 8).
function orientationNote(orientation) {
  // prettier-ignore
  const tiff = Buffer.from([
    0x4d, 0x4d, 0, 42, 0, 0, 0, 8, // big-endian TIFF header; the tags start at byte 8
    0, 1, // one tag:
    0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, // Orientation, one 16-bit number
    0, 0, 0, 0, // no more tags
  ]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  return Buffer.concat([Buffer.from([0xff, APP1, 0, payload.length + 2]), payload]);
}

// Returns a copy of the JPEG with the same picture and no hidden notes, except the
// orientation when it isn't the plain upright 1. Anything after the end of the
// picture (extra pictures some phones add) is dropped too.
export function keepOnlyOrientation(buf, orientation) {
  if (!isJpeg(buf)) throw new Error("this file isn't a JPEG");
  const parts = [buf.subarray(0, 2)];
  if (orientation >= 2 && orientation <= 8) parts.push(orientationNote(orientation));
  let at = 2;
  for (;;) {
    let b;
    try {
      b = block(buf, at);
    } catch {
      throw new Error(CUT_OFF);
    }
    if (b.marker === EOI) {
      parts.push(buf.subarray(at, b.end));
      return Buffer.concat(parts);
    }
    if (keepBlock(b.marker, buf.subarray(b.body, b.end))) parts.push(buf.subarray(at, b.end));
    at = b.end;
    if (b.marker === SOS) {
      at = skipScan(buf, at);
      parts.push(buf.subarray(b.end, at));
    }
  }
}
