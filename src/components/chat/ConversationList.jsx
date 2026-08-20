import { formatChatPrice, formatChatTime } from "./chatUtils";

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
  loading = false,
  showArchived = false,
  archivedCount = 0,
  onToggleArchived,
  emptyText = "Customer conversations will appear here.",
}) {
  return (
    <aside className={`chat-conversation-list${activeId ? " chat-conversation-list-has-active" : ""}`}>
      <div className="chat-list-heading">
        <div>
          <h3>Customer enquiries</h3>
          <p>{conversations.length} conversation{conversations.length === 1 ? "" : "s"}</p>
        </div>
        <div className="chat-list-heading-actions">
          {conversations.some((conversation) => conversation.unreadCount > 0) && (
            <span className="chat-unread-total" aria-label="Unread conversations">
              {conversations.reduce((total, conversation) => total + conversation.unreadCount, 0)}
            </span>
          )}
          {onToggleArchived && (
            <button type="button" className="chat-archive-toggle" onClick={onToggleArchived}>
              {showArchived ? "Active chats" : `Archived${archivedCount ? ` (${archivedCount})` : ""}`}
            </button>
          )}
        </div>
      </div>

      <div className="chat-conversation-items">
        {loading && <div className="chat-list-placeholder">Loading conversations...</div>}
        {!loading && conversations.length === 0 && (
          <div className="chat-list-placeholder">{emptyText}</div>
        )}
        {!loading && conversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                className={`chat-conversation-item${activeId === conversation.id ? " chat-conversation-item-active" : ""}`}
                onClick={() => onSelect(conversation)}
              >
                <div className="chat-conversation-item-topline">
                  <strong>{conversation.customer_name}</strong>
                  <time>{formatChatTime(conversation.updated_at || conversation.created_at)}</time>
                </div>
                <div className="chat-conversation-phone">{conversation.customer_phone}</div>
                <div className="chat-conversation-user-id">{conversation.customer_user_id}</div>
                {conversation.product_name && (
                  <div className="chat-conversation-product">
                    {conversation.product_name}
                    {conversation.product_price !== null && conversation.product_price !== undefined
                      ? ` · ${formatChatPrice(conversation.product_price)}`
                      : ""}
                  </div>
                )}
                <div className="chat-conversation-preview">
                  <span>{conversation.latestMessage?.message || "No messages yet"}</span>
                  {conversation.unreadCount > 0 && (
                    <span className="chat-unread-badge" aria-label={`${conversation.unreadCount} unread message${conversation.unreadCount === 1 ? "" : "s"}`}>
                      {conversation.unreadCount}
                    </span>
                  )}
                </div>
              </button>
        ))}
      </div>
    </aside>
  );
}
