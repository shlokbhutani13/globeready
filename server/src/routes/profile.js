import { Router } from "express";
import { cleanText, validDate } from "../validation.js";

export function profileRouter(store) {
  const router = Router();
  router.get("/", async (request, response) => {
    response.json({ data: await store.profiles.get(request.user.uid) });
  });
  router.put("/", async (request, response) => {
    const input = {
      fullName: cleanText(request.body.fullName),
      homeCountry: cleanText(request.body.homeCountry),
      university: cleanText(request.body.university),
      degreeLevel: cleanText(request.body.degreeLevel),
      program: cleanText(request.body.program),
      visaType: cleanText(request.body.visaType),
      journeyStage: cleanText(request.body.journeyStage),
      startDate: request.body.startDate || "",
      graduationDate: request.body.graduationDate || "",
    };
    if (!validDate(input.startDate) || !validDate(input.graduationDate)) {
      return response.status(422).json({
        error: { code: "invalid_profile", message: "Use YYYY-MM-DD for dates." },
      });
    }
    response.json({ data: await store.profiles.set(request.user.uid, input) });
  });
  return router;
}
