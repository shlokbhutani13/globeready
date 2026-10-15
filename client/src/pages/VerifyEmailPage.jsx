import React, { useState } from "react";
import { Globe2, MailCheck } from "lucide-react";

// Shown in the zero-cost beta until an email/password account opens its verification link. Its Firestore rules
// refuse writes from unverified addresses, so the workspace would otherwise fail on every save.
export default function VerifyEmailPage({ auth }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (action, success) => {
    setBusy(true);
    setStatus("");
    try {
      const result = await action();
      setStatus(typeof success === "function" ? success(result) : success);
    } catch (error) {
      setStatus(error?.code === "auth/too-many-requests" ? "Too many requests. Wait a few minutes before sending another email." : error?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-page verify-page">
      <section className="login-panel">
        <div className="login-card" aria-labelledby="verify-title">
          <div className="logo"><span><Globe2 size={19} /></span> GlobeReady</div>
          <span className="demo-pill"><MailCheck size={14} /> One more step</span>
          <h2 id="verify-title">Verify your email address</h2>
          <p>We sent a verification link to <strong>{auth.user?.email}</strong>. Open it, then return here. Verification protects the free beta from automated sign-ups.</p>
          <button className="button primary wide" disabled={busy} onClick={() => run(auth.refreshVerification, (verified) => (verified ? "Verified. Opening your workspace…" : "Not verified yet. Open the link in the email, then try again."))}>I have verified my email</button>
          <button className="button secondary wide" disabled={busy} onClick={() => run(auth.sendVerificationEmail, "A new verification email is on its way. Check your spam folder too.")}>Send the email again</button>
          <button className="text-button" disabled={busy} onClick={() => auth.signOutUser()}>Sign out</button>
          {status && <p className="muted" role="status">{status}</p>}
        </div>
      </section>
    </main>
  );
}
