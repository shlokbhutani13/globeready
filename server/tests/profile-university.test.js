import request from "supertest";
import { beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { createDemoStore } from "../src/store.js";

const base = {
  fullName: "Maya Singh",
  university: "UNC Chapel Hill",
  universityId: "unc-chapel-hill",
  officialUniversityDomain: "unc.edu",
  timeZone: "America/New_York",
};

describe("profile university and preferences", () => {
  let store;
  let app;

  beforeEach(() => {
    store = createDemoStore();
    app = createApp({ store, auth: null, assistant: null });
  });

  const put = (body, user = "student-a") => request(app).put("/api/profile").set("x-demo-user", user).send(body);

  test("persists the profile including the student's time zone", async () => {
    await put(base).expect(200);

    const saved = (await request(app).get("/api/profile").set("x-demo-user", "student-a")).body.data;
    expect(saved.universityId).toBe("unc-chapel-hill");
    expect(saved.timeZone).toBe("America/New_York");
  });

  test("rejects a domain that is not an official .edu or .gov name", async () => {
    await put({ ...base, officialUniversityDomain: "unc.example.com" }).expect(422);
    await put({ ...base, officialUniversityDomain: "https://unc.edu/path" }).expect(422);
  });

  test("rejects a university domain submitted without a university ID", async () => {
    await put({ ...base, universityId: "" }).expect(422);
  });

  test("rejects an unknown or malformed time zone", async () => {
    await put({ ...base, timeZone: "Mars/Olympus" }).expect(422);
  });

  test("registers a student-submitted university source as pending and never verified or enabled", async () => {
    await put(base).expect(200);

    const sources = await store.newsSources.listGlobal();
    const submitted = sources.find((source) => source.universityId === "unc-chapel-hill");
    expect(submitted).toMatchObject({ verified: false, enabled: false, verificationState: "verification-pending" });

    const coverage = await request(app)
      .get("/api/news/university-coverage?universityId=unc-chapel-hill")
      .set("x-demo-user", "student-a");
    expect(coverage.body.data.state).toBe("verification-pending");
  });

  test("does not replace an existing source when another student submits the same university and domain", async () => {
    await put(base).expect(200);
    const before = (await store.newsSources.listGlobal()).find((source) => source.universityId === "unc-chapel-hill");

    await put(base, "student-b").expect(200);

    const after = (await store.newsSources.listGlobal()).filter((source) => source.universityId === "unc-chapel-hill");
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id);
  });

  test("stores email reminder settings as a closed, validated preference", async () => {
    await request(app).put("/api/news/preferences").set("x-demo-user", "student-a")
      .send({ emailRemindersEnabled: true, digestFrequency: "daily" })
      .expect(200);
    await request(app).put("/api/news/preferences").set("x-demo-user", "student-a")
      .send({ emailRemindersEnabled: "yes" })
      .expect(422);

    const prefs = (await request(app).get("/api/news/preferences").set("x-demo-user", "student-a")).body.data;
    expect(prefs.emailRemindersEnabled).toBe(true);
    expect(prefs.digestFrequency).toBe("daily");
  });
});
