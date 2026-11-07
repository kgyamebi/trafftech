"use client";

export interface ImagePass {
  detail: string;
  blob: Blob;
}

export async function imagePasses(file: Blob): Promise<ImagePass[]> {
  const bitmap = await createImageBitmap(file);
  try {
    const long = Math.max(bitmap.width, bitmap.height, 1);
    const fit = Math.min(2, 1800 / long);
    const width = Math.max(1, Math.round(bitmap.width * fit));
    const height = Math.max(1, Math.round(bitmap.height * fit));
    const base = draw(bitmap, width, height);
    const grey = greyOf(base);
    const stretched = stretch(grey);
    const ink = threshold(stretched);
    return [
      { detail: "Scaled photo", blob: await blobOf(base) },
      { detail: "Contrast stretched", blob: await blobOf(paint(stretched)) },
      { detail: "Black ink on white", blob: await blobOf(paint(ink)) },
      { detail: "Pale text flipped", blob: await blobOf(paint(invert(ink))) },
    ];
  } finally {
    bitmap.close();
  }
}

export function frameFromVideo(file: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error("video"));
    };
    video.onerror = fail;
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, Number.isFinite(video.duration) ? video.duration / 2 : 0);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const context = canvas.getContext("2d");
      if (!context) return fail();
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) resolve(blob);
        else fail();
      }, "image/png");
    };
    video.src = url;
  });
}

function draw(bitmap: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("canvas");
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function greyOf(canvas: HTMLCanvasElement): ImageData {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("canvas");
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = data.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const tone = Math.round(pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
    pixels[i] = pixels[i + 1] = pixels[i + 2] = tone;
  }
  return data;
}

function stretch(data: ImageData): ImageData {
  const pixels = data.data;
  const hist = new Array<number>(256).fill(0);
  const total = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) hist[pixels[i]] += 1;
  let low = 0;
  let high = 255;
  let seen = 0;
  for (let tone = 0; tone < 256; tone += 1) {
    seen += hist[tone];
    if (seen / total >= 0.02) {
      low = tone;
      break;
    }
  }
  seen = 0;
  for (let tone = 255; tone >= 0; tone -= 1) {
    seen += hist[tone];
    if (seen / total >= 0.02) {
      high = tone;
      break;
    }
  }
  const next = copy(data);
  if (high <= low) return next;
  for (let i = 0; i < pixels.length; i += 4) {
    const value = Math.max(0, Math.min(255, Math.round(((pixels[i] - low) / (high - low)) * 255)));
    next.data[i] = next.data[i + 1] = next.data[i + 2] = value;
  }
  return next;
}

function threshold(data: ImageData): ImageData {
  const pixels = data.data;
  const hist = new Array<number>(256).fill(0);
  const total = pixels.length / 4;
  let sum = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    hist[pixels[i]] += 1;
    sum += pixels[i];
  }
  let background = 0;
  let weight = 0;
  let best = 0;
  let level = 128;
  for (let tone = 0; tone < 256; tone += 1) {
    weight += hist[tone];
    if (!weight) continue;
    const rest = total - weight;
    if (!rest) break;
    background += tone * hist[tone];
    const left = background / weight;
    const right = (sum - background) / rest;
    const between = weight * rest * (left - right) ** 2;
    if (between > best) {
      best = between;
      level = tone;
    }
  }
  const next = copy(data);
  for (let i = 0; i < pixels.length; i += 4) {
    const value = pixels[i] > level ? 255 : 0;
    next.data[i] = next.data[i + 1] = next.data[i + 2] = value;
  }
  return next;
}

function invert(data: ImageData): ImageData {
  const next = copy(data);
  for (let i = 0; i < next.data.length; i += 4) {
    next.data[i] = 255 - next.data[i];
    next.data[i + 1] = 255 - next.data[i + 1];
    next.data[i + 2] = 255 - next.data[i + 2];
  }
  return next;
}

function copy(data: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
}

function paint(data: ImageData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = data.width;
  canvas.height = data.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  context.putImageData(data, 0, 0);
  return canvas;
}

function blobOf(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("blob"))), "image/png");
  });
}
