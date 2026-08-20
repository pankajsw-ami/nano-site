export function formatChatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatChatPrice(price) {
  if (price === null || price === undefined || price === "") return "";
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice)) return String(price);
  return `Rs. ${numericPrice.toLocaleString("en-IN")}`;
}

export function mergeChatMessage(messages, nextMessage) {
  if (!nextMessage?.id) return messages;

  const withoutExisting = messages.filter((message) => message.id !== nextMessage.id);
  return [...withoutExisting, nextMessage].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export function getChatError(error, fallback = "Something went wrong. Please try again.") {
  const message = error?.message || error?.error_description;
  if (!message) return fallback;

  if (message.toLowerCase().includes("anonymous")) {
    return "Guest chat is not available right now. Please try again later.";
  }

  return message;
}
