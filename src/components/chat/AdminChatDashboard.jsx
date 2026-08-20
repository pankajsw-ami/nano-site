import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import ChatWindow from "./ChatWindow";
import ConversationList from "./ConversationList";
import { uploadChatAttachment, validateChatAttachment } from "./attachmentUtils";
import { getChatError, mergeChatMessage } from "./chatUtils";
import {
  isConversationActivelyViewed,
  NotificationPermissionButton,
  showChatNotification,
} from "./notificationUtils";

function mapSearchResults(rows) {
  return (rows || []).map((conversation) => ({
    ...conversation,
    latestMessage: conversation.latest_message
      ? {
          message: conversation.latest_message,
          created_at: conversation.latest_message_created_at,
        }
      : null,
    unreadCount: Number(conversation.unread_count || 0),
  }));
}

function createAdminPresenceSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AdminChatDashboard({ requestedCustomerUserId = null, onRequestedCustomerHandled = () => {} }) {
  const [authorized, setAuthorized] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [archivedCount, setArchivedCount] = useState(0);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const activeConversationIdRef = useRef(null);
  const searchTermRef = useRef("");
  const showArchivedRef = useRef(false);
  const pendingReadIdsRef = useRef(new Set());
  const pendingReadConversationRef = useRef(null);
  const readTimerRef = useRef(null);
  const conversationLoadRequestRef = useRef(0);
  const conversationMutationVersionRef = useRef(0);
  const conversationsRef = useRef([]);
  const adminPresenceSessionIdRef = useRef(createAdminPresenceSessionId());
  const adminPresenceUserIdRef = useRef(null);

  activeConversationIdRef.current = activeConversation?.id || null;
  conversationsRef.current = conversations;

  const loadConversations = useCallback(async (
    searchTerm = searchTermRef.current,
    archived = showArchivedRef.current
  ) => {
    const requestId = conversationLoadRequestRef.current + 1;
    conversationLoadRequestRef.current = requestId;
    const mutationVersion = conversationMutationVersionRef.current;
    setLoadingConversations(true);
    const [searchResult, visibleConversationsResult, archivedCountResult] = await Promise.all([
      supabase.rpc("chat_search_conversations", {
        p_search: searchTerm,
        p_archived: archived,
      }),
      supabase
        .from("conversations")
        .select("id")
        .eq("admin_hidden", archived)
        .eq("admin_removed_from_inbox", false),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("admin_hidden", true)
        .eq("admin_removed_from_inbox", false),
    ]);

    if (requestId !== conversationLoadRequestRef.current
      || mutationVersion !== conversationMutationVersionRef.current) {
      if (requestId === conversationLoadRequestRef.current) {
        setLoadingConversations(false);
      }
      return;
    }

    if (searchResult.error || visibleConversationsResult.error || archivedCountResult.error) {
      setError(getChatError(
        searchResult.error || visibleConversationsResult.error || archivedCountResult.error,
        "Unable to load customer conversations."
      ));
    } else {
      const visibleConversationIds = new Set(
        (visibleConversationsResult.data || []).map((conversation) => conversation.id)
      );
      const nextConversations = mapSearchResults(searchResult.data).filter((conversation) => (
        conversation.admin_removed_from_inbox !== true
        && visibleConversationIds.has(conversation.id)
      ));
      setConversations(nextConversations);
      setActiveConversation((current) => {
        if (!current) return current;
        return nextConversations.find((conversation) => conversation.id === current.id) || null;
      });
      setArchivedCount(archivedCountResult.count || 0);
    }
    setLoadingConversations(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalizedSearch = searchInput.trim();
      searchTermRef.current = normalizedSearch;
      if (authorized) void loadConversations(normalizedSearch, showArchivedRef.current);
    }, 320);

    return () => window.clearTimeout(timer);
  }, [authorized, loadConversations, searchInput]);

  const markMessagesRead = useCallback(async (messageIds, conversationId = activeConversationIdRef.current) => {
    if (!messageIds?.length) return;
    if (!conversationId || activeConversationIdRef.current !== conversationId) return;
    const { error: updateError } = await supabase
      .from("messages")
      .update({ is_read: true })
      .in("id", messageIds)
      .eq("conversation_id", conversationId)
      .eq("sender_type", "customer")
      .eq("is_read", false);
    if (updateError) {
      setError(getChatError(updateError, "Messages could not be marked as read."));
      return;
    }
    setMessages((current) => current.map((message) => (
      messageIds.includes(message.id) ? { ...message, is_read: true } : message
    )));
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId
        ? { ...conversation, unreadCount: Math.max(0, conversation.unreadCount - messageIds.length) }
        : conversation
    )));
  }, []);

  const queueMessagesRead = useCallback((messageIds, conversationId) => {
    if (!messageIds?.length || !conversationId || activeConversationIdRef.current !== conversationId) return;

    if (pendingReadConversationRef.current !== conversationId) {
      pendingReadIdsRef.current = new Set();
      pendingReadConversationRef.current = conversationId;
    }
    messageIds.forEach((messageId) => pendingReadIdsRef.current.add(messageId));
    if (readTimerRef.current) return;

    readTimerRef.current = window.setTimeout(() => {
      const queuedIds = Array.from(pendingReadIdsRef.current);
      const queuedConversationId = pendingReadConversationRef.current;
      pendingReadIdsRef.current = new Set();
      pendingReadConversationRef.current = null;
      readTimerRef.current = null;
      if (activeConversationIdRef.current === queuedConversationId) {
        void markMessagesRead(queuedIds, queuedConversationId);
      }
    }, 60);
  }, [markMessagesRead]);

  const loadMessages = useCallback(async (conversationId) => {
    setLoadingMessages(true);
    setError("");
    const { data, error: messagesError } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      setError(getChatError(messagesError, "Unable to load this conversation."));
      setMessages([]);
    } else {
      const loadedMessages = data || [];
      setMessages(loadedMessages);
      await markMessagesRead(
        loadedMessages
          .filter((message) => message.sender_type === "customer" && !message.is_read)
          .map((message) => message.id),
        conversationId
      );
    }
    setLoadingMessages(false);
  }, [markMessagesRead]);

  const focusConversationFromNotification = useCallback((conversationId) => {
    const conversation = conversationsRef.current.find((item) => item.id === conversationId);
    if (!conversation) return;
    activeConversationIdRef.current = conversation.id;
    setActiveConversation(conversation);
    setMessages([]);
    setDraft("");
    setSelectedAttachment(null);
    void loadMessages(conversation.id);
  }, [loadMessages]);

  useEffect(() => {
    let cancelled = false;

    const verifyAdminAccess = async () => {
      setCheckingAccess(true);
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        if (!cancelled) {
          setError(getChatError(sessionError, "Your admin session could not be checked."));
          setCheckingAccess(false);
        }
        return;
      }

      const user = sessionData.session?.user;
      if (!user || user.is_anonymous) {
        if (!cancelled) {
          setError("Please sign in with the authorized admin account.");
          setCheckingAccess(false);
        }
        return;
      }

      const { data: isAdmin, error: adminError } = await supabase.rpc("chat_is_admin");
      if (cancelled) return;
      if (adminError || !isAdmin) {
        setError("This account is not authorized to view customer conversations.");
        setCheckingAccess(false);
        return;
      }

      adminPresenceUserIdRef.current = user.id;
      setAuthorized(true);
      setCheckingAccess(false);
    };

    verifyAdminAccess();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authorized) return undefined;

    let cancelled = false;
    const sessionId = adminPresenceSessionIdRef.current;
    const userId = adminPresenceUserIdRef.current;

    const clearPresence = async () => {
      if (!userId) return;
      const { error: presenceError } = await supabase
        .from("admin_presence")
        .delete()
        .eq("admin_user_id", userId)
        .eq("session_id", sessionId);
      if (presenceError && !cancelled) {
        console.warn("Admin presence could not be cleared:", presenceError);
      }
    };

    const heartbeat = async () => {
      if (cancelled || document.visibilityState !== "visible" || !userId) return;
      const { error: presenceError } = await supabase
        .from("admin_presence")
        .upsert(
          {
            admin_user_id: userId,
            session_id: sessionId,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "admin_user_id,session_id" }
        );
      if (presenceError && !cancelled) {
        console.warn("Admin presence heartbeat failed:", presenceError);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void heartbeat();
      } else {
        void clearPresence();
      }
    };

    void heartbeat();
    const heartbeatTimer = window.setInterval(heartbeat, 30 * 1000);
    const { data: authState } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") void clearPresence();
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", heartbeat);
    window.addEventListener("pagehide", clearPresence);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatTimer);
      authState.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", heartbeat);
      window.removeEventListener("pagehide", clearPresence);
      void clearPresence();
    };
  }, [authorized]);

  useEffect(() => {
    if (!authorized) return undefined;

    const channel = supabase
      .channel("admin-customer-chat")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          void loadConversations();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (payload) => {
          void loadConversations();
          const currentConversationId = activeConversationIdRef.current;

          if (payload.eventType === "INSERT" && payload.new?.sender_type === "customer") {
            const conversationId = payload.new.conversation_id;
            const activelyViewed = isConversationActivelyViewed({
              chatOpen: Boolean(currentConversationId),
              conversationId,
              activeConversationId: currentConversationId,
            });
            if (!activelyViewed) {
              const knownConversation = conversationsRef.current.find((item) => item.id === conversationId);
              const notifyAdmin = (customerName) => showChatNotification({
                message: payload.new,
                title: `New message from ${customerName || "customer"}`,
                conversationId,
                onClick: focusConversationFromNotification,
              });
              if (knownConversation?.customer_name) {
                notifyAdmin(knownConversation.customer_name);
              } else {
                void supabase
                  .from("conversations")
                  .select("customer_name")
                  .eq("id", conversationId)
                  .maybeSingle()
                  .then(({ data }) => notifyAdmin(data?.customer_name));
              }
            }
          }

          if (payload.new?.conversation_id !== currentConversationId) return;

          if (payload.eventType === "INSERT") {
            setMessages((current) => mergeChatMessage(current, payload.new));
            if (payload.new.sender_type === "customer" && !payload.new.is_read) {
              queueMessagesRead([payload.new.id], currentConversationId);
            }
          } else if (payload.eventType === "UPDATE") {
            setMessages((current) => mergeChatMessage(current, payload.new));
          }
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setError("Realtime updates are unavailable. Try refreshing the admin page.");
        }
      });

    return () => {
      if (readTimerRef.current) {
        window.clearTimeout(readTimerRef.current);
        readTimerRef.current = null;
      }
      pendingReadIdsRef.current = new Set();
      pendingReadConversationRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [authorized, focusConversationFromNotification, loadConversations, markMessagesRead, queueMessagesRead]);

  const selectConversation = useCallback(async (conversation) => {
    activeConversationIdRef.current = conversation.id;
    setActiveConversation(conversation);
    setMessages([]);
    setDraft("");
    setSelectedAttachment(null);
    await loadMessages(conversation.id);
  }, [loadMessages]);

  useEffect(() => {
    if (!authorized || !requestedCustomerUserId) return undefined;
    let cancelled = false;

    const openRequestedConversation = async () => {
      let conversation = conversationsRef.current.find((item) => item.customer_user_id === requestedCustomerUserId);

      if (!conversation) {
        const { data, error: conversationError } = await supabase
          .from("conversations")
          .select("id, customer_user_id, customer_name, customer_phone, product_id, product_name, product_price, created_at, updated_at, admin_hidden, admin_removed_from_inbox")
          .eq("customer_user_id", requestedCustomerUserId)
          .maybeSingle();

        if (cancelled) return;
        if (conversationError) {
          setError(getChatError(conversationError, "The customer conversation could not be opened."));
          onRequestedCustomerHandled();
          return;
        }
        conversation = data ? { ...data, unreadCount: 0 } : null;
      }

      if (cancelled) return;
      if (!conversation) {
        setError("This customer has not started a chat conversation yet.");
        onRequestedCustomerHandled();
        return;
      }

      await selectConversation(conversation);
      if (!cancelled) onRequestedCustomerHandled();
    };

    void openRequestedConversation();
    return () => { cancelled = true; };
  }, [authorized, requestedCustomerUserId, onRequestedCustomerHandled, selectConversation]);

  const sendReply = async () => {
    const message = draft.trim();
    if ((!message && !selectedAttachment) || !activeConversation?.id || sending) return;

    setSending(true);
    setError("");
    try {
      const attachmentMetadata = selectedAttachment
        ? await uploadChatAttachment({
            file: selectedAttachment,
            customerUserId: activeConversation.customer_user_id,
            conversationId: activeConversation.id,
          })
        : {};
      const { data, error: sendError } = await supabase
        .from("messages")
        .insert({
          conversation_id: activeConversation.id,
          sender_type: "admin",
          message: message || null,
          is_read: false,
          ...attachmentMetadata,
        })
        .select("*")
        .single();

      if (sendError) throw sendError;
      setDraft("");
      setSelectedAttachment(null);
      if (data) setMessages((current) => mergeChatMessage(current, data));
    } catch (sendError) {
      setError(getChatError(sendError, "Your reply could not be sent."));
    }
    setSending(false);
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

  const archiveConversation = async (conversation) => {
    const willHide = !conversation.admin_hidden;
    const confirmed = window.confirm(
      willHide
        ? "Archive this chat from the active admin inbox? The customer, conversation row, and all messages will remain available."
        : "Restore this conversation to the active admin inbox?"
    );
    if (!confirmed) return;

    setError("");
    const { data, error: archiveError } = await supabase
      .from("conversations")
      .update({ admin_hidden: willHide })
      .eq("id", conversation.id)
      .select("id, admin_hidden")
      .single();

    if (archiveError) {
      setError(getChatError(archiveError, "The chat could not be updated."));
      return;
    }

    setConversations((current) => current.filter((item) => item.id !== data.id || data.admin_hidden === showArchivedRef.current));
    setArchivedCount((current) => Math.max(0, current + (willHide ? 1 : -1)));
    if (willHide && activeConversationIdRef.current === data.id) {
      setActiveConversation(null);
      setMessages([]);
      setDraft("");
    } else if (!willHide && activeConversationIdRef.current === data.id) {
      setActiveConversation((current) => (current ? { ...current, ...data } : data));
    }
  };

  const removeFromInbox = async (conversation) => {
    const confirmed = window.confirm(
      "Remove this customer from the admin inbox? Their account, conversation, messages, and history will remain available. They will return automatically when they send a new message."
    );
    if (!confirmed) return;

    setError("");
    const { data, error: removeError } = await supabase
      .from("conversations")
      .update({ admin_removed_from_inbox: true })
      .eq("id", conversation.id)
      .select("id, admin_removed_from_inbox")
      .single();

    if (removeError) {
      setError(getChatError(removeError, "The customer could not be removed from the inbox."));
      return;
    }

    conversationMutationVersionRef.current += 1;
    setConversations((current) => current.filter((item) => item.id !== data.id));
    if (conversation.admin_hidden) {
      setArchivedCount((current) => Math.max(0, current - 1));
    }
    if (activeConversationIdRef.current === data.id) {
      setActiveConversation(null);
      setMessages([]);
      setDraft("");
      setSelectedAttachment(null);
    }
  };

  if (checkingAccess) {
    return (
      <div className="chat-admin-status-page">
        <span className="chat-spinner" aria-hidden="true" />
        <p>Checking admin access...</p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="chat-admin-status-page chat-admin-status-page-error">
        <p>{error || "Admin access is unavailable."}</p>
      </div>
    );
  }

  const activeUnreadIds = messages
    .filter((message) => message.sender_type === "customer" && !message.is_read)
    .map((message) => message.id);
  const activeProduct = activeConversation?.product_name
    ? `${activeConversation.product_name}${activeConversation.product_price !== null && activeConversation.product_price !== undefined ? ` · Rs. ${Number(activeConversation.product_price).toLocaleString("en-IN")}` : ""}`
    : "General enquiry";
  const clearSearch = () => {
    setSearchInput("");
    searchTermRef.current = "";
    void loadConversations("", showArchivedRef.current);
  };

  const toggleArchivedView = () => {
    const nextArchived = !showArchived;
    setShowArchived(nextArchived);
    showArchivedRef.current = nextArchived;
    setActiveConversation(null);
    setMessages([]);
    void loadConversations(searchTermRef.current, nextArchived);
  };

  return (
    <section className={`chat-admin-page${activeConversation ? " chat-admin-page-has-active" : ""}`}>
      <div className="chat-admin-heading">
        <div>
          <span className="chat-eyebrow">Private inbox</span>
          <h2>Customer chat</h2>
          <p>Reply to enquiries about physical 3D printed products.</p>
          <NotificationPermissionButton className="chat-admin-notification-control" />
        </div>
        <div className="chat-admin-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search name, phone or customer ID"
            aria-label="Search customers"
          />
          {searchInput && (
            <button type="button" onClick={clearSearch} aria-label="Clear customer search">
              ×
            </button>
          )}
        </div>
        <div className="chat-admin-summary">
          <strong>{conversations.length}</strong>
          <span>conversations</span>
        </div>
      </div>

      <div className="chat-admin-layout">
        <ConversationList
          conversations={conversations}
          activeId={activeConversation?.id}
          onSelect={selectConversation}
          loading={loadingConversations}
          showArchived={showArchived}
          archivedCount={archivedCount}
          emptyText={searchInput.trim() ? "No customers found" : "Customer conversations will appear here."}
          onToggleArchived={toggleArchivedView}
        />

        <div className="chat-admin-window">
          {activeConversation ? (
            <ChatWindow
              title={activeConversation.customer_name}
              subtitle={`${activeConversation.customer_phone} · ${activeProduct}`}
              messages={messages}
              draft={draft}
              onDraftChange={setDraft}
              onSend={sendReply}
              attachment={selectedAttachment}
              onAttachmentSelected={handleAttachmentSelected}
              onRemoveAttachment={() => setSelectedAttachment(null)}
              sending={sending}
              disabled={loadingMessages}
              currentSender="admin"
              error={error}
              onBack={() => {
                setActiveConversation(null);
                setMessages([]);
                setSelectedAttachment(null);
              }}
              headerAction={(
                <div className="chat-window-header-actions">
                  {activeUnreadIds.length > 0 && (
                    <button type="button" className="chat-mark-read-button" onClick={() => markMessagesRead(activeUnreadIds)}>
                      Mark read
                    </button>
                  )}
                  <button type="button" className="chat-archive-button" onClick={() => archiveConversation(activeConversation)}>
                    {activeConversation.admin_hidden ? "Restore chat" : "Archive chat"}
                  </button>
                  <button type="button" className="chat-remove-inbox-button" onClick={() => removeFromInbox(activeConversation)}>
                    Remove from Inbox
                  </button>
                </div>
              )}
            />
          ) : (
            <div className="chat-admin-empty-window">
              <div className="chat-admin-empty-icon">✦</div>
              <h3>Select a conversation</h3>
              <p>Choose a customer enquiry to view the full chat and reply.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
