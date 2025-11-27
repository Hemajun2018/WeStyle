export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // for JPEG
}

const DEFAULTS: Required<CompressOptions> = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.85,
};

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<{ blob: Blob; width: number; height: number; mimeType: string; originalSize: number; compressedSize: number; }>{
  const { maxWidth, maxHeight, quality } = { ...DEFAULTS, ...opts };
  const mime = file.type || 'application/octet-stream';
  const originalSize = file.size;

  // Bypass for GIF/SVG
  if (/image\/(gif|svg\+xml)/i.test(mime)) {
    return { blob: file, width: 0, height: 0, mimeType: mime, originalSize, compressedSize: originalSize };
  }

  // Prefer to keep PNG as PNG (preserve transparency), others to JPEG
  const targetMime = /image\/png/i.test(mime) ? 'image/png' : 'image/jpeg';

  const dataUrl = await fileToDataURL(file);
  const img = await loadImage(dataUrl);

  const { width, height } = constrainSize(img.naturalWidth || img.width, img.naturalHeight || img.height, maxWidth, maxHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  if (targetMime === 'image/jpeg') {
    // Fill white background for JPEG to avoid black in transparent areas
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), targetMime, targetMime === 'image/jpeg' ? quality : undefined));
  const compressedSize = blob.size;

  // If compression is larger, fallback to original
  if (compressedSize > originalSize) {
    return { blob: file, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height, mimeType: mime, originalSize, compressedSize: originalSize };
  }
  return { blob, width, height, mimeType: targetMime, originalSize, compressedSize };
}

function constrainSize(w: number, h: number, maxW: number, maxH: number) {
  let width = w;
  let height = h;
  const ratio = Math.min(maxW / width, maxH / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);
  return { width, height };
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

