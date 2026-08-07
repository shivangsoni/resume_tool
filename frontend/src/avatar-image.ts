/** Resize an image file to a square JPEG data URL suitable for profile avatars. */
export async function readImageAsAvatarDataUrl(file: File, size = 256, quality = 0.82): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Image must be under 8 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const bitmap = await createImageBitmap(file).catch(async () => {
      const img = await loadHtmlImage(objectUrl);
      return createImageBitmap(img);
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image.");

    const scale = Math.max(size / bitmap.width, size / bitmap.height);
    const drawW = bitmap.width * scale;
    const drawH = bitmap.height * scale;
    const dx = (size - drawW) / 2;
    const dy = (size - drawH) / 2;
    ctx.fillStyle = "#f3f2f1";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(bitmap, dx, dy, drawW, drawH);
    bitmap.close();

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length > 350_000) {
      throw new Error("Image is still too large after compression. Try a simpler photo.");
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadHtmlImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = src;
  });
}
