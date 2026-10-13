#!/usr/bin/env node

const help = `GlobeReady news operations runner

Usage: npm run news:operations -- [options]

  --operation-id=<id>  Stable idempotency key
  --dry-run             Preview only (dry run by default)
  --write               Permit mutations only when NEWS_OPERATIONS_WRITES_ENABLED=true
  --source=<id>         Official source to process; repeatable
  --limit=<1..20>       Bound sources and cleanup work (default: 20)
  --cleanup             Include expired-snapshot cleanup
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
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice(8)) : 20;
if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
  process.stderr.write("--limit must be an integer from 1 to 20.\n");
  process.exit(1);
}

// Credential-free mode deliberately performs no network or persistence work. The service runner is
// wired by an approved host when real adapters are available.
process.stdout.write(`${JSON.stringify({ dryRun: !write, mode: "credential-free", sourceIds: sourceIds.slice(0, limit), limit })}\n`);
