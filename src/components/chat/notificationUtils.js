import { useEffect, useState } from "react";

const notifiedMessageIds = new Map();
const NOTIFICATION_DEDUPE_MS = 60 * 1000;

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission() {
  if (!notificationsSupported()) return "unsupported";
  return window.Notification.permission;
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return "unsupported";
  if (window.Notification.permission === "denied") return "denied";
  return window.Notification.requestPermission();
}

export function notificationPreview(message) {
  const text = String(message?.message || "").trim().replace(/\s+/g, " ");
  if (!text && message?.attachment_path) return "New attachment received";
  if (!text) return "New message received";
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

export function isConversationActivelyViewed({ chatOpen, conversationId, activeConversationId }) {
  return Boolean(
    chatOpen
    && conversationId
    && conversationId === activeConversationId
    && typeof document !== "undefined"
    && document.visibilityState === "visible"
  );
}

export function showChatNotification({
  message,
  title,
  conversationId,
  onClick,
}) {
  if (!message?.id || getNotificationPermission() !== "granted") return null;

  const now = Date.now();
  const previous = notifiedMessageIds.get(message.id);
  if (previous && now - previous < NOTIFICATION_DEDUPE_MS) return null;
  notifiedMessageIds.set(message.id, now);

  for (const [messageId, timestamp] of notifiedMessageIds.entries()) {
    if (now - timestamp >= NOTIFICATION_DEDUPE_MS) notifiedMessageIds.delete(messageId);
  }

  const notification = new window.Notification(title, {
    body: notificationPreview(message),
    tag: `nano-aakriti-chat-${message.id}`,
    renotify: false,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
    onClick?.(conversationId);
  };

  return notification;
}

export function NotificationPermissionButton({ className = "" }) {
  const [permission, setPermission] = useState(getNotificationPermission);

  useEffect(() => {
    const refreshPermission = () => setPermission(getNotificationPermission());
    window.addEventListener("focus", refreshPermission);
    return () => window.removeEventListener("focus", refreshPermission);
  }, []);

  if (permission === "unsupported") return null;
  if (permission === "granted") {
    return <span className={`chat-notification-status ${className}`}>Notifications enabled</span>;
  }
  if (permission === "denied") {
    return <span className={`chat-notification-status chat-notification-status-blocked ${className}`}>Notifications blocked — enable in browser settings</span>;
  }

  return (
    <button
      type="button"
      className={`chat-notification-button ${className}`}
      onClick={async () => setPermission(await requestNotificationPermission())}
    >
      Enable notifications
    </button>
  );
}
