import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_BUCKET,
  downloadChatAttachment,
  formatAttachmentSize,
  isImageAttachment,
} from "./attachmentUtils";
import { formatChatTime } from "./chatUtils";

export default function ChatWindow({
  title,
  subtitle,
  messages,
  draft,
  onDraftChange,
  onSend,
  sending = false,
  disabled = false,
  currentSender = "customer",
  emptyText = "No messages yet. Send the first message.",
  error = "",
  onBack,
  headerAction = null,
  compact = false,
  attachment = null,
  onAttachmentSelected,
  onRemoveAttachment,
}) {
  const endRef = useRef(null);
  const fileInputRef = useRef(null);
  const signedUrlCacheRef = useRef(new Map());
  const [attachmentUrls, setAttachmentUrls] = useState({});
  const [attachmentErrors, setAttachmentErrors] = useState({});
  const [downloadErrors, setDownloadErrors] = useState({});
  const [downloadingPath, setDownloadingPath] = useState("");
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState("");
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);

  useEffect(() => {
    const paths = [...new Set(messages
      .filter((message) => message.attachment_path && isImageAttachment({
        name: message.attachment_name,
        type: message.attachment_type,
      }))
      .map((message) => message.attachment_path))];
    const missingPaths = paths.filter((path) => !signedUrlCacheRef.current.has(path));
    if (!missingPaths.length) return undefined;

    let cancelled = false;
    const resolveAttachmentUrls = async () => {
      const results = await Promise.all(missingPaths.map(async (path) => {
        const { data, error } = await supabase.storage
          .from(CHAT_ATTACHMENT_BUCKET)
          .createSignedUrl(path, 60 * 60);
        return { path, url: data?.signedUrl || "", error };
      }));

      if (cancelled) return;
      const nextUrls = {};
      const nextErrors = {};
      results.forEach(({ path, url, error }) => {
        signedUrlCacheRef.current.set(path, { url, error: error?.message || "" });
        if (url) nextUrls[path] = url;
        if (error) nextErrors[path] = "Attachment unavailable";
      });
      setAttachmentUrls((current) => ({ ...current, ...nextUrls }));
      setAttachmentErrors((current) => ({ ...current, ...nextErrors }));
    };

    void resolveAttachmentUrls();
    return () => {
      cancelled = true;
    };
  }, [messages]);

  useEffect(() => {
    if (!attachment || !isImageAttachment(attachment)) {
      setAttachmentPreviewUrl("");
      return undefined;
    }

    const previewUrl = URL.createObjectURL(attachment);
    setAttachmentPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [attachment]);

  useEffect(() => {
    if (!attachment && fileInputRef.current) fileInputRef.current.value = "";
  }, [attachment]);

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  const handleDownload = async (message) => {
    const path = message.attachment_path;
    if (!path || downloadingPath === path) return;

    setDownloadingPath(path);
    setDownloadErrors((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });

    try {
      await downloadChatAttachment({
        attachmentPath: path,
        attachmentName: message.attachment_name,
      });
    } catch {
      setDownloadErrors((current) => ({
        ...current,
        [path]: "File unavailable. Try again.",
      }));
    } finally {
      setDownloadingPath("");
    }
  };

  const renderMessageAttachment = (message) => {
    if (!message.attachment_path) return null;

    const attachmentName = message.attachment_name || "Chat attachment";
    const image = isImageAttachment({
      name: attachmentName,
      type: message.attachment_type,
    });
    const signedUrl = attachmentUrls[message.attachment_path];
    const attachmentError = attachmentErrors[message.attachment_path];

    return (
      <div className={`chat-message-attachment${image ? " chat-message-attachment-image" : ""}`}>
        {image && signedUrl ? (
          <button
            type="button"
            className="chat-attachment-image-button"
            onClick={() => setLightbox({ url: signedUrl, name: attachmentName })}
            aria-label={`Preview ${attachmentName}`}
          >
            <img src={signedUrl} alt={attachmentName} loading="lazy" />
          </button>
        ) : (
          <div className="chat-attachment-file-icon" aria-hidden="true">FILE</div>
        )}
        <div className="chat-message-attachment-details">
          <strong title={attachmentName}>{attachmentName}</strong>
          <span>{message.attachment_type || "Attachment"} · {formatAttachmentSize(message.attachment_size)}</span>
          {image && signedUrl && (
            <a href={signedUrl} target="_blank" rel="noreferrer">
              Open image
            </a>
          )}
          {image && !signedUrl && (
            <span className="chat-attachment-loading">{attachmentError || "Preparing attachment..."}</span>
          )}
          <button
            type="button"
            className="chat-download-button"
            onClick={() => handleDownload(message)}
            disabled={downloadingPath === message.attachment_path}
            title="Download attachment"
            aria-label={`Download ${attachmentName}`}
          >
            {downloadingPath === message.attachment_path ? "Downloading..." : "Download"}
          </button>
          {downloadErrors[message.attachment_path] && (
            <span className="chat-attachment-download-error" role="alert">
              {downloadErrors[message.attachment_path]}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <section className={`chat-window${compact ? " chat-window-compact" : ""}`}>
      <header className="chat-window-header">
        {onBack && (
          <button type="button" className="chat-back-button" onClick={onBack} aria-label="Back to conversations">
            ←
          </button>
        )}
        <div className="chat-window-heading">
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {headerAction}
      </header>

      <div className="chat-messages" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 ? (
          <div className="chat-empty-state">{emptyText}</div>
        ) : (
          messages.map((message) => {
            const mine = message.sender_type === currentSender;
            return (
              <div key={message.id} className={`chat-message-row${mine ? " chat-message-row-mine" : ""}`}>
                <div className={`chat-message-bubble${mine ? " chat-message-bubble-mine" : ""}`}>
                  {message.message && <p>{message.message}</p>}
                  {renderMessageAttachment(message)}
                  <span>
                    {formatChatTime(message.created_at)}
                    {mine && (
                      <span
                        className={`chat-message-status ${message.is_read ? "chat-message-status-read" : "chat-message-status-unread"}`}
                        title={message.is_read ? "Read" : "Sent — unread"}
                        aria-label={message.is_read ? "Read" : "Sent — unread"}
                      >
                        <i aria-hidden="true" />
                      </span>
                    )}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <input
          ref={fileInputRef}
          className="chat-attachment-input"
          type="file"
          accept={CHAT_ATTACHMENT_ACCEPT}
          onChange={(event) => {
            const selectedFile = event.target.files?.[0];
            if (selectedFile) onAttachmentSelected?.(selectedFile);
          }}
          disabled={disabled || sending}
          aria-label="Attach an image or file"
        />
        <button
          type="button"
          className="chat-attach-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || sending}
          aria-label="Attach an image or file"
          title="Attach image or file"
        >
          Attach
        </button>
        <textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a message..."
          rows={2}
          disabled={disabled || sending}
          aria-label="Message"
        />
        <button type="submit" disabled={disabled || sending || (!draft.trim() && !attachment)}>
          {sending ? "Sending..." : "Send"}
        </button>
      </form>
      {attachment && (
        <div className="chat-selected-attachment">
          {isImageAttachment(attachment) && attachmentPreviewUrl ? (
            <img src={attachmentPreviewUrl} alt="Selected attachment preview" />
          ) : (
            <div className="chat-attachment-file-icon" aria-hidden="true">FILE</div>
          )}
          <div>
            <strong title={attachment.name}>{attachment.name}</strong>
            <span>{attachment.type || "File"} · {formatAttachmentSize(attachment.size)}</span>
          </div>
          <button type="button" onClick={() => onRemoveAttachment?.()} aria-label="Remove selected attachment">
            ×
          </button>
        </div>
      )}
      {error && <p className="chat-inline-error">{error}</p>}
      </section>
      {lightbox && (
        <div className="chat-attachment-lightbox" role="dialog" aria-modal="true" aria-label={lightbox.name} onClick={() => setLightbox(null)}>
          <button type="button" onClick={() => setLightbox(null)} aria-label="Close image preview">×</button>
          <img src={lightbox.url} alt={lightbox.name} onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </>
  );
}
