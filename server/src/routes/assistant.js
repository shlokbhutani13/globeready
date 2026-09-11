import { Router } from "express";
import { cleanText } from "../validation.js";

export function assistantRouter(store, assistant, aiLimiter = (_request, _response, next) => next()) {
  const router = Router();
  router.post("/", aiLimiter, async (request, response) => {
    const question = cleanText(request.body.question, 2000);
    if (question.length < 4) {
      return response.status(422).json({
        error: { code: "invalid_question", message: "Enter a complete question." },
      });
    }
    const profile = await store.profiles.get(request.user.uid);
    const documentId = cleanText(request.body.documentId, 200) || undefined;
    response.json({
      data: await assistant.answer({
        uid: request.user.uid,
        question,
        profile,
        documentId,
      }),
    });
  });
  return router;
}
