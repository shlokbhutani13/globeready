import React, { useRef, useState } from "react";
import { FilePlus2, FileText, LockKeyhole, Trash2, UploadCloud } from "lucide-react";
import Disclaimer from "../components/Disclaimer";
import ConsentPanel from "../components/ConsentPanel";

const allowed = new Set(["application/pdf", "image/png", "image/jpeg"]);
export function validateDocument(file) {
  if (!allowed.has(file.type)) return "Upload a PDF, PNG, or JPEG file.";
  if (file.size > 10 * 1024 * 1024) return "Files must be 10 MB or smaller.";
  return "";
}

const readableImageTypes = new Set(["image/png", "image/jpeg"]);

function isReadableDocument(document) {
  if (document.contentType === "application/pdf" || document.name?.toLowerCase().endsWith(".pdf")) return true;
  return readableImageTypes.has(document.contentType) || /\.(png|jpe?g)$/i.test(document.name || "");
}

function indexingLabel(document) {
  if (document.storageMode?.includes("demo")) return "Demo metadata";
  if (document.analysisStatus === "indexing") return "Indexing";
  if (document.analysisStatus === "indexed") return "Ready for questions";
  if (document.analysisStatus === "index_failed") return "Index failed";
  return "Not indexed";
}

function pagesLabel(document) {
  if (!Number.isInteger(document.pageCount)) return "";
  const pages = `${document.pageCount} page${document.pageCount === 1 ? "" : "s"}`;
  const missing = document.pageCount - (document.pagesWithText ?? document.pageCount);
  return missing > 0
    ? `${pages} read · ${missing} had no readable text (scanned or image-only) and cannot be searched`
    : document.pageCount === 1 ? "1 page read" : `All ${document.pageCount} pages read`;
}

