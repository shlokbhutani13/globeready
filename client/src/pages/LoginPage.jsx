import React from "react";
import { ArrowRight, BookOpenCheck, FileLock2, Globe2, Sparkles } from "lucide-react";

export default function LoginPage({ onDemo }) {
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="logo light"><span><Globe2 size={21} /></span> GlobeReady</div>
        <div className="login-copy">
          <span className="eyebrow">Your international student command center</span>
          <h1>Arrive prepared.<br />Stay on track.</h1>
          <p>Documents, deadlines, trusted guides, and clear answers in one calm workspace.</p>
          <div className="login-benefits">
            <span><FileLock2 /> Secure document vault</span>
            <span><BookOpenCheck /> Trusted student guidance</span>
            <span><Sparkles /> AI explanations with sources</span>
          </div>
        </div>
        <small>Information support, not legal advice.</small>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="demo-pill">Portfolio demo</span>
          <h2>Welcome to GlobeReady</h2>
          <p>Explore a complete student journey using safe sample data. No account or API key is required.</p>
          <button className="button primary wide" onClick={onDemo}>Continue in demo mode <ArrowRight size={17} /></button>
          <div className="login-divider"><span>Live authentication</span></div>
          <button className="button secondary wide" disabled>Continue with Google</button>
          <button className="button secondary wide" disabled>Sign in with email</button>
          <small>Connect Firebase to enable live accounts and cloud document storage.</small>
        </div>
      </section>
    </main>
  );
}
