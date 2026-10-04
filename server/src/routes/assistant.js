import { Router } from "express";
import { consentFrom, consentRequiredMessage } from "../consent.js";
import { referralFor } from "../referrals.js";
import { cleanText } from "../validation.js";

const conversationIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

function publicMessage(message) {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    documentCitations: message.documentCitations || [],
    sources: message.sources || [],
    evidence: message.evidence || null,
    referral: message.referral || null,
    createdAt: message.createdAt,
  };
}

export function assistantRouter(store, assistant, aiLimiter = (_request, _response, next) => next()) {
  const router = Router();

  const ownedConversation = async (uid, conversationId) => {
    if (!conversationIdPattern.test(conversationId)) return null;
    const conversations = await store.conversations.list(uid);
    return conversations.find((conversation) => conversation.id === conversationId) || null;
  };

  router.get("/conversations", async (request, response) => {
    const conversations = await store.conversations.list(request.user.uid);
    response.json({
      data: conversations.map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt })),
    });
  });

  router.get("/conversations/:id/messages", async (request, response) => {
    const conversation = await ownedConversation(request.user.uid, request.params.id);
    if (!conversation) return response.status(404).json({ error: { code: "conversation_not_found" } });
    const messages = await store.conversationMessages.list(request.user.uid, conversation.id);
    response.json({ data: messages.map(publicMessage) });
  });

  router.post("/", aiLimiter, async (request, response) => {
    const question = cleanText(request.body.question, 2000);
    if (question.length < 4) {
      return response.status(422).json({
        error: { code: "invalid_question", message: "Enter a complete question." },
      });
    }
    const uid = request.user.uid;
    const requestedConversationId = request.body.conversationId
      ? cleanText(request.body.conversationId, 128)
      : null;
    let conversation = null;
    if (requestedConversationId) {
      conversation = await ownedConversation(uid, requestedConversationId);
      if (!conversation) return response.status(404).json({ error: { code: "conversation_not_found" } });
    }

    const profile = await store.profiles.get(uid);
    const documentId = cleanText(request.body.documentId, 200) || undefined;
    const consent = consentFrom(profile);
    if (documentId && !consent.documents) {
      return response.status(403).json({ error: { code: "consent_required", message: consentRequiredMessage } });
    }
    const answer = await assistant.answer({
      uid,
      question,
      profile,
      documentId,
      allowDocuments: consent.documents,
      allowGeneration: consent.aiGeneration,
    });
    const referral = referralFor(question);

    if (!conversation) {
      conversation = await store.conversations.create(uid, { title: question.slice(0, 80) });
    }
    await store.conversationMessages.create(uid, conversation.id, { role: "user", text: question });
    await store.conversationMessages.create(uid, conversation.id, {
      role: "assistant",
      text: answer.answer || answer.notice || "",
      documentCitations: answer.documentCitations || [],
      sources: answer.sources || [],
      evidence: answer.evidence || null,
      referral,
    });

    response.json({
      data: { ...answer, referral, conversationId: conversation.id },
    });
  });
  return router;
}