export default function DocumentsPage({
  documents = [],
  onAdd = () => {},
  onDelete = () => {},
  onAnalyze = () => {},
  uploadProgress = 0,
  storageAvailable: storageAvailableSetting = true,
  localProcessing = false,
  processing = null,
  onCancelProcessing = () => {},
  onDeleteAllText = async () => {},
  maxDocuments = 50,
  consent,
  onSaveConsent = () => {},
}) {
  const input = useRef(null);
  // consent is undefined when the page is not in a signed-in account, so nothing is gated. In a signed-in
  // account it is null while loading, and uploads stay closed until the student has consented.
  const gated = consent !== undefined && !(consent && consent.documents);
  const atLimit = localProcessing && documents.length >= maxDocuments;
  const documentInputAvailable = (storageAvailableSetting || localProcessing) && !gated && !processing && !atLimit;
  const [error, setError] = useState("");
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const choose = (file) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    const nextError = validateDocument(file);
    setError(nextError);
    if (!nextError) onAdd(file);
  };
  const openPicker = () => { if (documentInputAvailable) input.current?.click(); };
  const deleteAll = async () => {
    setDeletingAll(true);
    try { await onDeleteAllText(); } finally { setDeletingAll(false); setConfirmDeleteAll(false); }
  };
  const zoneTitle = !documentInputAvailable
    ? processing ? "Reading a document…" : atLimit ? `Document limit reached (${maxDocuments})` : gated ? (localProcessing ? "Turn on document reading to add documents" : "Turn on document reading to upload") : "Document uploads unavailable"
    : localProcessing ? "Read a document on this device" : "Upload a document";
  const zoneText = atLimit ? "Delete a document you no longer need to add another."
    : gated && localProcessing ? "GlobeReady reads documents only after you allow it above."
    : localProcessing ? "Text PDFs up to 100 pages, or PNG/JPEG photos of printed English text up to 25 megapixels; 10 MB maximum. The original file never leaves this device and is not backed up. Scanned PDFs and handwriting cannot be read."
    : documentInputAvailable ? "Text-based PDFs, or PNG/JPEG photos of printed text, up to 10 MB. Scanned PDFs and handwriting cannot be read."
    : "Document uploads need Storage to be enabled for this deployment.";
  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">Private document vault</span><h1>Your important documents</h1><p>Keep immigration, insurance, housing, and university records organized.</p></div><button className="button primary" disabled={!documentInputAvailable} onClick={openPicker}><FilePlus2 size={17} /> Add document</button></header>
      {consent !== undefined && <ConsentPanel consent={consent} onSave={onSaveConsent} compact aiAvailable={!localProcessing} />}
      <input ref={input} hidden disabled={!documentInputAvailable} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => choose(event.target.files?.[0])} />
      <section className={`upload-zone${documentInputAvailable ? "" : " disabled"}`} role="button" tabIndex={documentInputAvailable ? 0 : -1} aria-disabled={!documentInputAvailable} onClick={openPicker} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openPicker(); } }}><span><UploadCloud size={27} /></span><div><h2>{zoneTitle}</h2><p>{zoneText}</p></div><LockKeyhole size={19} /></section>
      {error && <div className="inline-error" role="alert">{error}</div>}
      {processing && <div className="upload-progress processing" role="status">
        <div className="progress-track" role="progressbar" aria-label="Document processing" aria-valuemin={0} aria-valuemax={100} aria-valuenow={processing.percent}><span style={{ width: `${processing.percent}%` }} /></div>
        <span>{processing.label} · {processing.percent}%</span>
        <button type="button" className="button secondary" onClick={onCancelProcessing}>Cancel</button>
      </div>}
      {!localProcessing && uploadProgress > 0 && uploadProgress < 100 && <div className="upload-progress"><span style={{ width: `${uploadProgress}%` }} />Uploading {uploadProgress}%</div>}
      {localProcessing && gated && consent && documents.length > 0 && <div className="panel inline-notice" role="status">Document reading is off. Ask is not searching your {documents.length} saved document{documents.length === 1 ? "" : "s"}. Their extracted text stays in your account until you delete it.</div>}
      <section className="panel"><div className="panel-title"><div><span className="eyebrow">Vault</span><h2>{documents.length} document{documents.length === 1 ? "" : "s"}{localProcessing ? ` of ${maxDocuments}` : ""}</h2></div>
        {localProcessing && documents.length > 0 && (confirmDeleteAll
          ? <div className="confirm-row"><span>Delete the extracted text of {documents.length === 1 ? "your saved document" : `all ${documents.length} documents`}?</span><button type="button" className="button danger" disabled={deletingAll} onClick={deleteAll}>Delete all</button><button type="button" className="button secondary" disabled={deletingAll} onClick={() => setConfirmDeleteAll(false)}>Keep</button></div>
          : <button type="button" className="button secondary" onClick={() => setConfirmDeleteAll(true)}><Trash2 size={15} /> Delete all saved document text</button>)}
      </div>
        <div className="document-table">{documents.map((document) => {
          const readable = isReadableDocument(document);
          const isDemo = document.storageMode?.includes("demo");
          const isIndexing = document.analysisStatus === "indexing";
          const local = document.storageMode === "browser-local";
          const actionLabel = !readable ? "Unsupported type"
            : isDemo ? "Demo explanation"
            : isIndexing ? "Indexing…"
            : document.analysisStatus === "indexed" ? "Re-index"
            : document.analysisStatus === "index_failed" ? "Retry indexing"
            : "Index & explain";
          return <div className="document-row" key={document.id}><span className="file-icon"><FileText size={18} /></span><div><strong>{document.name}</strong><small>{local ? "Extracted text saved · original file stays on your device" : `${document.category} · ${document.storageMode || "Firebase Storage"}`}</small>{readable && <small className={`document-status ${document.analysisStatus || "not-indexed"}`}>{indexingLabel(document)}</small>}{local && pagesLabel(document) && <small>{pagesLabel(document)}</small>}{document.analysisStatus === "index_failed" && document.analysisError?.message && <small className="document-error" role="status">{document.analysisError.message}</small>}{document.analysis?.summary && <small>{document.analysis.summary}</small>}{document.analysis?.chunkCount && <small>Indexed for Assistant · {document.analysis.chunkCount} sections</small>}</div>{!local && <button className="analyze-button" disabled={!readable || isIndexing} onClick={() => onAnalyze(document)}>{actionLabel}</button>}<button aria-label={`Delete ${document.name}`} onClick={() => onDelete(document)}><Trash2 size={16} /></button></div>;
        })}</div>
      </section>
      <Disclaimer />
    </div>
  );
}
