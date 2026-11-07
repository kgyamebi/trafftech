import { z } from "zod";

export function cleanText(value: unknown, max = 240): string {
  return String(value ?? "")
    .replace(/\0/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export const plateSchema = z
  .string()
  .transform((s) => cleanText(s, 16).toUpperCase())
  .pipe(z.string().min(4, "Enter the plate as printed.").max(16).regex(/^[A-Z0-9][A-Z0-9 \-]+$/, "Use letters, numbers and a hyphen."));

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email.")
  .max(120);

export const passwordSchema = z.string().min(8, "Use at least 8 characters.").max(200);

export const nameSchema = z.string().trim().min(2, "Enter your name.").max(80);

export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 80) || "document";
}

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/webm",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "text/plain",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const ALLOWED_EXT = /\.(pdf|jpe?g|png|webp|gif|heic|heif|docx|xlsx|csv|txt|json|mp4|webm|mov|m4a|mp3|wav)$/i;

export function allowedUpload(name: string, type: string): boolean {
  if (ALLOWED_MIME.has(type)) return true;
  if (type && type !== "application/octet-stream") return false;
  return ALLOWED_EXT.test(name);
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
