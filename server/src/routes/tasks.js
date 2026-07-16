import { Router } from "express";
import { cleanText, validDate } from "../validation.js";

export function tasksRouter(store) {
  const router = Router();
  router.get("/", async (request, response) => {
    response.json({ data: await store.tasks.list(request.user.uid) });
  });
  router.post("/", async (request, response) => {
    const title = cleanText(request.body.title);
    if (!title || !validDate(request.body.dueDate)) {
      return response.status(422).json({
        error: { code: "invalid_task", message: "A title and valid due date are required." },
      });
    }
    const task = await store.tasks.create(request.user.uid, {
      title,
      category: cleanText(request.body.category) || "general",
      priority: ["low", "medium", "high"].includes(request.body.priority)
        ? request.body.priority
        : "medium",
      dueDate: request.body.dueDate || "",
      notes: cleanText(request.body.notes, 1000),
      completed: false,
      source: "user",
    });
    response.status(201).json({ data: task });
  });
  router.patch("/:id", async (request, response) => {
    const task = await store.tasks.update(request.user.uid, request.params.id, {
      ...(typeof request.body.completed === "boolean"
        ? { completed: request.body.completed }
        : {}),
      ...(request.body.title ? { title: cleanText(request.body.title) } : {}),
    });
    if (!task) return response.status(404).json({ error: { code: "task_not_found" } });
    response.json({ data: task });
  });
  router.delete("/:id", async (request, response) => {
    const removed = await store.tasks.remove(request.user.uid, request.params.id);
    return removed
      ? response.status(204).end()
      : response.status(404).json({ error: { code: "task_not_found" } });
  });
  return router;
}
