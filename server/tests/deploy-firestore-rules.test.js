import { describe, expect, test, vi } from "vitest";

import { deployFirestoreRules } from "../scripts/deploy-firestore-rules.mjs";

describe("deployFirestoreRules", () => {
  test("creates an immutable ruleset and points the default Firestore release at it", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "projects/globe-ready/rulesets/rules-123" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        name: "projects/globe-ready/releases/cloud.firestore",
        rulesetName: "projects/globe-ready/rulesets/rules-123",
      }), { status: 200 }));

    const result = await deployFirestoreRules({
      projectId: "globe-ready",
      accessToken: "test-token",
      rulesContent: "rules_version = '2';\nservice cloud.firestore {}\n",
      fetchImpl,
    });

    expect(result).toEqual({
      releaseName: "projects/globe-ready/releases/cloud.firestore",
      rulesetName: "projects/globe-ready/rulesets/rules-123",
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(1,
      "https://firebaserules.googleapis.com/v1/projects/globe-ready/rulesets",
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          source: {
            files: [{
              name: "firestore.zero-cost.rules",
              content: "rules_version = '2';\nservice cloud.firestore {}\n",
            }],
          },
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(2,
      "https://firebaserules.googleapis.com/v1/projects/globe-ready/releases/cloud.firestore",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          release: {
            name: "projects/globe-ready/releases/cloud.firestore",
            rulesetName: "projects/globe-ready/rulesets/rules-123",
          },
        }),
      }),
    );
  });

  test("does not update the live release when ruleset creation fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "invalid rules" } }), { status: 400 }));

    await expect(deployFirestoreRules({
      projectId: "globe-ready",
      accessToken: "test-token",
      rulesContent: "invalid",
      fetchImpl,
    })).rejects.toThrow("create ruleset failed (400): invalid rules");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
