import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import ChatWindow from "./ChatWindow";
import { uploadChatAttachment, validateChatAttachment } from "./attachmentUtils";
import { getChatError, mergeChatMessage, formatChatPrice } from "./chatUtils";
import {
  isConversationActivelyViewed,
  NotificationPermissionButton,
  showChatNotification,
} from "./notificationUtils";

const CUSTOMER_CONVERSATION_COLUMNS = "id, customer_user_id, customer_name, customer_phone, product_id, product_name, product_price, created_at, updated_at, admin_hidden";

async function ensureAnonymousUser() {
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

async function findCustomerConversation(userId) {
  const { data, error } = await supabase
    .from("conversations")
    .select(CUSTOMER_CONVERSATION_COLUMNS)
    .eq("customer_user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function findOrCreateCustomerConversation({ user, name, phone, product }) {
  const existingConversation = await findCustomerConversation(user.id);
  if (existingConversation) return existingConversation;

  const { data, error: createError } = await supabase
    .from("conversations")
    .insert({
      customer_user_id: user.id,
      customer_name: name,
      customer_phone: phone,
      product_id: product?.id ? String(product.id) : null,
      product_name: product?.name || null,
      product_price: product?.price !== undefined ? Number(product.price) : null,
    })
    .select(CUSTOMER_CONVERSATION_COLUMNS)
    .single();

  if (!createError) return data;

  // A second tab can pass the lookup before the first tab inserts. The
  // unique customer index makes that race safe; reuse the winning row.
  if (createError.code === "23505") {
    const racedConversation = await findCustomerConversation(user.id);
    if (racedConversation) return racedConversation;
  }

  throw createError;
}

function productLabel(product) {
  if (!product?.name) return "General enquiry";
  return `${product.name}${product.price !== undefined ? ` · ${formatChatPrice(product.price)}` : ""}`;
}

export default function CustomerChat({
  open,
  onClose,
  onNotificationClick,
  product,
  initialMessage = "",
  onUnreadCount,
}) {
  const [stage, setStage] = useState("idle");
  const [profile, setProfile] = useState({ name: "", phone: "" });
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const pendingEnquiryRef = useRef("");
  const pendingReadIdsRef = useRef(new Set());
  const readTimerRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setStage("idle");
      setSelectedAttachment(null);
      pendingEnquiryRef.current = "";
      return undefined;
    }

    let cancelled = false;
    pendingEnquiryRef.current = initialMessage.trim();

    const prepareChat = async () => {
      setStage("connecting");
      setError("");
      setLoading(true);

      try {
        const user = await ensureAnonymousUser();
        const existingConversation = await findCustomerConversation(user.id);
        if (cancelled) return;

        if (existingConversation) {
          setConversation(existingConversation);
          setProfile({
            name: existingConversation.customer_name || "",
            phone: existingConversation.customer_phone || "",
          });
          setStage("chat");
        } else {
          setConversation(null);
          setStage("profile");
        }
      } catch (chatError) {
        if (!cancelled) {
          setStage("error");
          setError(getChatError(chatError, "Unable to connect to chat right now."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    prepareChat();
    return () => {
      cancelled = true;
    };
  }, [open, initialMessage]);

  const sendCustomerMessage = useCallback(async (conversationId, message, attachment = null) => {
    const trimmedMessage = message.trim();
    if ((!trimmedMessage && !attachment) || !conversationId) return false;

    setSending(true);
    setError("");
    try {
      const attachmentMetadata = attachment
        ? await uploadChatAttachment({
            file: attachment,
            customerUserId: conversation.customer_user_id,
            conversationId,
          })
        : {};
      const { data, error: sendError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_type: "customer",
          message: trimmedMessage || null,
          is_read: false,
          ...attachmentMetadata,
        })
        .select("*")
        .single();

      if (sendError) throw sendError;
      if (data) setMessages((current) => mergeChatMessage(current, data));
      setSending(false);
      return true;
    } catch (sendError) {
      setError(getChatError(sendError, "Your message could not be sent."));
      setSending(false);
      return false;
    }
  }, [conversation?.customer_user_id]);

  const markAdminMessagesRead = useCallback(async (messageIds, conversationId) => {
    if (!messageIds?.length || !conversationId) return;
    const { error: updateError } = await supabase
      .from("messages")
      .update({ is_read: true })
      .in("id", messageIds)
      .eq("conversation_id", conversationId)
      .eq("sender_type", "admin")
      .eq("is_read", false);

    if (updateError) {
      setError(getChatError(updateError, "Messages could not be marked as read."));
      return;
    }

    setMessages((current) => current.map((message) => (
      messageIds.includes(message.id) ? { ...message, is_read: true } : message
    )));
    onUnreadCount?.(0);
  }, [onUnreadCount]);

  const queueAdminMessagesRead = useCallback((messageIds, conversationId) => {
    if (!messageIds?.length || !conversationId) return;
    messageIds.forEach((messageId) => pendingReadIdsRef.current.add(messageId));
    if (readTimerRef.current) return;

    readTimerRef.current = window.setTimeout(() => {
      const queuedIds = Array.from(pendingReadIdsRef.current);
      pendingReadIdsRef.current = new Set();
      readTimerRef.current = null;
      void markAdminMessagesRead(queuedIds, conversationId);
    }, 60);
  }, [markAdminMessagesRead]);

  useEffect(() => {
    if (!open || !conversation?.id) return undefined;

    let cancelled = false;
    const conversationId = conversation.id;

    const loadMessages = async () => {
      setLoading(true);
      setError("");
      const { data, error: messagesError } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      if (messagesError) {
        setError(getChatError(messagesError, "Unable to load your messages."));
      } else {
        const loadedMessages = data || [];
        setMessages(loadedMessages);
        const unreadAdminIds = loadedMessages
          .filter((message) => message.sender_type === "admin" && !message.is_read)
          .map((message) => message.id);
        if (unreadAdminIds.length) {
          await markAdminMessagesRead(unreadAdminIds, conversationId);
        } else {
          onUnreadCount?.(0);
        }

        const pendingEnquiry = pendingEnquiryRef.current;
        if (pendingEnquiry) {
          const sent = await sendCustomerMessage(conversationId, pendingEnquiry);
          if (sent) pendingEnquiryRef.current = "";
        }
      }
      setLoading(false);
    };

    loadMessages();

    const channel = supabase
      .channel(`customer-chat-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (payload.eventType === "INSERT" && payload.new?.sender_type === "admin") {
            const activelyViewed = isConversationActivelyViewed({
              chatOpen: open,
              conversationId,
              activeConversationId: conversationId,
            });
            if (!activelyViewed) {
              showChatNotification({
                message: payload.new,
                title: "New message from Nano Aakriti",
                conversationId,
                onClick: onNotificationClick,
              });
            }
          }
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            setMessages((current) => mergeChatMessage(current, payload.new));
            if (payload.eventType === "INSERT" && payload.new.sender_type === "admin" && !payload.new.is_read) {
              queueAdminMessagesRead([payload.new.id], conversationId);
            }
          }
        }
      )
      .subscribe((status) => {
        if (!cancelled && (status === "CHANNEL_ERROR" || status === "TIMED_OUT")) {
          setError("Realtime chat updates are unavailable. You can still try sending a message.");
        }
      });

    return () => {
      if (readTimerRef.current) {
        window.clearTimeout(readTimerRef.current);
        readTimerRef.current = null;
      }
      pendingReadIdsRef.current = new Set();
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [open, conversation?.id, markAdminMessagesRead, onNotificationClick, onUnreadCount, queueAdminMessagesRead, sendCustomerMessage]);

  const startConversation = async (event) => {
    event.preventDefault();
    const name = profile.name.trim();
    const phone = profile.phone.trim();
    if (!name || !phone) {
      setError("Please enter your name and phone number first.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const user = await ensureAnonymousUser();
      const newOrExistingConversation = await findOrCreateCustomerConversation({
        user,
        name,
        phone,
        product,
      });

      setConversation(newOrExistingConversation);
      setProfile({
        name: newOrExistingConversation.customer_name || name,
        phone: newOrExistingConversation.customer_phone || phone,
      });
      setStage("chat");
    } catch (chatError) {
      setError(getChatError(chatError, "Unable to start the conversation."));
    } finally {
      setLoading(false);
    }
  };

  const handleAttachmentSelected = (file) => {
    const validation = validateChatAttachment(file);
    if (!validation.valid) {
      setSelectedAttachment(null);
      setError(validation.error);
      return;
    }
    setError("");
    setSelectedAttachment(file);
  };

  const sendMessage = async () => {
    const draftMessage = draft.trim();
    const productChanged = product?.id
      && String(product.id) !== String(conversation?.product_id || "");
    const productContext = productChanged
      ? `Product enquiry: ${product.name}${product.price !== undefined ? ` · ${formatChatPrice(product.price)}` : ""}`
      : "";
    const message = productChanged
      ? `${productContext}${draftMessage ? `\n\n${draftMessage}` : ""}`
      : draftMessage;
    if ((!draftMessage && !selectedAttachment && !productChanged) || !conversation?.id || sending) return;

    const sent = await sendCustomerMessage(conversation.id, message, selectedAttachment);
    if (sent) {
      setDraft("");
      setSelectedAttachment(null);
    }
  };

  if (!open) return null;

  const shownProduct = product || (conversation?.product_name
    ? { name: conversation.product_name, price: conversation.product_price }
    : null);

  return (
    <div className="chat-modal-backdrop" onClick={onClose}>
      <div className="chat-customer-panel" onClick={(event) => event.stopPropagation()}>
        <div className="chat-customer-topbar">
          <div>
            <span className="chat-eyebrow">Nano Aakriti</span>
            <h2>Chat with us</h2>
          </div>
          <NotificationPermissionButton className="chat-customer-notification-control" />
          <button type="button" className="chat-close-button" onClick={onClose} aria-label="Close chat">
            ×
          </button>
        </div>

        {stage === "connecting" && (
          <div className="chat-status-card">
            <span className="chat-spinner" aria-hidden="true" />
            <p>{loading ? "Connecting securely..." : "Loading your conversation..."}</p>
          </div>
        )}

        {stage === "error" && (
          <div className="chat-status-card chat-status-card-error">
            <p>{error}</p>
            <button type="button" className="chat-secondary-button" onClick={onClose}>
              Close and try again
            </button>
          </div>
        )}

        {stage === "profile" && (
          <form className="chat-profile-form" onSubmit={startConversation}>
            <p className="chat-intro">Tell us who we’re speaking with, then send your enquiry about physical 3D printed products.</p>
            {shownProduct?.name && (
              <div className="chat-product-context">
                <span>Enquiring about</span>
                <strong>{productLabel(shownProduct)}</strong>
              </div>
            )}
            <label>
              Your name
              <input
                value={profile.name}
                onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))}
                placeholder="Enter your name"
                autoComplete="name"
                maxLength={120}
                required
              />
            </label>
            <label>
              Phone number
              <input
                value={profile.phone}
                onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))}
                placeholder="Enter your phone number"
                autoComplete="tel"
                maxLength={32}
                required
              />
            </label>
            {error && <p className="chat-inline-error">{error}</p>}
            <button type="submit" className="chat-primary-button" disabled={loading}>
              {loading ? "Starting chat..." : "Start chat"}
            </button>
          </form>
        )}

        {stage === "chat" && conversation && (
          <ChatWindow
            title={shownProduct?.name ? `Enquiry: ${shownProduct.name}` : "Your enquiry"}
            subtitle={shownProduct?.price !== undefined && shownProduct?.price !== null ? formatChatPrice(shownProduct.price) : "We usually reply as soon as possible"}
            messages={messages}
            draft={draft}
            onDraftChange={setDraft}
            onSend={sendMessage}
            attachment={selectedAttachment}
            onAttachmentSelected={handleAttachmentSelected}
            onRemoveAttachment={() => setSelectedAttachment(null)}
            sending={sending}
            disabled={loading}
            currentSender="customer"
            error={error}
            compact
          />
        )}
      </div>
    </div>
  );
}
