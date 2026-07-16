import { describe, expect, test } from "vitest";

import { createDemoStore } from "../src/store.js";

describe("demo store", () => {
  test("keeps tasks separated by uid", async () => {
    const store = createDemoStore();
    await store.tasks.create("user-a", { title: "Upload I-20" });

    expect(await store.tasks.list("user-b")).toEqual([]);
    expect(await store.tasks.list("user-a")).toHaveLength(1);
  });

  test("persists profile updates per uid", async () => {
    const store = createDemoStore();
    await store.profiles.set("student", { university: "UNC Chapel Hill" });

    expect(await store.profiles.get("student")).toMatchObject({
      university: "UNC Chapel Hill",
    });
  });
});
