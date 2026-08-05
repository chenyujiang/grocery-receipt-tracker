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

interface DecodedImage {
  width: number;
  height: number;
  source: CanvasImageSource;
  close?: () => void;
}

// createImageBitmap decodes straight from the File/Blob, without first
// building a giant base64 data: URL in memory — which is what made large
// phone camera photos (12-48MP, tens of MB) unreliable to decode via the
// <img> fallback below on memory-constrained mobile browsers.
async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
  }
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImageElement(dataUrl);
  return { width: img.naturalWidth, height: img.naturalHeight, source: img };
}

// Section 6: phone camera photos can be several thousand pixels wide and
// multiple MB — comfortably over Vercel's request-body limit once base64
// encoded, and sometimes over Claude's own per-image limit too. Downscaling
// to a JPEG here fixes both, at a resolution still more than enough for OCR.
// If decoding fails outright (a format the browser can't read), the upload
// is rejected here with a clear message rather than silently sending the
// original, oversized/unsupported file through to fail later with a
// cryptic error. Thin browser Image/Canvas wrapper — not unit-tested
// directly (jsdom doesn't decode real images); uploadReceipt's tests mock
// this module at the boundary instead.
export async function resizeImageForUpload(file: File): Promise<ResizedImage> {
  let decoded: DecodedImage;
  try {
    decoded = await decodeImage(file);
  } catch {
    throw new Error(
      "Couldn't read this photo — try a different one, or set your camera to JPEG instead of HEIC (Settings > Camera > Formats on iPhone)."
    );
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(decoded.width, decoded.height));
    const width = Math.round(decoded.width * scale);
    const height = Math.round(decoded.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx || width === 0 || height === 0) {
      throw new Error("Canvas 2D context unavailable");
    }
    ctx.drawImage(decoded.source, 0, 0, width, height);

    return { base64: toBase64(canvas.toDataURL("image/jpeg", JPEG_QUALITY)), mediaType: "image/jpeg" };
  } finally {
    decoded.close?.();
  }
}
