export type ImageFolder = "logo" | "hero" | "menu" | "gallery";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read this image."));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Use a JPG, PNG, or WebP image.");
  }
  if (file.size > 12 * 1024 * 1024) throw new Error("This image is too large. Please choose one under 12 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not process this image.");
    context.drawImage(image, 0, 0, width, height);
    let blob = (await canvasToBlob(canvas, "image/webp", 0.82)) || (await canvasToBlob(canvas, "image/jpeg", 0.82));
    if (blob && blob.size > 1_500_000) blob = await canvasToBlob(canvas, blob.type, 0.68);
    if (!blob || blob.size > 1_500_000) throw new Error("This image is still too large after resizing. Try a smaller photo.");
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function uploadImage(folder: ImageFolder, blob: Blob, onProgress: (value: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.onload = () => {
      const result = String(reader.result || "");
      const dataBase64 = result.includes(",") ? result.split(",").pop() || "" : result;
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/admin/media");
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("X-Khan-Baba-Request", "1");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onerror = () => reject(new Error("Network error. Check your connection and try again."));
      xhr.onload = () => {
        const data = JSON.parse(xhr.responseText || "{}") as { path?: string; error?: string };
        if (xhr.status === 401) {
          window.location.assign("/admin/login?expired=1");
          reject(new Error("Please sign in again."));
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300 || !data.path) {
          reject(new Error(data.error || "Could not upload this image."));
          return;
        }
        resolve(data.path);
      };
      xhr.send(JSON.stringify({ folder, dataBase64 }));
    };
    reader.readAsDataURL(blob);
  });
}

export async function prepareUpload(file: File, folder: ImageFolder, onProgress: (value: number) => void) {
  const prepared = await compressImage(file);
  const path = await uploadImage(folder, prepared.blob, onProgress);
  return { path, width: prepared.width, height: prepared.height };
}
