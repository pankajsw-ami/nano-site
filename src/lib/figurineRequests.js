import { supabase } from "./supabaseClient";

export const FIGURINE_REQUEST_BUCKET = "figurine-request-photos";
export const FIGURINE_REQUEST_STATUSES = ["New", "In Progress", "Completed", "Cancelled"];

const PHOTO_RULES = {
  "image/jpeg": { extension: "jpg", maxBytes: 10 * 1024 * 1024 },
  "image/png": { extension: "png", maxBytes: 10 * 1024 * 1024 },
  "image/webp": { extension: "webp", maxBytes: 10 * 1024 * 1024 },
};

function uniqueFileToken() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function validateFigurinePhoto(file) {
  if (!file) return { valid: false, error: "Choose a photo first." };
  const rule = PHOTO_RULES[file.type];
  if (!rule) return { valid: false, error: "Use a JPG, PNG, or WEBP photo." };
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { valid: false, error: "The selected photo is empty." };
  }
  if (file.size > rule.maxBytes) {
    return { valid: false, error: "Photos must be 10 MB or smaller." };
  }
  return { valid: true, ...rule };
}

export async function ensureAnonymousCustomer() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  if (sessionData.session?.user) {
    if (!sessionData.session.user.is_anonymous) {
      throw new Error("This browser is signed in with an administrator account.");
    }
    return sessionData.session.user;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error("Supabase did not return an anonymous user.");
  return data.user;
}

export async function uploadFigurineRequestPhoto({ userId, file }) {
  const validation = validateFigurinePhoto(file);
  if (!validation.valid) throw new Error(validation.error);

  const path = `${userId}/${uniqueFileToken()}.${validation.extension}`;
  const { error } = await supabase.storage
    .from(FIGURINE_REQUEST_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (error) throw error;
  return path;
}
