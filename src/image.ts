const MAX_EDGE = 1600;

/** Downscale and re-encode to WebP so images stay small enough for KV and fast on mobile. */
export async function compressImage(file: Blob): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const out = await canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
  return out.size < file.size || file.type !== out.type ? out : file;
}

export function imagesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files: File[] = [];
  for (const it of Array.from(data.items ?? [])) {
    if (it.kind === "file" && it.type.startsWith("image/")) {
      const f = it.getAsFile();
      if (f) files.push(f);
    }
  }
  if (!files.length) for (const f of Array.from(data.files ?? [])) if (f.type.startsWith("image/")) files.push(f);
  return files;
}
