import React, { useState } from "react";
import { ArrowUp, Bot, ExternalLink, Sparkles } from "lucide-react";
import Disclaimer from "../components/Disclaimer";
import { apiRequest } from "../lib/api";

const demoAnswer = {
  text: "Before an SSN appointment, confirm employment eligibility and prepare your passport, visa, I-20, I-94, and employment letter. Your university may require a specific letter format.",
  source: "Social Security Administration",
  url: "https://www.ssa.gov/pubs/EN-05-10096.pdf",
};

export default function AssistantPage() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const ask = async (event) => {
    event.preventDefault();
    if (!question.trim()) return;
    const userMessage = { role: "user", text: question };
    setMessages([...messages, userMessage]);
    setBusy(true);
    try {
      const answer = await apiRequest("/api/assistant", { method: "POST", body: JSON.stringify({ question }) });
      setMessages((current) => [...current, { role: "assistant", text: answer.answer, source: answer.sources?.[0]?.organization, url: answer.sources?.[0]?.url }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", ...demoAnswer }]);
    } finally {
      setBusy(false);
    }
    setQuestion("");
  };
  return (
    <div className="assistant-page">
      <header className="assistant-header"><span><Bot size={19} /></span><div><h1>GlobeReady Assistant</h1><p>Answers from your profile and trusted resources</p></div><span className="demo-pill">Demo guidance</span></header>
      <div className="conversation">
        {messages.length === 0 && <div className="assistant-empty"><span><Sparkles size={25} /></span><h2>What can I help you prepare for?</h2><p>Ask about documents, university arrival, SSN, banking, healthcare, housing, CPT, or OPT.</p><div>{["What should I bring to an SSN appointment?", "Explain my I-20 travel signature", "How do I choose a bank account?"].map((item) => <button key={item} onClick={() => setQuestion(item)}>{item}</button>)}</div></div>}
        {messages.map((message, index) => <div className={`message ${message.role}`} key={index}><div>{message.text}</div>{message.source && <a href={message.url} target="_blank" rel="noreferrer">{message.source} <ExternalLink size={13} /></a>}</div>)}
      </div>
      <form className="assistant-composer" onSubmit={ask}><input aria-label="Ask GlobeReady" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question about your student journey" /><button aria-label="Send question" disabled={busy}><ArrowUp size={18} /></button></form>
      <Disclaimer compact />
    </div>
  );
}
