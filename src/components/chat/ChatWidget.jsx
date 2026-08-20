import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import "./chat.css";
import CustomerChat from "./CustomerChat";
import { showChatNotification } from "./notificationUtils";

function ChatBubbleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 8.7 3.9a8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

export default function ChatWidget({ open, product, initialMessage = "", onOpen, onClose }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const onCloseRef = useRef(onClose);
onCloseRef.current = onClose;

const chatHistoryRef = useRef(false);
const closingChatRef = useRef(false);
  const handleNotificationClick = useCallback(() => {
    onOpenRef.current(null);
  }, []);
  const handleChatClose = useCallback(() => {
  if (!open) return;

  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 700px)").matches;

  if (isMobile && chatHistoryRef.current) {
    closingChatRef.current = true;
    window.history.back();
    return;
  }

  onClose?.();
}, [open, onClose]);
  const handleCustomerUnreadCount = useCallback((count) => {
    setUnreadCount(Math.max(0, Number(count) || 0));
  }, []);
useEffect(() => {
  if (!open || typeof window === "undefined") return;

  const isMobile = window.matchMedia("(max-width: 700px)").matches;

  if (!isMobile || chatHistoryRef.current) return;

  const currentState =
    window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};

  window.history.pushState(
    { ...currentState, nanoAakritiChatOpen: true },
    "",
    window.location.href
  );

  chatHistoryRef.current = true;

  const handlePopState = () => {
    chatHistoryRef.current = false;
    closingChatRef.current = false;
    onCloseRef.current?.();
  };

  window.addEventListener("popstate", handlePopState);

  return () => {
    window.removeEventListener("popstate", handlePopState);
  };
}, [open]);
useEffect(() => {
  if (!open || typeof window === "undefined") return;

  const isMobile = window.matchMedia("(max-width: 700px)").matches;

  if (!isMobile) return;

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  return () => {
    document.body.style.overflow = previousOverflow;
  };
}, [open]);
  // While the modal is closed, this is the single customer-side Realtime
  // watcher. CustomerChat takes over the conversation subscription when open.
  useEffect(() => {
    if (open) return undefined;

    let cancelled = false;
    let channel = null;

    const refreshUnreadCount = async (conversationId) => {
      const { count, error } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .eq("sender_type", "admin")
        .eq("is_read", false);

      if (!cancelled && !error) handleCustomerUnreadCount(count || 0);
    };

    const watchCustomerConversation = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user || !user.is_anonymous || cancelled) {
        if (!cancelled) handleCustomerUnreadCount(0);
        return;
      }

      const { data: conversation, error } = await supabase
        .from("conversations")
        .select("id")
        .eq("customer_user_id", user.id)
        .maybeSingle();

      if (cancelled || error || !conversation) {
        if (!cancelled) handleCustomerUnreadCount(0);
        return;
      }

      await refreshUnreadCount(conversation.id);
      if (cancelled) return;

      channel = supabase
        .channel(`customer-unread-${conversation.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` },
          (payload) => {
            const message = payload.new;
            if (message?.sender_type !== "admin") return;
            if (payload.eventType === "INSERT" && !message.is_read) {
              setUnreadCount((current) => current + 1);
              showChatNotification({
                message,
                title: "New message from Nano Aakriti",
                conversationId: conversation.id,
                onClick: handleNotificationClick,
              });
            } else if (payload.eventType === "UPDATE") {
              void refreshUnreadCount(conversation.id);
            }
          }
        )
        .subscribe();
    };

    void watchCustomerConversation();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [open, handleCustomerUnreadCount, handleNotificationClick]);

  return (
    <>
      <button
        type="button"
        className="chat-floating-button"
        onClick={() => onOpen(null)}
        aria-label={unreadCount ? `Chat with us, ${unreadCount} unread message${unreadCount === 1 ? "" : "s"}` : "Chat with us"}
      >
        <ChatBubbleIcon />
        <span>Chat with us</span>
        {unreadCount > 0 && (
          <span className="chat-floating-unread-badge" aria-live="polite">
            {unreadCount}
          </span>
        )}
      </button>
      <CustomerChat
        open={open}
        product={product}
        initialMessage={initialMessage}
        onUnreadCount={handleCustomerUnreadCount}
        onNotificationClick={handleNotificationClick}
        onClose={handleChatClose}
      />
    </>
  );
}
