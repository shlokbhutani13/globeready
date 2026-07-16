import { Router } from "express";
import { cleanText } from "../validation.js";

export function resourcesRouter(store) {
  const router = Router();
  router.get("/", async (request, response) => {
    response.json({ data: await store.resources.list(request.user.uid) });
  });
  router.post("/", async (request, response) => {
    const title = cleanText(request.body.title);
    const url = cleanText(request.body.url, 500);
    if (!title || !/^https:\/\//.test(url)) {
      return response.status(422).json({ error: { code: "invalid_resource" } });
    }
    response.status(201).json({
      data: await store.resources.create(request.user.uid, {
        title,
        url,
        category: cleanText(request.body.category) || "general",
        source: cleanText(request.body.source),
      }),
    });
  });
  router.delete("/:id", async (request, response) => {
    const removed = await store.resources.remove(request.user.uid, request.params.id);
    return removed ? response.status(204).end() : response.status(404).json({ error: { code: "resource_not_found" } });
  });
  return router;
}
