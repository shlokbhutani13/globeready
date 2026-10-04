import React, { useState } from "react";
import { ArrowRight, BookOpenCheck, FileLock2, Globe2, Sparkles } from "lucide-react";

export default function LoginPage({ onDemo, auth, localUser = false, demoAvailable = false }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      if (mode === "signup") await auth.signUpEmail(email, password);
      else await auth.signInEmail(email, password);
    } catch (reason) {
      setError(reason?.message || "Authentication failed.");
    }
  };
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
          <span className="demo-pill">{localUser ? "Local development" : demoAvailable ? "Demo available" : "Secure sign-in"}</span>
          <h2>Welcome to GlobeReady</h2>
          <p>Sign in for your private workspace, or explore the product with safe sample data.</p>
          {demoAvailable && <button className="button primary wide" onClick={onDemo}>Continue in demo mode <ArrowRight size={17} /></button>}
          {localUser && <p className="local-user-note"><strong>Local development account.</strong> The Google button opens a mock Google identity from the local Firebase Auth emulator. It is not your Google account.</p>}
          <div className="login-divider"><span>Live authentication</span></div>
          <button className="button secondary wide" disabled={!auth.firebaseConfigured} onClick={() => auth.signInGoogle().catch((reason) => setError(reason.message))}>Continue with Google</button>
          <form className="auth-form" onSubmit={submit}>
            <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Password<input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength="6" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {error && <div className="inline-error">{error}</div>}
            <button className="button secondary wide" disabled={!auth.firebaseConfigured}>{mode === "signup" ? "Create account" : "Sign in with email"}</button>
          </form>
          <button className="text-button" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>{mode === "signup" ? "Already have an account? Sign in" : "New to GlobeReady? Create an account"}</button>
          <button className="text-button" disabled={!email || !auth.firebaseConfigured} onClick={() => auth.resetPassword(email).catch((reason) => setError(reason.message))}>Reset password</button>
          <small>{auth.firebaseConfigured ? "Authentication is connected. Documents use your Firebase project." : "Connect Firebase to enable live accounts and cloud document storage."}</small>
        </div>
      </section>
    </main>
  );
}
