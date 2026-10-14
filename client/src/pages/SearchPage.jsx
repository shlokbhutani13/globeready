import React, { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import { searchEverything } from "../lib/global-search";

export default function SearchPage({ news = [], guides = [], tasks = [], documents = [], cases = [], newsLoading = false }) {
  const [params] = useSearchParams();
  const query = params.get("q") || "";
  const result = useMemo(() => searchEverything(query, { news, guides, tasks, documents, cases }), [query, news, guides, tasks, documents, cases]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Search"
        title={query ? `Results for “${query}”` : "Search"}
        description="Searches reviewed updates, rules and forms, guides, resources, case names, task titles and document names. It never looks inside your documents or notes. To find a passage inside one, use Ask, which works only while document reading is on."
        action={<Link className="button secondary" to="/assistant">Search inside documents</Link>}
      />
      {!query.trim() && <EmptyState title="Type something to search">Use the search box at the top of the page.</EmptyState>}
      {query.trim() && newsLoading && <p className="loading-state" role="status">Loading updates…</p>}
      {query.trim() && result.total === 0 && !newsLoading && (
        <EmptyState title="Nothing matches">Try a shorter or different word. Document contents are not searched here.</EmptyState>
      )}
      {result.groups.map((group) => (
        <section className="search-group" key={group.id} aria-labelledby={`search-${group.id}`}>
          <h2 id={`search-${group.id}`}>{group.label} ({group.total})</h2>
          <ul>
            {group.results.map((entry) => (
              <li key={entry.id}><Link to={entry.to}>{entry.title}{entry.detail && <small>{entry.detail}</small>}</Link></li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
