import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, Bot, ExternalLink, History, RefreshCcw, Sparkles } from "lucide-react";
import Disclaimer from "../components/Disclaimer";
import { apiRequest } from "../lib/api";
import { answerFromLocalChunks } from "../lib/local-assistant";

export function assistantMessageFromResponse(answer) {
  return {
    role: "assistant",
    text: answer.answer,
    source: answer.sources?.[0]?.organization || answer.sources?.[0]?.title,
    url: answer.sources?.[0]?.url,
    documentCitations: answer.documentCitations || [],
    evidence: answer.evidence || null,
    kind: answer.kind || "answer",
    passages: answer.passages || [],
    notice: answer.notice || "",
    referral: answer.referral?.message || "",
  };
}

const localSuggestions = ["What is my program end date?", "When does my lease end?", "What is my program start date?"];
const serverSuggestions = ["What should I bring to an SSN appointment?", "Explain my I-20 travel signature", "How do I choose a bank account?"];

export default function AssistantPage({ requestAnswer = apiRequest, documents = [], localMode = false, localChunks = [], documentsAllowed = true }) {
  const [question, setQuestion] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [history, setHistory] = useState(null);

  const blocked = localMode && !documentsAllowed;
  const noDocuments = localMode && documentsAllowed && documents.length === 0 && localChunks.length === 0;
  const send = async (text) => {
    if (!text.trim() || blocked || noDocuments) return;
    setLastQuestion(text);
    setError("");
    setBusy(true);
    setMessages((current) => [...current, { role: "user", text }]);
    try {
      const body = { question: text };
      if (documentId) body.documentId = documentId;
      if (conversationId) body.conversationId = conversationId;
      const answer = localMode
        ? answerFromLocalChunks({ question: text, chunks: localChunks, documentId })
        : await requestAnswer("/api/assistant", { method: "POST", body: JSON.stringify(body) });
      if (answer.conversationId) setConversationId(answer.conversationId);
      setMessages((current) => [...current, assistantMessageFromResponse(answer)]);
      setQuestion("");
    } catch (nextError) {
      setError(localMode ? nextError.message : "We could not get an answer. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const ask = (event) => {
    event.preventDefault();
    send(question);
  };

  const openHistory = async () => {
    try {
      const conversations = await requestAnswer("/api/assistant/conversations");
      setHistory(conversations);
    } catch {
      setHistory([]);
      setError("Your conversation history could not be loaded. Try again.");
    }
  };

  const openConversation = async (conversation) => {
    try {
      const stored = await requestAnswer(`/api/assistant/conversations/${conversation.id}/messages`);
      setConversationId(conversation.id);
      setMessages(stored.map((message) => (message.role === "user"
        ? { role: "user", text: message.text }
        : {
          role: "assistant",
          text: message.text,
          source: message.sources?.[0]?.organization || message.sources?.[0]?.title,
          url: message.sources?.[0]?.url,
          documentCitations: message.documentCitations || [],
          evidence: message.evidence || null,
          referral: message.referral?.message || "",
        })));
    } catch {
      setError("That conversation could not be opened.");
    }
  };

  return (
    <div className="assistant-page">
      <header className="assistant-header">
        <span><Bot size={19} /></span>
        <div><h1>{localMode ? "Search your documents" : "GlobeReady Assistant"}</h1><p>{localMode ? "Finds exact passages in your saved document text. The search runs privately in this browser and never writes an answer for you." : "Answers from your uploaded documents and trusted official resources"}</p></div>
        {!localMode && <button type="button" className="text-button history-toggle" onClick={openHistory}><History size={14} /> History</button>}
      </header>
      {history && (
        <div className="conversation-history panel">
          {history.length === 0 && <p className="muted">No earlier conversations yet.</p>}
          {history.map((conversation) => (
            <button key={conversation.id} type="button" className="text-button" onClick={() => openConversation(conversation)}>{conversation.title}</button>
          ))}
        </div>
      )}
      <div className="conversation">
        {blocked && <div className="assistant-empty" role="status"><span><Sparkles size={25} /></span><h2>Document reading is off</h2><p>Ask searches your saved document text only while document reading is on. Turn it on in <Link to="/documents">Documents</Link>, or delete your saved text there.</p></div>}
        {noDocuments && <div className="assistant-empty" role="status"><span><Sparkles size={25} /></span><h2>No saved documents to search</h2><p>Add a text PDF or a photo of printed text in <Link to="/documents">Documents</Link>. It is read on this device, and only the extracted text is saved.</p></div>}
        {!blocked && !noDocuments && messages.length === 0 && <div className="assistant-empty"><span><Sparkles size={25} /></span><h2>{localMode ? "Which passage are you looking for?" : "What can I help you prepare for?"}</h2><p>{localMode ? "Use the words your document uses. Results are exact quotes with the document and page, not an answer." : "Ask about documents, university arrival, SSN, banking, healthcare, housing, CPT, or OPT."}</p><div>{(localMode ? localSuggestions : serverSuggestions).map((item) => <button key={item} onClick={() => setQuestion(item)}>{item}</button>)}</div></div>}
        {messages.map((message, index) => message.kind === "passages" ? <div className="message assistant passages" key={index}>
          <h2 className="passages-title">{message.passages.length ? `${message.passages.length} matching passage${message.passages.length === 1 ? "" : "s"} from your documents` : "No matching passage"}</h2>
          {message.passages.map((passage, passageIndex) => <figure className="passage" key={`${passage.documentId}-${passageIndex}`}>
            <blockquote>{passage.excerpt}</blockquote>
            <figcaption>{passage.documentName}{passage.page ? ` · page ${passage.page}` : ""}</figcaption>
          </figure>)}
          {message.notice && <p className="assistant-notice" role="note">{message.notice}</p>}
          {message.referral && <p className="assistant-referral">{message.referral}</p>}
        </div> : <div className={`message ${message.role}`} key={index}>
          <div>{message.text}</div>
          {message.notice && <p className="assistant-notice" role="note">{message.notice}</p>}
          {message.referral && <p className="assistant-referral">{message.referral}</p>}
          {message.documentCitations?.length > 0 && <div className="document-citations">{message.documentCitations.map((citation, citationIndex) => <small key={`${citation.documentName}-${citationIndex}`}>From {citation.documentName}{citation.page ? ` · page ${citation.page}` : ""}: {citation.excerpt}</small>)}</div>}
          {message.source && <a href={message.url} target="_blank" rel="noreferrer">{message.source} <ExternalLink size={13} /></a>}
        </div>)}
        {error && (
          <div className="inline-error" role="alert">
            <p>{error}</p>
            <button type="button" className="button secondary" onClick={() => send(lastQuestion)} disabled={busy}><RefreshCcw size={14} /> Try again</button>
          </div>
        )}
      </div>
      <form className="assistant-composer" onSubmit={ask}>{documents.length > 0 && <select aria-label="Document scope" value={documentId} onChange={(event) => setDocumentId(event.target.value)}><option value="">All indexed documents</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}</select>}<input aria-label="Ask GlobeReady" disabled={blocked || noDocuments} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={localMode ? "Search your documents, for example: program end date" : "Ask a question about your student journey"} /><button aria-label="Send question" disabled={busy || blocked || noDocuments}><ArrowUp size={18} /></button></form>
      <Disclaimer compact />
    </div>
  );
}
