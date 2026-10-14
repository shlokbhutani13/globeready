import { describe, expect, test } from "vitest";
import { comingUp, matchedForProfile, profileSummary } from "../lib/applies";
import { domainPattern, isOnDomain, officeLinks, officeTypes, siteSearchUrl, universityCoverage, universityResources } from "../lib/university";
import { reviewedUniversities } from "../data/university-coverage";

const news = [
  { id: "n1", title: "Fixed periods", visaTypes: ["f-1"], journeyStages: ["enrolled"], topics: ["status"], universityIds: [] },
  { id: "n2", title: "J-1 only", visaTypes: ["j-1"], topics: ["employment"], universityIds: [] },
  { id: "n3", title: "Campus alert", visaTypes: [], topics: [], universityIds: ["example-university"] },
];
const profile = { visaType: "F-1", journeyStage: "Current student", university: "Example University", topics: ["employment"] };

describe("profile inputs", () => {
  test("lists the four inputs and which are missing", () => {
    expect(profileSummary(profile).complete).toBe(true);
    const partial = profileSummary({ visaType: "F-1" });
    expect(partial.missing.map((input) => input.id)).toEqual(["journeyStage", "university", "topics"]);
    expect(profileSummary({}).inputs).toHaveLength(4);
  });
});

describe("matching to the profile", () => {
  test("returns only items that match, strongest match first, each explaining its matching fields", () => {
    const result = matchedForProfile({ profile, news });
    expect(result.updates.map((entry) => entry.item.id)).toEqual(["n1", "n2", "n3"]);
    expect(result.updates.find((entry) => entry.item.id === "n1").relevance.matches.map((match) => match.field)).toEqual(["visaType", "journeyStage"]);
    expect(result.updates.find((entry) => entry.item.id === "n3").relevance.matches.map((match) => match.field)).toEqual(["university"]);
    expect(result.updates.find((entry) => entry.item.id === "n1").relevance.explanation).toMatch(/does not mean the update legally applies/u);
  });
  test("an empty profile matches nothing", () => {
    expect(matchedForProfile({ profile: {}, news }).updates).toEqual([]);
    expect(matchedForProfile({ profile: {}, news }).rules).toEqual([]);
  });
  test("matches library entries and leaves out superseded ones", () => {
    const result = matchedForProfile({ profile: { visaType: "F-1" }, news: [] });
    expect(result.rules.length).toBeGreaterThan(3);
    expect(result.rules.some((entry) => entry.item.status === "superseded")).toBe(false);
    expect(result.rules.every((entry) => entry.item.visaTypes.includes("f-1"))).toBe(true);
  });
});

describe("coming up", () => {
  const now = new Date(2026, 9, 14);
  test("merges tasks, key dates and case events within the window, soonest first", () => {
    const rows = comingUp({ now, tasks: [{ id: "t", title: "Pay fee", dueDate: "2026-10-20" }, { id: "d", title: "Done", dueDate: "2026-10-15", completed: true }, { id: "f", title: "Far", dueDate: "2027-05-01" }], dates: [{ id: "k", label: "Passport", date: "2026-10-16" }, { id: "c-1", caseId: "c", label: "OPT: appointment", date: "2026-10-30" }] });
    expect(rows.map((row) => row.title)).toEqual(["Passport", "Pay fee", "OPT: appointment"]);
    expect(rows.map((row) => row.kind)).toEqual(["Key date", "Task", "Case"]);
  });
  test("keeps things that passed within a week", () => {
    expect(comingUp({ now, tasks: [{ id: "t", title: "Late", dueDate: "2026-10-10" }, { id: "u", title: "Ancient", dueDate: "2026-08-01" }] }).map((row) => row.title)).toEqual(["Late"]);
  });
});

describe("university coverage", () => {
  test("says plainly when nothing was entered", () => {
    expect(universityCoverage({})).toMatchObject({ status: "none", offices: [] });
  });
  test("says a university is not reviewed when it is not, with or without a website", () => {
    expect(universityCoverage({ university: "Example University" }, news)).toMatchObject({ status: "general-only", headline: "Not reviewed by GlobeReady yet" });
    const withDomain = universityCoverage({ university: "Example University", officialUniversityDomain: "Example.edu" }, news);
    expect(withDomain).toMatchObject({ status: "domain-only", domain: "example.edu" });
    expect(withDomain.detail).toMatch(/have not checked what they lead to/u);
  });
  test("lists reviewed updates for the university when there are some", () => {
    expect(universityCoverage({ university: "Example University" }, news).updates.map((item) => item.id)).toEqual(["n3"]);
  });
  test("ships with no reviewed universities, so nothing is claimed as verified", () => {
    expect(reviewedUniversities).toEqual([]);
  });
  test("a reviewed entry is reported as reviewed with its own links and date", () => {
    const reviewed = [{ id: "example-university", name: "Example University", domain: "example.edu", reviewedOn: "2026-10-14", offices: [{ id: "intl", label: "International Student Services", url: "https://international.example.edu/" }] }];
    const coverage = universityCoverage({ university: "Example University" }, [], reviewed);
    expect(coverage).toMatchObject({ status: "reviewed", reviewedOn: "2026-10-14" });
    expect(officeLinks(coverage)).toEqual([{ id: "intl", label: "International Student Services", url: "https://international.example.edu/", reviewed: true }]);
  });
  test("ignores an invalid website instead of building links from it", () => {
    expect(universityCoverage({ university: "X", officialUniversityDomain: "evil.com/phish" }).status).toBe("general-only");
    expect(domainPattern.test("school.edu")).toBe(true);
    expect(domainPattern.test("cs.school.edu")).toBe(true);
    expect(domainPattern.test("www.ox.ac.uk")).toBe(true);
    expect(domainPattern.test("university.ca")).toBe(true);
    expect(domainPattern.test("school")).toBe(false);
    expect(domainPattern.test("127.0.0.1")).toBe(false);
    expect(domainPattern.test("https://school.edu")).toBe(false);
  });
});

describe("office links and saved links", () => {
  test("generate one clearly unreviewed search per office type from the entered website", () => {
    const links = officeLinks({ status: "domain-only", domain: "example.edu", offices: [] });
    expect(links).toHaveLength(officeTypes.length);
    expect(links.every((link) => link.reviewed === false)).toBe(true);
    expect(links[0].url).toBe(siteSearchUrl("example.edu", officeTypes[0].query));
    expect(decodeURIComponent(links[0].url)).toContain("site:example.edu international student services");
    expect(officeLinks({ status: "general-only", domain: "", offices: [] })).toEqual([]);
  });
  test("saved university links come from the University category and are checked against the website", () => {
    expect(universityResources([{ id: "a", category: "University" }, { id: "b", category: "Visa" }]).map((resource) => resource.id)).toEqual(["a"]);
    expect(isOnDomain("https://international.example.edu/dso", "example.edu")).toBe(true);
    expect(isOnDomain("https://example.edu.evil.com/", "example.edu")).toBe(false);
    expect(isOnDomain("https://notexample.edu/", "example.edu")).toBe(false);
    expect(isOnDomain("nonsense", "example.edu")).toBe(false);
    expect(isOnDomain("https://example.edu/", "")).toBe(false);
  });
});
