#!/usr/bin/env node
// Builds the CORS policy that lets the deployed client upload to the document bucket. Browser uploads to Cloud
// Storage are cross-origin requests, and they fail without a policy like this one. The script only prints the
// policy and the command. It does not change any bucket. Run the command yourself, against the approved bucket.
//
// Usage: node scripts/release/storage-cors.mjs --origin https://app.example.org [--origin ...] > storage-cors.json

export const corsMethods = ["GET", "HEAD", "PUT", "POST", "DELETE"];
export const corsResponseHeaders = ["Content-Type", "Authorization", "x-goog-resumable"];
export const corsMaxAgeSeconds = 3600;

export class CorsRefusal extends Error {}

export function buildStorageCorsConfig(origins) {
  if (!Array.isArray(origins) || origins.length < 1 || origins.length > 5) {
    throw new CorsRefusal("Give one to five client origins.");
  }
  const cleaned = origins.map((value) => {
    if (typeof value !== "string" || value.includes("*")) throw new CorsRefusal("Wildcard origins are not allowed.");
    let url;
    try { url = new URL(value); } catch { throw new CorsRefusal(`Not a valid origin: ${value.slice(0, 80)}`); }
    if (url.protocol !== "https:") throw new CorsRefusal("Production origins must use https.");
    if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
      throw new CorsRefusal("Each origin must have no path, query, or credentials.");
    }
    return url.origin;
  });
  return [{
    origin: [...new Set(cleaned)],
    method: [...corsMethods],
    responseHeader: [...corsResponseHeaders],
    maxAgeSeconds: corsMaxAgeSeconds,
  }];
}

async function main() {
  const origins = [];
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--origin") origins.push(args[index + 1]);
  }
  try {
    const config = buildStorageCorsConfig(origins);
    process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
    process.stderr.write("Apply with: gcloud storage buckets update gs://YOUR_DOCUMENT_BUCKET --cors-file=storage-cors.json\n");
  } catch (error) {
    process.stderr.write(`storage-cors refused: ${error.message}\n`);
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
