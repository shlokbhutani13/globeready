import { DocumentExtractionError } from "./extraction-errors.js";

export const maxImageSide = 6000;
export const maxImagePixels = 20_000_000;

function readUint16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]);
}

export function imageDimensions(bytes, mimeType) {
  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47];
    if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) return null;
    return { width: readUint32(bytes, 16), height: readUint32(bytes, 20) };
  }
  if (mimeType === "image/jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = readUint16(bytes, offset + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isFrame) return { height: readUint16(bytes, offset + 5), width: readUint16(bytes, offset + 7) };
      offset += 2 + length;
    }
    return null;
  }
  return null;
}

export function assertReasonableImage(bytes, mimeType) {
  const size = imageDimensions(bytes, mimeType);
  if (!size || !(size.width > 0) || !(size.height > 0)) {
    throw new DocumentExtractionError("image_unreadable", "This image could not be read. Upload a clearer PNG or JPEG.");
  }
  if (size.width > maxImageSide || size.height > maxImageSide || size.width * size.height > maxImagePixels) {
    throw new DocumentExtractionError("image_too_large", "This image has too many pixels to read safely. Upload a smaller photo.");
  }
}
