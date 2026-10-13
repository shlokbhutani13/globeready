import { createHash } from "node:crypto";
import { normalizeDeliveryResult } from "../email/delivery.js";
import { renderDigestEmail } from "../email/render-digest.js";
import { buildDigest } from "./digest.js";

function period(value, label) {
  const date = new Date(value);
  if (typeof value !== "string" || Number.isNaN(date.valueOf())) throw new Error(`${label} is invalid.`);
  return date.toISOString();
}

function digestId(uid, frequency, start, end) {
  return createHash("sha256").update(`${uid}\0${frequency}\0${start}\0${end}`).digest("hex");
}

export function createDigestService({ store, delivery, clock = () => new Date() } = {}) {
  if (!store?.newsDigests?.list || !store.newsDigests.upsert || !delivery?.deliver) {
    throw new Error("Digest service requires stores and a delivery boundary.");
  }
  return {
    async generateForUser(uid, { periodStart, periodEnd } = {}) {
      const preferences = await store.newsPreferences.get(uid) || {};
      const frequency = preferences.digestFrequency || "weekly";
      if (frequency === "off") return { status: "off" };
      const start = period(periodStart, "Digest period start");
      const end = period(periodEnd, "Digest period end");
      if (start >= end) throw new Error("Digest period must end after it starts.");
      const id = digestId(uid, frequency, start, end);
      const existing = (await store.newsDigests.list(uid)).find((entry) => entry.id === id);
      if (existing) return existing;
      const [items, saved] = await Promise.all([store.news.listPublished({}), store.savedNews.list(uid)]);
      const digest = buildDigest(items, clock(), {
        digestFrequency: frequency,
        universityIds: preferences.universityIds || [],
        savedItemIds: saved.map(({ newsItemId }) => newsItemId),
      });
      const message = renderDigestEmail({ ...digest, unsubscribeUrl: "Open GlobeReady settings" });
      const deliveryResult = preferences.emailRemindersEnabled === true
        ? normalizeDeliveryResult(await delivery.deliver(message))
        : { status: "disabled", retryable: false, providerMessageId: null };
      const record = {
        ...digest, periodStart: start, periodEnd: end, delivery: deliveryResult,
      };
      return (await store.newsDigests.upsert(uid, id, record)).item;
    },
  };
}
