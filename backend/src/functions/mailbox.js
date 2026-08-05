import { app } from "@azure/functions";
import { getPrincipal, unauthorized } from "../identity.js";
import { listInboundMessages, markInboundMessageRead, saveInboundMessage } from "../database.js";

const addressFor = (alias) => {
  const domain = process.env.MAILBOX_DOMAIN;
  if (domain) return `${alias}@${domain}`;
  const inbound = process.env.POSTMARK_INBOUND_ADDRESS || "";
  const [local, host] = inbound.split("@");
  return local && host ? `${local}+${alias}@${host}` : null;
};

app.http("mailbox", {
  methods: ["GET"], authLevel: "anonymous", route: "mailbox",
  handler: async (request, context) => {
    const principal = getPrincipal(request); if (!principal) return unauthorized();
    try {
      const limit = Math.min(Math.max(Number(request.query.get("limit")) || 25, 1), 50);
      const offset = Math.max(Number(request.query.get("offset")) || 0, 0);
      const result = await listInboundMessages(principal, limit, offset);
      return { jsonBody: { address: addressFor(result.mailbox.Alias), messages: result.messages, total: result.total }, headers: { "Cache-Control": "no-store" } };
    } catch (error) { context.error("Mailbox request failed", error); return { status: 500, jsonBody: { error: "Mailbox request failed." } }; }
  },
});

app.http("mailboxMessage", {
  methods: ["PATCH"], authLevel: "anonymous", route: "mailbox/{id}",
  handler: async (request, context) => {
    const principal = getPrincipal(request); if (!principal) return unauthorized();
    try {
      const message = await markInboundMessageRead(principal, request.params.id);
      return message ? { jsonBody: { message } } : { status: 404, jsonBody: { error: "Message not found." } };
    } catch (error) { context.error("Mailbox update failed", error); return { status: 500, jsonBody: { error: "Mailbox update failed." } }; }
  },
});

app.http("postmarkInbound", {
  methods: ["POST"], authLevel: "function", route: "webhooks/postmark/inbound",
  handler: async (request, context) => {
    try {
      const length = Number(request.headers.get("content-length") || 0);
      if (length > 10 * 1024 * 1024) return { status: 413 };
      const payload = await request.json();
      if (!payload?.MessageID || !(payload.From || payload.FromFull?.Email)) return { status: 400 };
      const message = await saveInboundMessage(payload);
      if (!message) context.warn("Inbound message did not match a mailbox alias", payload.MessageID);
      return { status: 200 };
    } catch (error) { context.error("Postmark inbound processing failed", error); return { status: 500 } ; }
  },
});
