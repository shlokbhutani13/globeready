import { describe, expect, test } from "vitest";
import { capNewsBySource } from "../lib/news-balance";

const story = (sourceId, index, overrides = {}) => ({ id: `${sourceId}-${index}`, sourceId, autoIngested: true, ...overrides });

describe("main news source balance", () => {
  test("caps automatic stories per source while preserving ranked order", () => {
    const items = [...Array.from({ length: 10 }, (_, index) => story("mit-iso", index)), ...Array.from({ length: 4 }, (_, index) => story("ice-sevp", index))];
    const visible = capNewsBySource(items, 6);
    expect(visible).toHaveLength(10);
    expect(visible.filter(({ sourceId }) => sourceId === "mit-iso")).toHaveLength(6);
    expect(visible.map(({ id }) => id)).toEqual([...items.slice(0, 6), ...items.slice(10)].map(({ id }) => id));
  });

  test("never caps hand-reviewed records", () => {
    const reviewed = Array.from({ length: 8 }, (_, index) => story("mit-iso", index, { autoIngested: false, editorialState: "approved" }));
    expect(capNewsBySource(reviewed, 2)).toEqual(reviewed);
  });
});
