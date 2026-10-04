// robots.txt policy for sources that require one (university sites). Standard reading of RFC 9309, with a
// fail-closed rule: if robots.txt cannot be read for a reason other than "does not exist", the source is refused.
// The fetch goes through the same SSRF-safe fetcher as every other source.
const agentToken = "globereadysourcemonitor"; // compared with lowercased group names
const cacheMilliseconds = 60 * 60_000;
const failureCacheMilliseconds = 15 * 60_000;
const maxRules = 2_000;

function patternFor(rulePath) {
  const anchored = rulePath.endsWith("$");
  const body = anchored ? rulePath.slice(0, -1) : rulePath;
  const source = body.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, "\\$&")).join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`, "u");
}

export function parseRobots(text) {
  const groups = [];
  let current = null;
  let sawRule = false;
  for (const raw of String(text || "").split(/\r?\n/u)) {
    const line = raw.replace(/#.*/u, "").trim();
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (!current || sawRule) {
        current = { agents: [], rules: [] };
        groups.push(current);
        sawRule = false;
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current) {
      sawRule = true;
      // An empty Disallow value means "allow everything" and adds no restriction.
      if (value && groups.reduce((count, group) => count + group.rules.length, 0) < maxRules) {
        current.rules.push({ allow: field === "allow", path: value, pattern: patternFor(value) });
      }
    }
  }
  return groups;
}

function selectedGroup(groups) {
  const specific = groups.find((group) => group.agents.some((agent) => agent !== "*" && agentToken.includes(agent)));
  if (specific) return specific;
  return groups.find((group) => group.agents.includes("*")) || null;
}

export function isPathAllowed(groups, path) {
  const group = selectedGroup(groups);
  if (!group) return true;
  let best = null;
  for (const rule of group.rules) {
    if (!rule.pattern.test(path)) continue;
    // Longest match wins; on a tie, allow wins.
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

export function createRobotsPolicy({ fetchSource, clock = () => Date.now() } = {}) {
  if (typeof fetchSource !== "function") throw new Error("Robots policy requires a source fetch function.");
  const cache = new Map();

  async function loadGroups(origin, hostname) {
    try {
      const response = await fetchSource({
        url: `${origin}/robots.txt`,
        allowedHosts: [hostname],
        acceptedContentTypes: ["text/plain"],
        adapter: "robots",
      });
      return { groups: parseRobots(response.text), expiresAt: clock() + cacheMilliseconds };
    } catch (error) {
      // "No robots.txt" means no restrictions. Anything else (server error, timeout, unexpected type) refuses the source.
      if (/HTTP status (404|410)\b/u.test(String(error?.message || ""))) {
        return { groups: [], expiresAt: clock() + cacheMilliseconds };
      }
      return { groups: null, expiresAt: clock() + failureCacheMilliseconds };
    }
  }

  return {
    async isAllowed(source) {
      const url = new URL(source.url);
      const key = url.origin;
      let entry = cache.get(key);
      if (!entry || entry.expiresAt <= clock()) {
        entry = await loadGroups(url.origin, url.hostname);
        cache.set(key, entry);
      }
      if (entry.groups === null) return false;
      return isPathAllowed(entry.groups, `${url.pathname}${url.search}`);
    },
  };
}
