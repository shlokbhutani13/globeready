import React, { useRef, useState } from "react";
import { FilePlus2, FileText, LockKeyhole, Trash2, UploadCloud } from "lucide-react";
import Disclaimer from "../components/Disclaimer";

const allowed = new Set(["application/pdf", "image/png", "image/jpeg"]);
export function validateDocument(file) {
  if (!allowed.has(file.type)) return "Upload a PDF, PNG, or JPEG file.";
  if (file.size > 10 * 1024 * 1024) return "Files must be 10 MB or smaller.";
  return "";
}

function indexingLabel(document) {
  if (document.storageMode?.includes("demo")) return "Demo metadata";
  if (document.analysisStatus === "indexing") return "Indexing";
  if (document.analysisStatus === "indexed") return "Ready for questions";
  if (document.analysisStatus === "index_failed") return "Index failed";
  return "Not indexed";
}

export default function DocumentsPage({
  documents = [],
  onAdd = () => {},
  onDelete = () => {},
  onAnalyze = () => {},
  uploadProgress = 0,
  storageAvailable = true,
}) {
  const input = useRef(null);
  const [error, setError] = useState("");
  const choose = (file) => {
    if (!file) return;
    const nextError = validateDocument(file);
    setError(nextError);
    if (!nextError) onAdd(file);
  };
  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">Private document vault</span><h1>Your important documents</h1><p>Keep immigration, insurance, housing, and university records organized.</p></div><button className="button primary" disabled={!storageAvailable} onClick={() => input.current?.click()}><FilePlus2 size={17} /> Add document</button></header>
      <input ref={input} hidden disabled={!storageAvailable} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => choose(event.target.files?.[0])} />
      <section className={`upload-zone${storageAvailable ? "" : " disabled"}`} onClick={() => storageAvailable && input.current?.click()}><span><UploadCloud size={27} /></span><div><h2>{storageAvailable ? "Upload a document" : "Document uploads unavailable"}</h2><p>{storageAvailable ? "PDF, PNG, or JPEG up to 10 MB" : "Document uploads need Storage to be enabled for this deployment."}</p></div><LockKeyhole size={19} /></section>
      {error && <div className="inline-error">{error}</div>}
      {uploadProgress > 0 && uploadProgress < 100 && <div className="upload-progress"><span style={{ width: `${uploadProgress}%` }} />Uploading {uploadProgress}%</div>}
      <section className="panel"><div className="panel-title"><div><span className="eyebrow">Vault</span><h2>{documents.length} documents</h2></div></div>
        <div className="document-table">{documents.map((document) => {
          const isPdf = document.contentType === "application/pdf" || document.name.toLowerCase().endsWith(".pdf");
          const isDemo = document.storageMode?.includes("demo");
          const isIndexing = document.analysisStatus === "indexing";
          const actionLabel = !isPdf ? "PDFs only" : isDemo ? "Demo explanation" : isIndexing ? "Indexing…" : document.analysisStatus === "indexed" ? "Re-index" : "Index & explain";
          return <div className="document-row" key={document.id}><span className="file-icon"><FileText size={18} /></span><div><strong>{document.name}</strong><small>{document.category} · {document.storageMode || "Firebase Storage"}</small>{isPdf && <small className={`document-status ${document.analysisStatus || "not-indexed"}`}>{indexingLabel(document)}</small>}{document.analysis?.summary && <small>{document.analysis.summary}</small>}{document.analysis?.chunkCount && <small>Indexed for Assistant · {document.analysis.chunkCount} sections</small>}</div><button className="analyze-button" disabled={!isPdf || isIndexing} onClick={() => onAnalyze(document)}>{actionLabel}</button><button aria-label={`Delete ${document.name}`} onClick={() => onDelete(document)}><Trash2 size={16} /></button></div>;
        })}</div>
      </section>
      <Disclaimer />
    </div>
  );
}
