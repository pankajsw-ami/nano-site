import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const QUEUE_TABLE = "admin_message_notification_queue";
const PRESENCE_WINDOW_MS = 90 * 1000;

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function messagePreview(message: Record<string, unknown>) {
  const text = String(message.message || "").trim().replace(/\s+/g, " ");
  if (text) return text.length > 240 ? `${text.slice(0, 237)}...` : text;
  if (message.attachment_name) return `Attachment: ${message.attachment_name}`;
  return "New customer message";
}

function adminInboxUrl() {
  return Deno.env.get("ADMIN_CONVERSATION_URL") || "";
}

async function markFailed(supabase: ReturnType<typeof createClient>, queueId: string, error: unknown) {
  await supabase
    .from(QUEUE_TABLE)
    .update({
      status: "failed",
      processing_started_at: null,
      last_error: String(error instanceof Error ? error.message : error).slice(0, 1000),
    })
    .eq("id", queueId)
    .eq("status", "processing");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const webhookSecret = Deno.env.get("NOTIFICATION_WEBHOOK_SECRET");
  if (!webhookSecret || request.headers.get("x-notification-webhook-secret") !== webhookSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL") || "nanoaakriti@gmail.com";

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !fromEmail) {
    return json({ error: "Notification service is not configured" }, 500);
  }

  let payload: Record<string, any>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  const queueRecord = payload.record || payload.new_record || payload;
  const queueId = queueRecord?.id;
  if (!queueId) return json({ error: "Missing notification queue id" }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: claimedQueue, error: claimError } = await supabase
    .rpc("chat_claim_admin_message_notification", { p_queue_id: queueId })
    .maybeSingle();

  if (claimError) {
    console.error("Could not claim notification queue row", claimError);
    return json({ error: "Could not claim notification" }, 500);
  }

  if (!claimedQueue) {
    return json({ ok: true, skipped: "Already claimed, sent, or exhausted" });
  }

  try {
    const activeSince = new Date(Date.now() - PRESENCE_WINDOW_MS).toISOString();
    const { count: activeAdminCount, error: presenceError } = await supabase
      .from("admin_presence")
      .select("id", { count: "exact", head: true })
      .gt("last_seen_at", activeSince);

    if (presenceError) throw presenceError;

    if ((activeAdminCount || 0) > 0) {
      await supabase.from(QUEUE_TABLE).delete().eq("id", claimedQueue.id);
      return json({ ok: true, skipped: "Admin became active" });
    }

    const [{ data: conversation, error: conversationError }, { data: message, error: messageError }] = await Promise.all([
      supabase
        .from("conversations")
        .select("id, customer_name, customer_phone, product_name, product_price")
        .eq("id", claimedQueue.conversation_id)
        .maybeSingle(),
      supabase
        .from("messages")
        .select("id, message, attachment_name, sender_type, is_read, created_at")
        .eq("id", claimedQueue.message_id)
        .maybeSingle(),
    ]);

    if (conversationError) throw conversationError;
    if (messageError) throw messageError;

    if (!conversation || !message || message.sender_type !== "customer" || message.is_read) {
      await supabase
        .from(QUEUE_TABLE)
        .update({ status: "sent", sent_at: new Date().toISOString(), processing_started_at: null })
        .eq("id", claimedQueue.id)
        .eq("status", "processing");
      return json({ ok: true, skipped: "Message is no longer unread" });
    }

    const preview = messagePreview(message);
    const customerName = String(conversation.customer_name || "Customer");
    const productName = String(conversation.product_name || "General enquiry");
    const timestamp = new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(message.created_at));
    const inboxUrl = adminInboxUrl();
    const openLink = inboxUrl
      ? `<p><a href="${escapeHtml(inboxUrl)}">Open the Nano Aakriti admin inbox</a></p>`
      : "";
    const subject = `[Nano Aakriti] New customer message from ${customerName}`;
    const text = [
      "A new customer message is waiting in the Nano Aakriti admin inbox.",
      "",
      `Customer: ${customerName}`,
      `Phone: ${conversation.customer_phone || "Not provided"}`,
      `Product: ${productName}`,
      `Conversation: ${conversation.id}`,
      `Time: ${timestamp}`,
      `Message: ${preview}`,
      inboxUrl ? `Open inbox: ${inboxUrl}` : "",
    ].filter(Boolean).join("\n");
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0D0D0D">
        <h2 style="margin:0 0 16px">New customer message</h2>
        <p>A customer message is waiting in the Nano Aakriti admin inbox.</p>
        <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
          <tr><td><strong>Customer</strong></td><td>${escapeHtml(customerName)}</td></tr>
          <tr><td><strong>Phone</strong></td><td>${escapeHtml(conversation.customer_phone || "Not provided")}</td></tr>
          <tr><td><strong>Product</strong></td><td>${escapeHtml(productName)}</td></tr>
          <tr><td><strong>Conversation</strong></td><td>${escapeHtml(conversation.id)}</td></tr>
          <tr><td><strong>Time</strong></td><td>${escapeHtml(timestamp)}</td></tr>
        </table>
        <p style="margin:18px 0 6px"><strong>Message preview</strong></p>
        <p style="padding:12px 14px;background:#F8F7F4;border-left:3px solid #E85D04">${escapeHtml(preview)}</p>
        ${openLink}
      </div>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `nano-aakriti-admin-chat-${claimedQueue.id}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [adminEmail],
        subject,
        text,
        html,
      }),
    });

    if (!emailResponse.ok) {
      throw new Error(`Email provider returned ${emailResponse.status}: ${(await emailResponse.text()).slice(0, 500)}`);
    }

    await supabase
      .from(QUEUE_TABLE)
      .update({ status: "sent", sent_at: new Date().toISOString(), processing_started_at: null })
      .eq("id", claimedQueue.id)
      .eq("status", "processing");

    return json({ ok: true, sent: true, conversationId: claimedQueue.conversation_id });
  } catch (error) {
    await markFailed(supabase, claimedQueue.id, error);
    console.error("Customer message email notification failed", error);
    return json({ error: "Email notification failed" }, 500);
  }
});
