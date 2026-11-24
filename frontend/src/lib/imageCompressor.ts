// =============================================================================
// Client-Side Image Compressor & EXIF/GPS Metadata Stripper (ADR-004)
// - Renders user photo onto an HTML5 <canvas> capped at 1280px longest edge
// - Re-encodes as WebP (quality ~0.78, steps down if needed to target <= 150 KB)
// - Canvas pixel re-encoding strips 100% of EXIF, GPS location, and camera metadata
//   for strict PDPA (Zero PII) compliance before upload.
// =============================================================================

export interface CompressedPhotoItem {
  id: string;
  file: File;
  previewUrl: string;
  originalName: string;
  originalBytes: number;
  compressedBytes: number;
  width: number;
  height: number;
  mimeType: string;
}

const MAX_DIMENSION_PX = 1280;
const INITIAL_QUALITY = 0.78;
const TARGET_MAX_BYTES = 150 * 1024; // 150 KB target per ADR-004
const HARD_MAX_BYTES = 480 * 1024; // Well under Backend's 512 KB limit

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`ไม่สามารถอ่านไฟล์รูปภาพ "${file.name}" ได้ กรุณาเลือกไฟล์รูปภาพมาตรฐาน (JPG, PNG, WebP)`));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('ไม่สามารถบีบอัดรูปภาพได้'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

/**
 * Compresses an input image File to WebP (<= 150 KB target, max 1280px longest edge)
 * and strips all EXIF/GPS metadata by drawing through an HTML5 Canvas.
 */
export async function compressImageToWebP(
  sourceFile: File,
  indexHint = 1
): Promise<CompressedPhotoItem> {
  if (!sourceFile.type.startsWith('image/')) {
    throw new Error(`ไฟล์ "${sourceFile.name}" ไม่ใช่ไฟล์รูปภาพ`);
  }

  const img = await loadImageElement(sourceFile);
  const srcWidth = img.naturalWidth || img.width || 800;
  const srcHeight = img.naturalHeight || img.height || 600;

  let targetWidth = srcWidth;
  let targetHeight = srcHeight;

  if (srcWidth > MAX_DIMENSION_PX || srcHeight > MAX_DIMENSION_PX) {
    if (srcWidth >= srcHeight) {
      targetWidth = MAX_DIMENSION_PX;
      targetHeight = Math.max(1, Math.round((srcHeight * MAX_DIMENSION_PX) / srcWidth));
    } else {
      targetHeight = MAX_DIMENSION_PX;
      targetWidth = Math.max(1, Math.round((srcWidth * MAX_DIMENSION_PX) / srcHeight));
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('เบราว์เซอร์ไม่รองรับการประมวลผลรูปภาพ (HTML5 Canvas 2D)');
  }

  // Fill background with dark neutral in case of transparent PNG
  ctx.fillStyle = '#090A10';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Try WebP first (supported in all modern browsers); fallback to JPEG if browser lacks WebP encode
  let outputMime = 'image/webp';
  let quality = INITIAL_QUALITY;
  let blob = await canvasToBlob(canvas, outputMime, quality);

  if (blob.type !== 'image/webp') {
    outputMime = 'image/jpeg';
  }

  // Iteratively step down quality if still above 150 KB target
  const qualitySteps = [0.68, 0.58, 0.48, 0.38];
  for (const nextQuality of qualitySteps) {
    if (blob.size <= TARGET_MAX_BYTES) {
      break;
    }
    quality = nextQuality;
    blob = await canvasToBlob(canvas, outputMime, quality);
  }

  // If still larger than 200 KB on very detailed photos, scale down canvas slightly to guarantee lightweight upload
  if (blob.size > 200 * 1024) {
    const scale = 0.78;
    targetWidth = Math.max(320, Math.round(targetWidth * scale));
    targetHeight = Math.max(240, Math.round(targetHeight * scale));
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.fillStyle = '#090A10';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    blob = await canvasToBlob(canvas, outputMime, 0.65);
  }

  if (blob.size > HARD_MAX_BYTES) {
    throw new Error(
      `รูปภาพ "${sourceFile.name}" หลังบีบอัดยังมีขนาดใหญ่เกินกำหนด กรุณาเลือกรูปอื่น`
    );
  }

  const ext = outputMime === 'image/webp' ? '.webp' : '.jpg';
  const safeBaseName = `emms_photo_${Date.now()}_${indexHint}${ext}`;
  const compressedFile = new File([blob], safeBaseName, {
    type: outputMime,
    lastModified: Date.now(),
  });

  const previewUrl = URL.createObjectURL(compressedFile);

  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    file: compressedFile,
    previewUrl,
    originalName: sourceFile.name,
    originalBytes: sourceFile.size,
    compressedBytes: compressedFile.size,
    width: targetWidth,
    height: targetHeight,
    mimeType: outputMime,
  };
}

export function revokePhotoPreviews(items: CompressedPhotoItem[]): void {
  for (const item of items) {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }
}
