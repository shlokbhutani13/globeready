const maxBytes = 10 * 1024 * 1024;
const allowed = new Set(["application/pdf", "image/png", "image/jpeg"]);
// OCR decodes the whole image into memory (about 4 bytes per pixel), so very large photos can crash a phone's tab.
export const imageLimits = Object.freeze({ maxSide: 8_000, maxMegapixels: 25 });
const headerBytes = 256 * 1024;

async function header(file, length) {
  const slice = file.slice(0, length);
  if (typeof slice.arrayBuffer === "function") return new Uint8Array(await slice.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.readAsArrayBuffer(slice);
  });
}

function matches(type, bytes) {
  if (type === "application/pdf") return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  if (type === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return false;
}

const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

// Reads width and height from the PNG IHDR chunk or the JPEG start-of-frame segment without decoding pixels.
export function readImageDimensions(bytes, type) {
  if (type === "image/png") {
    if (bytes.length < 24 || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (type === "image/jpeg") {
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (marker === 0xff) { offset += 1; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      if (marker === 0xd9 || marker === 0xda) return null;
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (startOfFrame.has(marker)) {
        if (offset + 8 >= bytes.length) return null;
        return { height: (bytes[offset + 5] << 8) | bytes[offset + 6], width: (bytes[offset + 7] << 8) | bytes[offset + 8] };
      }
      offset += 2 + length;
    }
  }
  return null;
}

export async function validateLocalFile(file) {
  if (!file || !allowed.has(file.type)) throw new Error("Choose a PDF, PNG, or JPEG file.");
  if (!Number.isFinite(file.size) || file.size < 1 || file.size > maxBytes) throw new Error("Files must be 10 MB or smaller.");
  const bytes = await header(file, file.type === "application/pdf" ? 8 : headerBytes);
  if (!matches(file.type, bytes)) throw new Error("The file contents do not match its declared type.");
  const metadata = { name: String(file.name || "document").slice(0, 200), contentType: file.type, size: file.size };
  if (file.type === "application/pdf") return metadata;
  const dimensions = readImageDimensions(bytes, file.type);
  if (!dimensions || !dimensions.width || !dimensions.height) throw new Error("The image dimensions could not be read. Save it again as a PNG or JPEG and retry.");
  const { maxSide, maxMegapixels } = imageLimits;
  if (dimensions.width > maxSide || dimensions.height > maxSide) {
    throw new Error(`Images must be at most ${maxSide.toLocaleString("en-US")} pixels on each side. Resize or crop the photo and try again.`);
  }
  if (dimensions.width * dimensions.height > maxMegapixels * 1_000_000) {
    throw new Error(`Images must be at most ${maxMegapixels} megapixels. Resize or crop the photo and try again.`);
  }
  return { ...metadata, ...dimensions };
}

export const localDocumentMaxBytes = maxBytes;
