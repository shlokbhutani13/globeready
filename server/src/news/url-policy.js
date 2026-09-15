import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { domainToASCII } from "node:url";

const blockedIpv4Addresses = new BlockList();
const blockedIpv6Addresses = new BlockList();
const allocatedIpv6Addresses = new BlockList();

for (const [network, prefix] of [
  ["2001::", 23],
  ["2001:200::", 23],
  ["2001:400::", 23],
  ["2001:600::", 23],
  ["2001:800::", 22],
  ["2001:c00::", 23],
  ["2001:e00::", 23],
  ["2001:1200::", 23],
  ["2001:1400::", 22],
  ["2001:1800::", 23],
  ["2001:1a00::", 23],
  ["2001:1c00::", 22],
  ["2001:2000::", 19],
  ["2001:4000::", 23],
  ["2001:4200::", 23],
  ["2001:4400::", 23],
  ["2001:4600::", 23],
  ["2001:4800::", 23],
  ["2001:4a00::", 23],
  ["2001:4c00::", 23],
  ["2001:5000::", 20],
  ["2001:8000::", 19],
  ["2001:a000::", 20],
  ["2001:b000::", 20],
  ["2002::", 16],
  ["2003::", 18],
  ["2400::", 12],
  ["2410::", 12],
  ["2600::", 12],
  ["2610::", 23],
  ["2620::", 23],
  ["2630::", 12],
  ["2800::", 12],
  ["2a00::", 12],
  ["2a10::", 12],
  ["2c00::", 12],
]) {
  allocatedIpv6Addresses.addSubnet(network, prefix, "ipv6");
}

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
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
]) {
  blockedIpv6Addresses.addSubnet(network, prefix, "ipv6");
}

const asciiControlPattern = /[\u0000-\u001f\u007f]/u;
const dnsLabelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const numericIpv4PartPattern = /^(?:0x[0-9a-f]+|[0-9]+)$/iu;

function canonicalizeIpv6(hostname) {
  return new URL(`https://[${hostname}]`).hostname.slice(1, -1).toLowerCase();
}

function resemblesLegacyIpv4(hostname) {
  const withoutRootDot = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  const parts = withoutRootDot.split(".");
  return parts.length <= 4 && parts.every((part) => numericIpv4PartPattern.test(part));
}

