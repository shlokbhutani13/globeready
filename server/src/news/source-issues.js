export const sourceIssueMarker = (sourceId) => `<!-- globeready-news-source:${sourceId} -->`;

export function overdueSourceFailures(sourceReports = [], now = new Date(), hours = 24) {
  const cutoff = now.getTime() - hours * 60 * 60 * 1000;
  return sourceReports.filter((report) => {
    if (!["failed", "blocked-by-robots"].includes(report?.state)) return false;
    const since = Date.parse(report.failedSince || "");
    return Number.isFinite(since) && since <= cutoff;
  });
}
