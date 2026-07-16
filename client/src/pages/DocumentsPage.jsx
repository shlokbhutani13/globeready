import React, { useRef, useState } from "react";
import { FilePlus2, FileText, LockKeyhole, Trash2, UploadCloud } from "lucide-react";
import Disclaimer from "../components/Disclaimer";

const allowed = new Set(["application/pdf", "image/png", "image/jpeg"]);
export function validateDocument(file) {
  if (!allowed.has(file.type)) return "Upload a PDF, PNG, or JPEG file.";
  if (file.size > 10 * 1024 * 1024) return "Files must be 10 MB or smaller.";
  return "";
}

export default function DocumentsPage({ documents = [], onAdd = () => {}, onDelete = () => {} }) {
  const input = useRef(null);
  const [error, setError] = useState("");
  const choose = (file) => {
    if (!file) return;
    const nextError = validateDocument(file);
    setError(nextError);
    if (!nextError) onAdd({ name: file.name, contentType: file.type, size: file.size, category: "Other" });
  };
  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">Private document vault</span><h1>Your important documents</h1><p>Keep immigration, insurance, housing, and university records organized.</p></div><button className="button primary" onClick={() => input.current?.click()}><FilePlus2 size={17} /> Add document</button></header>
      <input ref={input} hidden type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => choose(event.target.files?.[0])} />
      <section className="upload-zone" onClick={() => input.current?.click()}><span><UploadCloud size={27} /></span><div><h2>Upload a document</h2><p>PDF, PNG, or JPEG up to 10 MB</p></div><LockKeyhole size={19} /></section>
      {error && <div className="inline-error">{error}</div>}
      <section className="panel"><div className="panel-title"><div><span className="eyebrow">Vault</span><h2>{documents.length} documents</h2></div></div>
        <div className="document-table">{documents.map((document) => <div className="document-row" key={document.id}><span className="file-icon"><FileText size={18} /></span><div><strong>{document.name}</strong><small>{document.category} · {document.storageMode || "demo storage"}</small></div><span className="status">Ready</span><button aria-label={`Delete ${document.name}`} onClick={() => onDelete(document.id)}><Trash2 size={16} /></button></div>)}</div>
      </section>
      <Disclaimer />
    </div>
  );
}
