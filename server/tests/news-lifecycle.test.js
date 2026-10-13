import { describe, expect, test } from "vitest";

import {
  approvedLifecyclePatch,
  proposeLifecycleRelation,
  updateLifecycleStates,
} from "../src/news/lifecycle.js";
import { publicNewsItem } from "../src/news/schema.js";

const original = { id: "item-1", sourceId: "official", externalId: "notice-1", lifecycleState: "current" };
const correction = {
  id: "item-2", sourceId: "official", externalId: "notice-2", relatedExternalId: "notice-1",
  documentType: "correction",
};

describe("update lifecycle", () => {
  test("proposes rather than applies a source-backed lifecycle relation", () => {
    expect([...updateLifecycleStates]).toEqual(["current", "corrected", "superseded", "withdrawn"]);
    expect(proposeLifecycleRelation(correction, [original])).toEqual({
      type: "lifecycle-relation",
      status: "pending",
      sourceId: "official",
      itemId: "item-1",
      replacementItemId: "item-2",
      proposedState: "corrected",
    });
    expect(original.lifecycleState).toBe("current");
  });

  test("refuses self, circular, and cross-source lifecycle patches", () => {
    expect(() => approvedLifecyclePatch(original, { state: "superseded", replacementItem: original }, [original]))
      .toThrow(/itself/i);
    expect(() => approvedLifecyclePatch(original, {
      state: "superseded", replacementItem: { ...correction, sourceId: "other" },
    }, [original, correction])).toThrow(/source/i);
    expect(() => approvedLifecyclePatch(original, {
      state: "superseded",
      replacementItem: { ...correction, supersededByIds: [original.id] },
    }, [original, correction])).toThrow(/cycle/i);
  });

  test("public projection exposes approved state and replacement ID but not proposal internals", () => {
    const projected = publicNewsItem({
      ...original,
      editorialState: "published-source-only",
      lifecycleState: "superseded",
      replacementItemId: "item-2",
      lifecycleReviewId: "private-review",
      lifecycleEvidence: { private: true },
    });
    expect(projected).toMatchObject({ lifecycleState: "superseded", replacementItemId: "item-2" });
    expect(projected).not.toHaveProperty("lifecycleReviewId");
    expect(projected).not.toHaveProperty("lifecycleEvidence");
  });
});
