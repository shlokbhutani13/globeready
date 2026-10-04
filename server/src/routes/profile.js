import { createHash } from "node:crypto";
import { Router } from "express";
import { canonicalOfficialHostname } from "../news/official-url.js";
import { cleanText, validDate } from "../validation.js";

const universityIdPattern = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/u;

function validTimeZone(value) {
  if (value === undefined || value === "") return "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch { return null; }
}

function officialUniversityDomain(value) {
  if (value === undefined || value === "") return "";
  try {
    const hostname = canonicalOfficialHostname(value);
    return hostname.endsWith(".edu") ? hostname : null;
  } catch { return null; }
}

export function profileRouter(store) {
  const router = Router();
  router.get("/", async (request, response) => {
    response.json({ data: await store.profiles.get(request.user.uid) });
  });
  router.put("/", async (request, response) => {
    const universityId = cleanText(request.body.universityId, 128);
    const domain = officialUniversityDomain(request.body.officialUniversityDomain);
    const timeZone = validTimeZone(request.body.timeZone);
    if ((universityId && !universityIdPattern.test(universityId))
      || domain === null || (domain && !universityId) || timeZone === null) {
      return response.status(422).json({
        error: { code: "invalid_profile", message: "Use a valid university ID, official .edu domain, and time zone." },
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
      timeZone,
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
