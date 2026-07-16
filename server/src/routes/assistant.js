import { Router } from "express";
import { cleanText } from "../validation.js";

export function assistantRouter(store, assistant) {
  const router = Router();
  router.post("/", async (request, response) => {
    const question = cleanText(request.body.question, 2000);
    if (question.length < 4) {
      return response.status(422).json({
        error: { code: "invalid_question", message: "Enter a complete question." },
      });
    }
    const profile = await store.profiles.get(request.user.uid);
    response.json({ data: await assistant.answer({ question, profile }) });
  });
  return router;
}
