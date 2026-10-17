import React, { useState } from "react";
import { BellRing, ShieldAlert } from "lucide-react";
import { disablePush, enablePush, needsHomeScreen, pushState } from "../lib/push";

const storageKey = (uid) => `globeready.push.${uid}`;
const read = (storage, uid) => { try { return storage?.getItem(storageKey(uid)) || ""; } catch { return ""; } };
const write = (storage, uid, value) => { try { value ? storage?.setItem(storageKey(uid), value) : storage?.removeItem(storageKey(uid)); } catch { /* private mode */ } };

export default function PushPanel({ uid, firestore, app, storage = globalThis.localStorage, enable = enablePush, disable = disablePush, state = pushState({ standaloneRequired: needsHomeScreen() }) }) {
  const [token, setToken] = useState(() => read(storage, uid));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (state.status === "unconfigured") return null;

  const turnOn = async () => {
    setBusy(true); setError("");
    try {
      const result = await enable({ firestore, uid, app });
      write(storage, uid, result.token); setToken(result.token);
    } catch (caught) { setError(caught.message || "Push reminders could not be turned on."); }
    setBusy(false);
  };
  const turnOff = async () => {
    setBusy(true); setError("");
    try { await disable({ firestore, uid, app, token }); write(storage, uid, ""); setToken(""); }
    catch (caught) { setError(caught.message || "Push reminders could not be turned off."); }
    setBusy(false);
  };

  return <section className="panel settings-section" aria-labelledby="push-title">
    <div className="panel-title"><h2 id="push-title">Push reminders</h2></div>
    <p className="muted">Get a notification on this device when a key date or task is close, even when GlobeReady is closed. Notifications show only the title of the date or task, never document contents. You can turn this off at any time, which deletes this device’s push address from your account.</p>
    {state.message && <p className="notice"><ShieldAlert size={16} aria-hidden="true" /> {state.message}</p>}
    {error && <p className="inline-error" role="alert"><ShieldAlert size={14} aria-hidden="true" /> {error}</p>}
    {token
      ? <><p className="success-text" role="status">Push reminders are on for this device.</p><button className="button secondary" type="button" disabled={busy} onClick={turnOff}>Turn off push reminders</button></>
      : <button className="button secondary" type="button" disabled={busy || state.status !== "ready"} onClick={turnOn}><BellRing size={16} aria-hidden="true" /> Turn on push reminders</button>}
  </section>;
}
