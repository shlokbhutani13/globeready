import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const API_ROOT = "https://firebaserules.googleapis.com/v1";

async function readJson(response, operation) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || response.statusText || "unknown error";
    throw new Error(`${operation} failed (${response.status}): ${message}`);
  }
  return body;
}

export async function deployFirestoreRules({ projectId, accessToken, rulesContent, fetchImpl = fetch }) {
  if (!projectId || !accessToken || !rulesContent) {
    throw new Error("projectId, accessToken, and rulesContent are required");
  }

  const headers = {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
  const encodedProject = encodeURIComponent(projectId);
  const ruleset = await readJson(await fetchImpl(`${API_ROOT}/projects/${encodedProject}/rulesets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      source: {
        files: [{ name: "firestore.zero-cost.rules", content: rulesContent }],
      },
    }),
  }), "create ruleset");

  if (!ruleset.name) throw new Error("create ruleset returned no ruleset name");

  const releaseName = `projects/${projectId}/releases/cloud.firestore`;
  const release = await readJson(await fetchImpl(`${API_ROOT}/projects/${encodedProject}/releases/cloud.firestore`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      release: { name: releaseName, rulesetName: ruleset.name },
    }),
  }), "update Firestore release");

  if (release.rulesetName !== ruleset.name) {
    throw new Error("updated release did not reference the created ruleset");
  }
  return { releaseName: release.name, rulesetName: release.rulesetName };
}

async function main() {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const accessToken = process.env.FIREBASE_RULES_ACCESS_TOKEN;
  const rulesContent = await readFile("firestore.zero-cost.rules", "utf8");
  const result = await deployFirestoreRules({ projectId, accessToken, rulesContent });
  console.log(`Published ${result.rulesetName} to ${result.releaseName}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
