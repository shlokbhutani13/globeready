const htmlContentTypes = ["text/html", "application/xhtml+xml"];

function source(input) {
  return Object.freeze({
    verified: true,
    cadenceHours: 12,
    sourceDocumentType: "Notice",
    acceptedContentTypes: htmlContentTypes,
    ...input,
    allowedHosts: Object.freeze([...input.allowedHosts]),
    acceptedContentTypes: Object.freeze([...(input.acceptedContentTypes || htmlContentTypes)]),
  });
}

export const defaultNewsSources = Object.freeze([
  source({
    id: "federal-register",
    publisher: "Federal Register",
    adapter: "federal-register",
    fetchMode: "adapter",
    url: "https://www.federalregister.gov/api/v1/documents.json",
    allowedHosts: ["www.federalregister.gov", "www.govinfo.gov"],
    acceptedContentTypes: ["application/json"],
    cadenceHours: 6,
    agencies: [
      "Department of Homeland Security",
      "U.S. Citizenship and Immigration Services",
      "U.S. Immigration and Customs Enforcement",
      "State Department",
      "Education Department",
      "Labor Department",
      "Treasury Department",
      "Internal Revenue Service",
      "Social Security Administration",
      "Executive Office of the President",
    ],
  }),
  source({
    id: "uscis",
    publisher: "U.S. Citizenship and Immigration Services",
    adapter: "index-page",
    url: "https://www.uscis.gov/newsroom/all-news",
    allowedHosts: ["www.uscis.gov"],
  }),
  source({
    id: "ice-sevp",
    publisher: "Student and Exchange Visitor Program",
    adapter: "index-page",
    url: "https://www.ice.gov/sevis/whats-new",
    allowedHosts: ["www.ice.gov"],
  }),
  source({
    id: "study-in-the-states",
    publisher: "Study in the States",
    adapter: "index-page",
    url: "https://studyinthestates.dhs.gov/news",
    allowedHosts: ["studyinthestates.dhs.gov"],
  }),
  source({
    id: "state-visa-news",
    publisher: "U.S. Department of State",
    adapter: "index-page",
    url: "https://travel.state.gov/content/travel/en/News/visas-news.html",
    allowedHosts: ["travel.state.gov"],
  }),
  source({
    id: "state-travel-rss",
    publisher: "U.S. Department of State",
    adapter: "feed",
    url: "https://travel.state.gov/_res/rss/TAsTWs.xml",
    allowedHosts: ["travel.state.gov"],
    acceptedContentTypes: ["application/rss+xml", "application/xml", "text/xml"],
  }),
  source({
    id: "cbp",
    publisher: "U.S. Customs and Border Protection",
    adapter: "index-page",
    url: "https://www.cbp.gov/newsroom/national-media-release",
    allowedHosts: ["www.cbp.gov"],
  }),
  source({
    id: "irs",
    publisher: "Internal Revenue Service",
    adapter: "index-page",
    url: "https://www.irs.gov/newsroom",
    allowedHosts: ["www.irs.gov"],
  }),
  source({
    id: "ssa",
    publisher: "Social Security Administration",
    adapter: "index-page",
    url: "https://www.ssa.gov/news/en/press/releases/",
    allowedHosts: ["www.ssa.gov"],
  }),
  source({
    id: "labor",
    publisher: "U.S. Department of Labor",
    adapter: "index-page",
    url: "https://www.dol.gov/newsroom/releases",
    allowedHosts: ["www.dol.gov"],
  }),
  source({
    id: "white-house",
    publisher: "The White House",
    adapter: "index-page",
    url: "https://www.whitehouse.gov/presidential-actions/",
    allowedHosts: ["www.whitehouse.gov"],
    cadenceHours: 6,
    sourceDocumentType: "Presidential Action",
  }),
]);

export function defaultNewsSource(sourceId) {
  return defaultNewsSources.find(({ id }) => id === sourceId) || null;
}