function normalizeStrictHostname(value, invalid) {
  if (typeof value !== "string" || !value) invalid();
  if (asciiControlPattern.test(value) || /[%\\/@?#\s]/u.test(value)) invalid();

  const hasOpeningBracket = value.includes("[");
  const hasClosingBracket = value.includes("]");
  if (hasOpeningBracket || hasClosingBracket) {
    if (!value.startsWith("[") || !value.endsWith("]")) invalid();
    const literal = value.slice(1, -1);
    if (isIP(literal) !== 6) invalid();
    return canonicalizeIpv6(literal);
  }

  const literalFamily = isIP(value);
  if (literalFamily === 4) return value;
  if (literalFamily === 6) return canonicalizeIpv6(value);
  if (value.includes(":") || resemblesLegacyIpv4(value)) invalid();

  const ascii = domainToASCII(value).toLowerCase();
  const hostname = ascii.endsWith(".") ? ascii.slice(0, -1) : ascii;
  const labels = hostname.split(".");
  if (isIP(hostname) || !hostname || hostname.length > 253
    || labels.some((label) => !dnsLabelPattern.test(label))) {
    invalid();
  }
  return hostname;
}

function normalizeConfiguredHostname(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Source host allowlist entries must be non-empty hostnames.");
  }
  return normalizeStrictHostname(value, () => {
    throw new Error("Source host allowlist entry is invalid.");
  });
}

export function canonicalSourceHostname(value) {
  return normalizeConfiguredHostname(value);
}

function parseStrictSourceUrl(value) {
  if (typeof value !== "string" || !value || asciiControlPattern.test(value)) {
    throw new Error("Source URL cannot contain ASCII control characters.");
  }

  const absoluteMatch = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)(?=[/?#]|$)/iu.exec(value);
  if (!absoluteMatch) {
    throw new Error("Source URL must be a valid absolute URL.");
  }
  if (absoluteMatch[1].toLowerCase() !== "https") {
    throw new Error("Source URL must use HTTPS.");
  }

  const authority = absoluteMatch[2];
  if (!authority) {
    throw new Error("Source URL must contain a hostname.");
  }
  if (authority.includes("@")) {
    throw new Error("Source URL cannot contain credentials.");
  }

  let rawHostname;
  let rawPort;
  if (authority.startsWith("[")) {
    const closingBracket = authority.indexOf("]");
    if (closingBracket === -1) {
      throw new Error("Source URL hostname is invalid.");
    }
    rawHostname = authority.slice(0, closingBracket + 1);
    const remainder = authority.slice(closingBracket + 1);
    if (remainder) {
      const portMatch = /^:([0-9]+)$/u.exec(remainder);
      if (!portMatch) throw new Error("Source URL hostname is invalid.");
      rawPort = portMatch[1];
    }
  } else {
    if (authority.includes("[") || authority.includes("]")) {
      throw new Error("Source URL hostname is invalid.");
    }
    const firstColon = authority.indexOf(":");
    const lastColon = authority.lastIndexOf(":");
    if (firstColon !== lastColon) {
      throw new Error("Source URL hostname is invalid.");
    }
    if (lastColon === -1) {
      rawHostname = authority;
    } else {
      rawHostname = authority.slice(0, lastColon);
      rawPort = authority.slice(lastColon + 1);
      if (!/^[0-9]+$/u.test(rawPort)) {
        throw new Error("Source URL hostname is invalid.");
      }
    }
  }

  const hostname = normalizeStrictHostname(rawHostname, () => {
    throw new Error("Source URL hostname is invalid.");
  });
  if (rawPort !== undefined && rawPort !== "443") {
    throw new Error("Source URL cannot use a non-standard port.");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Source URL must be a valid absolute URL.");
  }
  const parsedHostname = normalizeStrictHostname(url.hostname, () => {
    throw new Error("Source URL hostname is invalid.");
  });
  if (parsedHostname !== hostname) {
    throw new Error("Source URL hostname is invalid.");
  }
  return { hostname, url };
}

function assertPublicAddress(address, family) {
  const detectedFamily = isIP(address);
  if (!detectedFamily || (family && Number(family) !== detectedFamily)) {
    throw new Error(`Source hostname resolved to an invalid IP address: ${address}`);
  }

  const blocked = detectedFamily === 4
    ? blockedIpv4Addresses.check(address, "ipv4")
    : !allocatedIpv6Addresses.check(address, "ipv6")
      || blockedIpv6Addresses.check(address, "ipv6");
  if (blocked) {
    throw new Error(`Source hostname must resolve only to public IP addresses: ${address}`);
  }
}

export async function resolveAllowedSourceUrl(value, source, { resolveHost = lookup } = {}) {
  const { hostname, url } = parseStrictSourceUrl(value);
  if (url.username || url.password) {
    throw new Error("Source URL cannot contain credentials.");
  }
  if (url.port && url.port !== "443") {
    throw new Error("Source URL cannot use a non-standard port.");
  }

  const allowedHosts = Array.isArray(source?.allowedHosts)
    ? source.allowedHosts.map(normalizeConfiguredHostname)
    : [];
  if (!allowedHosts.includes(hostname)) {
    throw new Error(`Source hostname is not allowlisted: ${hostname}`);
  }

  const literalFamily = isIP(hostname);
  if (literalFamily) {
    assertPublicAddress(hostname, literalFamily);
    return { url, addresses: [{ address: hostname, family: literalFamily }] };
  }

  const addresses = await resolveHost(hostname, { all: true });
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error(`Source hostname did not resolve to an IP address: ${hostname}`);
  }
  for (const result of addresses) {
    assertPublicAddress(result?.address, result?.family);
  }

  return {
    url,
    addresses: addresses.map(({ address, family }) => ({ address, family: Number(family) })),
  };
}

export async function assertAllowedSourceUrl(value, source, options) {
  const { url } = await resolveAllowedSourceUrl(value, source, options);
  return url;
}
