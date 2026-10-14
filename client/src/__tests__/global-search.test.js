import { describe, expect, test } from "vitest";
import { searchEverything } from "../lib/global-search";

const data = {
  news: [{ id: "fr-1", title: "Fixed admission periods", publisher: "DHS", shortSummary: "Replaces duration of status" }],
  guides: [{ id: "banking", title: "Set up U.S. banking", summary: "Open an account", category: "Money", source: "CFPB" }],
  tasks: [{ id: "t1", title: "Pay SEVIS fee", category: "Immigration", dueDate: "2026-11-01" }],
  documents: [{ id: "doc-00", name: "I-20 Maya.pdf", chunks: [{ page: 1, text: "SEVIS ID N0012345678 secret" }] }],
};

describe("global search", () => {
  test("finds updates, guides, tasks and document names by title", () => {
    const result = searchEverything("sevis", data);
    expect(result.groups.map((group) => group.id)).toEqual(["tasks"]);
    expect(searchEverything("bank", data).groups[0].results[0]).toMatchObject({ title: "Set up U.S. banking", to: "/guides" });
    expect(searchEverything("duration status", data).groups[0].results[0].to).toBe("/news/fr-1");
    expect(searchEverything("maya", data).groups[0]).toMatchObject({ id: "documents", total: 1 });
  });

  test("never searches inside documents", () => {
    expect(searchEverything("N0012345678", data).total).toBe(0);
    expect(searchEverything("secret", data).total).toBe(0);
  });

  test("ignores empty queries and caps each group", () => {
    expect(searchEverything("  ", data).total).toBe(0);
    const many = { tasks: Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, title: `Pay fee ${i}` })) };
    const grouped = searchEverything("fee", many, { perGroup: 5 });
    expect(grouped.groups[0].results).toHaveLength(5);
    expect(grouped.groups[0].total).toBe(20);
  });
});
