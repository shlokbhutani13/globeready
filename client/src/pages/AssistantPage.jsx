import React, { useState } from "react";
import { ArrowUp, Bot, ExternalLink, Sparkles } from "lucide-react";
import Disclaimer from "../components/Disclaimer";
import { apiRequest } from "../lib/api";

const demoAnswer = {
  text: "Before an SSN appointment, confirm employment eligibility and prepare your passport, visa, I-20, I-94, and employment letter. Your university may require a specific letter format.",
  source: "Social Security Administration",
  url: "https://www.ssa.gov/pubs/EN-05-10096.pdf",
};

export function assistantMessageFromResponse(answer) {
  return {
    role: "assistant",
    text: answer.answer,
    source: answer.sources?.[0]?.organization || answer.sources?.[0]?.title,
    url: answer.sources?.[0]?.url,
    documentCitations: answer.documentCitations || [],
  };
}

export default function AssistantPage({ requestAnswer = apiRequest, documents = [] }) {
  const [question, setQuestion] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const ask = async (event) => {
    event.preventDefault();
    if (!question.trim()) return;
    const userMessage = { role: "user", text: question };
    setMessages([...messages, userMessage]);
    setBusy(true);
    try {
      const body = { question };
      if (documentId) body.documentId = documentId;
      const answer = await requestAnswer("/api/assistant", { method: "POST", body: JSON.stringify(body) });
      setMessages((current) => [...current, assistantMessageFromResponse(answer)]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", ...demoAnswer }]);
    } finally {
      setBusy(false);
    }
    setQuestion("");
  };
  return (
    <div className="assistant-page">
      <header className="assistant-header"><span><Bot size={19} /></span><div><h1>GlobeReady Assistant</h1><p>Answers from your profile, indexed documents, and trusted resources</p></div><span className="demo-pill">Guidance</span></header>
      <div className="conversation">
        {messages.length === 0 && <div className="assistant-empty"><span><Sparkles size={25} /></span><h2>What can I help you prepare for?</h2><p>Ask about documents, university arrival, SSN, banking, healthcare, housing, CPT, or OPT.</p><div>{["What should I bring to an SSN appointment?", "Explain my I-20 travel signature", "How do I choose a bank account?"].map((item) => <button key={item} onClick={() => setQuestion(item)}>{item}</button>)}</div></div>}
        {messages.map((message, index) => <div className={`message ${message.role}`} key={index}><div>{message.text}</div>{message.documentCitations?.length > 0 && <div className="document-citations">{message.documentCitations.map((citation, citationIndex) => <small key={`${citation.documentName}-${citationIndex}`}>From {citation.documentName}{citation.page ? ` · page ${citation.page}` : ""}: {citation.excerpt}</small>)}</div>}{message.source && <a href={message.url} target="_blank" rel="noreferrer">{message.source} <ExternalLink size={13} /></a>}</div>)}
      </div>
      <form className="assistant-composer" onSubmit={ask}>{documents.length > 0 && <select aria-label="Document scope" value={documentId} onChange={(event) => setDocumentId(event.target.value)}><option value="">All indexed documents</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}</select>}<input aria-label="Ask GlobeReady" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question about your student journey" /><button aria-label="Send question" disabled={busy}><ArrowUp size={18} /></button></form>
      <Disclaimer compact />
    </div>
  );
}
