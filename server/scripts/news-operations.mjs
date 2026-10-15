#!/usr/bin/env node

import { readFileSync } from "node:fs";

const help = `GlobeReady news operations runner

Usage: npm run news:operations -- [options]

  --operation-id=<id>  Stable idempotency key
  --dry-run             Preview only (dry run by default)
  --write               Permit mutations only when NEWS_OPERATIONS_WRITES_ENABLED=true
  --source=<id>         Official source to process; repeatable
  --limit=<1..20>       Bound sources and cleanup work (default: 20)
  --cleanup             Include expired-snapshot cleanup
  --candidate-file=<p>  Candidate JSON file for an explicit human decision
  --decision=approve|reject|defer|correct|archive
                        Review action; requires an approved host integration
  --help                Show this help
`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(help);
  process.exit(0);
}

const write = args.includes("--write");
if (write && process.env.NEWS_OPERATIONS_WRITES_ENABLED !== "true") {
  process.stderr.write("News operation writes are disabled.\n");
  process.exit(1);
}

const sourceIds = args.filter((arg) => arg.startsWith("--source=")).map((arg) => arg.slice(9));
const candidateFileArg = args.find((arg) => arg.startsWith("--candidate-file="));
const decisionArg = args.find((arg) => arg.startsWith("--decision="));
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice(8)) : 20;
if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
  process.stderr.write("--limit must be an integer from 1 to 20.\n");
  process.exit(1);
}

let reviewDecision;
if (candidateFileArg || decisionArg) {
  if (!candidateFileArg || !decisionArg) {
    process.stderr.write("--candidate-file and --decision must be used together.\n");
    process.exit(1);
  }
  const type = decisionArg.slice(11);
  if (!["approve", "reject", "defer", "correct", "archive"].includes(type)) {
    process.stderr.write("Review decision is invalid.\n");
    process.exit(1);
  }
  let candidate;
  try { candidate = JSON.parse(readFileSync(candidateFileArg.slice(17), "utf8")); } catch {
    process.stderr.write("Candidate file could not be read.\n");
    process.exit(1);
  }
  if (!/^review-candidate:[a-f0-9]{64}$/u.test(candidate?.id || "")) {
    process.stderr.write("Candidate file does not contain a valid candidate ID.\n");
    process.exit(1);
  }
  reviewDecision = { candidateId: candidate.id, type };
}

// Credential-free mode deliberately performs no network or persistence work. The service runner is
// wired by an approved host when real adapters are available.
process.stdout.write(`${JSON.stringify({ dryRun: !write, mode: "credential-free", sourceIds: sourceIds.slice(0, limit), limit, ...(reviewDecision ? { reviewDecision } : {}) })}\n`);
