import { createHash } from "node:crypto";
import { Router } from "express";
import { cleanText, validDate } from "../validation.js";

const universityIdPattern = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/u;

function officialUniversityDomain(value) {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || value !== value.trim() || value !== value.toLowerCase()
    || value.length > 253 || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(value)
    || !value.endsWith(".edu")) return null;
  try {
    const url = new URL(`https://${value}/`);
    return url.hostname === value ? value : null;
  } catch {
    return null;
  }
}

export function profileRouter(store) {
  const router = Router();
  router.get("/", async (request, response) => {
    response.json({ data: await store.profiles.get(request.user.uid) });
  });
  router.put("/", async (request, response) => {
    const universityId = cleanText(request.body.universityId, 128);
    const domain = officialUniversityDomain(request.body.officialUniversityDomain);
    if ((universityId && !universityIdPattern.test(universityId)) || domain === null || (domain && !universityId)) {
      return response.status(422).json({
        error: { code: "invalid_profile", message: "Use a valid university ID and official .edu domain." },
      });
    }
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
      universityId,
      officialUniversityDomain: domain,
    };
    if (!validDate(input.startDate) || !validDate(input.graduationDate)) {
      return response.status(422).json({
        error: { code: "invalid_profile", message: "Use YYYY-MM-DD for dates." },
      });
    }
    if (domain) {
      const connectorId = `university-${createHash("sha256")
        .update(`${universityId.toLowerCase()}\0${domain}`)
        .digest("hex")
        .slice(0, 32)}`;
      const existing = await store.newsSources.get(connectorId);
      if (!existing) {
        await store.newsSources.upsert(connectorId, {
          publisher: cleanText(request.body.university, 300) || domain,
          adapter: "university-sitemap",
          url: `https://${domain}/sitemap.xml`,
          allowedHosts: [domain],
          acceptedContentTypes: ["application/xml", "text/xml"],
          sourceType: "university",
          universityId,
          verificationState: "verification-pending",
          verified: false,
          enabled: false,
        });
      }
    }
    response.json({ data: await store.profiles.set(request.user.uid, input) });
  });
  return router;
}
