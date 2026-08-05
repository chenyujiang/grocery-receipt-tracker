const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

export interface ResizedImage {
  base64: string;
  mediaType: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = dataUrl;
  });
}

function toBase64(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

// Section 6: phone camera photos can be several thousand pixels wide and
// multiple MB — comfortably over Vercel's request-body limit once base64
// encoded — and occasionally in a format Claude doesn't accept (e.g. HEIC).
// Downscaling to a JPEG here fixes both, at a resolution still more than
// enough for OCR. Thin browser Image/Canvas wrapper — not unit-tested
// directly (jsdom doesn't decode real images); uploadReceipt's tests mock
// this module at the boundary instead.
export async function resizeImageForUpload(file: File): Promise<ResizedImage> {
  const dataUrl = await readFileAsDataUrl(file);

  try {
    const img = await loadImageElement(dataUrl);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx || width === 0 || height === 0) {
      throw new Error("Canvas 2D context unavailable");
    }
    ctx.drawImage(img, 0, 0, width, height);

    return { base64: toBase64(canvas.toDataURL("image/jpeg", JPEG_QUALITY)), mediaType: "image/jpeg" };
  } catch {
    // Decoding/resizing failed (unsupported format, corrupt file) — fall
    // back to the original, unresized file rather than blocking the upload.
    return { base64: toBase64(dataUrl), mediaType: file.type };
  }
}
