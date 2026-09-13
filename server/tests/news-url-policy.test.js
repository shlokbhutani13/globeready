import { describe, expect, test, vi } from "vitest";

const lookup = vi.hoisted(() => vi.fn(async () => [{ address: "23.1.1.1", family: 4 }]));

vi.mock("node:dns/promises", () => ({ lookup }));

import { assertAllowedSourceUrl } from "../src/news/url-policy.js";

describe("official source URL policy", () => {
  test.each([
    "http://www.uscis.gov/newsroom/all-news",
    "https://127.0.0.1/admin",
    "https://169.254.169.254/latest/meta-data",
    "https://user:pass@www.uscis.gov/news",
    "https://www.uscis.gov:8443/news",
    "https://news.uscis.gov/news",
  ])("rejects unsafe source URL %s", async (url) => {
    await expect(assertAllowedSourceUrl(url, { allowedHosts: ["www.uscis.gov"] })).rejects.toThrow();
  });

  test("accepts an exact verified host", async () => {
    await expect(assertAllowedSourceUrl("https://www.uscis.gov/newsroom/all-news", {
      allowedHosts: ["www.uscis.gov"],
    })).resolves.toBeInstanceOf(URL);
  });

  test.each([
    "0.1.2.3",
    "10.0.0.1",
    "100.64.0.1",
    "127.255.255.254",
    "169.254.1.1",
    "172.16.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
  ])("rejects non-public IPv4 destination %s", async (address) => {
    await expect(assertAllowedSourceUrl(
      "https://official.example/news",
      { allowedHosts: ["official.example"] },
      { resolveHost: async () => [{ address, family: 4 }] },
    )).rejects.toThrow(/public/i);
  });

  test.each([
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "100::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "2420::1",
    "2640::1",
    "2a20::1",
    "2d00::1",
    "3000::1",
    "3800::1",
    "4000::1",
    "fc00::1",
    "fdff:ffff::1",
    "fe80::1",
    "ff02::1",
  ])("rejects non-public IPv6 destination %s", async (address) => {
    await expect(assertAllowedSourceUrl(
      "https://official.example/news",
      { allowedHosts: ["official.example"] },
      { resolveHost: async () => [{ address, family: 6 }] },
    )).rejects.toThrow(/public/i);
  });

  test("rejects a hostname if any resolved address is unsafe", async () => {
    await expect(assertAllowedSourceUrl(
      "https://official.example/news",
      { allowedHosts: ["official.example"] },
      { resolveHost: async () => [
        { address: "23.1.1.1", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ] },
    )).rejects.toThrow(/public/i);
  });

  test("rejects a hostname with no resolved addresses", async () => {
    await expect(assertAllowedSourceUrl(
      "https://official.example/news",
      { allowedHosts: ["official.example"] },
      { resolveHost: async () => [] },
    )).rejects.toThrow(/resolve/i);
  });

  test("accepts public IPv4 and IPv6 DNS results", async () => {
    await expect(assertAllowedSourceUrl(
      "https://official.example/news",
      { allowedHosts: ["OFFICIAL.EXAMPLE"] },
      { resolveHost: async () => [
        { address: "23.1.1.1", family: 4 },
        { address: "2606:4700:4700::1111", family: 6 },
      ] },
    )).resolves.toEqual(expect.objectContaining({ hostname: "official.example" }));
  });

  test.each([
    "2001:4860:4860::8888",
    "2404:6800:4003::200e",
    "241f:ffff:ffff:ffff::1",
    "2606:4700:4700::1111",
    "2620:fe::fe",
    "263f:ffff:ffff:ffff::1",
    "2800:3f0:4001::200e",
    "2a00:1450:4001:81b::200e",
    "2a1f:ffff:ffff:ffff::1",
    "2c0f:f248::1",
  ])("accepts IANA-allocated global-unicast IPv6 destination %s", async (address) => {
    await expect(assertAllowedSourceUrl(
      "https://official.example/news",
      { allowedHosts: ["official.example"] },
      { resolveHost: async () => [{ address, family: 6 }] },
    )).resolves.toEqual(expect.objectContaining({ hostname: "official.example" }));
  });

  test("normalizes configured internationalized hosts through IDNA", async () => {
    const resolveHost = vi.fn(async () => [{ address: "23.1.1.1", family: 4 }]);

    await expect(assertAllowedSourceUrl(
      "https://bücher.example/news",
      { allowedHosts: ["BÜCHER.EXAMPLE."] },
      { resolveHost },
    )).resolves.toEqual(expect.objectContaining({ hostname: "xn--bcher-kva.example" }));
    expect(resolveHost).toHaveBeenCalledWith("xn--bcher-kva.example", { all: true });
  });

  test("rejects a backslash-ambiguous configured hostname", async () => {
    await expect(assertAllowedSourceUrl(
      "https://official.example/news",
      { allowedHosts: ["official.example\\evil.example"] },
      { resolveHost: async () => [{ address: "23.1.1.1", family: 4 }] },
    )).rejects.toThrow(/allowlist entry is invalid/i);
  });

  test.each([
    ["whitespace-wrapped IPv4", "https://8.8.8.8/news", " 8.8.8.8 "],
    ["whitespace-wrapped IPv6", "https://[2606:4700:4700::1111]/news", " [2606:4700:4700::1111] "],
    ["encoded dot", "https://official.example/news", "official%2eexample"],
    ["encoded letter", "https://official.example/news", "%6ffficial.example"],
  ])("rejects a configured hostname with %s ambiguity", async (_label, url, allowedHost) => {
    await expect(assertAllowedSourceUrl(
      url,
      { allowedHosts: [allowedHost] },
      { resolveHost: async () => [{ address: "23.1.1.1", family: 4 }] },
    )).rejects.toThrow(/allowlist entry is invalid/i);
  });
});
