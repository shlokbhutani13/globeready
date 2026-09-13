import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const blockedIpv4Addresses = new BlockList();
const blockedIpv6Addresses = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  blockedIpv4Addresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 8],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
]) {
  blockedIpv6Addresses.addSubnet(network, prefix, "ipv6");
}

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function assertPublicAddress(address, family) {
  const detectedFamily = isIP(address);
  if (!detectedFamily || (family && Number(family) !== detectedFamily)) {
    throw new Error(`Source hostname resolved to an invalid IP address: ${address}`);
  }

  const blocked = detectedFamily === 4
    ? blockedIpv4Addresses.check(address, "ipv4")
    : blockedIpv6Addresses.check(address, "ipv6");
  if (blocked) {
    throw new Error(`Source hostname must resolve only to public IP addresses: ${address}`);
  }
}

export async function assertAllowedSourceUrl(value, source, { resolveHost = lookup } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Source URL must be a valid absolute URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Source URL must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Source URL cannot contain credentials.");
  }
  if (url.port && url.port !== "443") {
    throw new Error("Source URL cannot use a non-standard port.");
  }

  const hostname = normalizeHostname(url.hostname);
  const allowedHosts = Array.isArray(source?.allowedHosts)
    ? source.allowedHosts.map((host) => normalizeHostname(String(host)))
    : [];
  if (!allowedHosts.includes(hostname)) {
    throw new Error(`Source hostname is not allowlisted: ${hostname}`);
  }

  const literalFamily = isIP(hostname);
  if (literalFamily) {
    assertPublicAddress(hostname, literalFamily);
    return url;
  }

  const addresses = await resolveHost(hostname, { all: true });
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error(`Source hostname did not resolve to an IP address: ${hostname}`);
  }
  for (const result of addresses) {
    assertPublicAddress(result?.address, result?.family);
  }

  return url;
}
