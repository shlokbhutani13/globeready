import { describe, expect, test } from "vitest";
import { resolveLink, resolveLinks, tasksLinkedTo, linkTypeLabels } from "../lib/links";

describe("links between tasks and other items", () => {
  const context = { news: [{ id: "n1", title: "Rule change" }], cases: [{ id: "c1", title: "OPT application" }], dates: [{ id: "d1", label: "Passport expires" }] };
  test("resolves each kind to a page and a readable label", () => {
    expect(resolveLink({ type: "news", id: "n1" }, context)).toMatchObject({ label: "Rule change", to: "/news/n1", found: true });
    expect(resolveLink({ type: "rule", id: "form-i-765" }, context)).toMatchObject({ to: "/rules", found: true });
    expect(resolveLink({ type: "case", id: "c1" }, context)).toMatchObject({ label: "OPT application", to: "/cases", found: true });
    expect(resolveLink({ type: "date", id: "d1" }, context)).toMatchObject({ label: "Passport expires", to: "/dates", found: true });
    expect(resolveLink({ type: "guide", id: "visa" }, context)).toMatchObject({ to: "/guides", found: true });
  });
  test("keeps a link whose target is gone, marked as not found, with a generic label", () => {
    expect(resolveLink({ type: "case", id: "deleted" }, context)).toMatchObject({ label: "Case", found: false });
    expect(resolveLink({ type: "news", id: "old story" }, context).to).toBe("/news/old%20story");
  });
  test("ignores malformed links", () => {
    expect(resolveLink(null)).toBeNull();
    expect(resolveLink({ type: "web", id: "x" })).toBeNull();
    expect(resolveLinks("nope")).toEqual([]);
    expect(resolveLinks([{ type: "web", id: "x" }, { type: "news", id: "n1" }], context)).toHaveLength(1);
  });
  test("finds the tasks that point at an item", () => {
    const tasks = [{ id: "a", links: [{ type: "case", id: "c1" }] }, { id: "b" }, { id: "c", links: [{ type: "news", id: "c1" }] }];
    expect(tasksLinkedTo(tasks, "case", "c1").map((task) => task.id)).toEqual(["a"]);
  });
  test("has a label for every link type", () => {
    expect(Object.keys(linkTypeLabels).sort()).toEqual(["case", "date", "guide", "news", "rule"]);
  });
});
