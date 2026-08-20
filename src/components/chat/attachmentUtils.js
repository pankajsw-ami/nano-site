import { supabase } from "../../lib/supabaseClient";

export const CHAT_ATTACHMENT_BUCKET = "chat-attachments";
export const CHAT_ATTACHMENT_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.stl,.obj";

const ATTACHMENT_RULES = {
  jpg: { maxBytes: 10 * 1024 * 1024, mimeTypes: ["image/jpeg"], storageMime: "image/jpeg" },
  jpeg: { maxBytes: 10 * 1024 * 1024, mimeTypes: ["image/jpeg"], storageMime: "image/jpeg" },
  png: { maxBytes: 10 * 1024 * 1024, mimeTypes: ["image/png"], storageMime: "image/png" },
  webp: { maxBytes: 10 * 1024 * 1024, mimeTypes: ["image/webp"], storageMime: "image/webp" },
  pdf: { maxBytes: 25 * 1024 * 1024, mimeTypes: ["application/pdf"], storageMime: "application/pdf" },
  stl: {
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: ["model/stl", "application/sla", "application/octet-stream"],
    storageMime: "model/stl",
  },
  obj: {
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: ["model/obj", "text/plain", "application/octet-stream"],
    storageMime: "model/obj",
  },
};

function fileExtension(fileName) {
  return String(fileName || "").split(".").pop()?.toLowerCase() || "";
}

export function isImageAttachment(attachment) {
  const type = attachment?.type || attachment?.attachment_type || "";
  const name = attachment?.name || attachment?.attachment_name || "";
  return type.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(fileExtension(name));
}

export function formatAttachmentSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateChatAttachment(file) {
  if (!file) return { valid: false, error: "Choose a file first." };

  const extension = fileExtension(file.name);
  const rule = ATTACHMENT_RULES[extension];
  if (!rule) {
    return { valid: false, error: "Unsupported file. Use JPG, PNG, WEBP, PDF, STL, or OBJ." };
  }

  const mimeType = String(file.type || "").toLowerCase();
  if (mimeType && !rule.mimeTypes.includes(mimeType)) {
    return { valid: false, error: `The .${extension} file has an unsupported MIME type.` };
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { valid: false, error: "The selected file is empty." };
  }

  if (file.size > rule.maxBytes) {
    const limit = rule.maxBytes / (1024 * 1024);
    return {
      valid: false,
      error: `${extension.toUpperCase()} files must be ${limit} MB or smaller.`,
    };
  }

  return {
    valid: true,
    extension,
    mimeType: mimeType || rule.storageMime,
    maxBytes: rule.maxBytes,
  };
}

function safeFileName(fileName, extension) {
  const cleaned = String(fileName || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || `attachment.${extension}`;
}

function uniqueObjectId() {
  return window.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function uploadChatAttachment({ file, customerUserId, conversationId }) {
  const validation = validateChatAttachment(file);
  if (!validation.valid) throw new Error(validation.error);

  const objectPath = [
    customerUserId,
    conversationId,
    `${uniqueObjectId()}-${safeFileName(file.name, validation.extension)}`,
  ].join("/");

  const { error } = await supabase.storage
    .from(CHAT_ATTACHMENT_BUCKET)
    .upload(objectPath, file, {
      cacheControl: "3600",
      contentType: validation.mimeType,
      upsert: false,
    });

  if (error) throw error;

  return {
    attachment_path: objectPath,
    attachment_name: String(file.name || `attachment.${validation.extension}`).slice(0, 255),
    attachment_type: validation.mimeType,
    attachment_size: file.size,
  };
}

export async function downloadChatAttachment({ attachmentPath, attachmentName }) {
  if (!attachmentPath) throw new Error("The attachment path is missing.");

  const { data, error } = await supabase.storage
    .from(CHAT_ATTACHMENT_BUCKET)
    .download(attachmentPath);

  if (error || !data) throw error || new Error("The attachment is unavailable.");

  const objectUrl = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = attachmentName || "chat-attachment";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
