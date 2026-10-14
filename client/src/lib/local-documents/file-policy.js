const maxBytes = 10 * 1024 * 1024;
const allowed = new Set(["application/pdf", "image/png", "image/jpeg"]);

async function header(file, length = 8) {
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

export async function validateLocalFile(file) {
  if (!file || !allowed.has(file.type)) throw new Error("Choose a PDF, PNG, or JPEG file.");
  if (!Number.isFinite(file.size) || file.size < 1 || file.size > maxBytes) throw new Error("Files must be 10 MB or smaller.");
  if (!matches(file.type, await header(file))) throw new Error("The file contents do not match its declared type.");
  return { name: String(file.name || "document").slice(0, 200), contentType: file.type, size: file.size };
}

export const localDocumentMaxBytes = maxBytes;
