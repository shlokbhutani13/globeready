import React, { useEffect, useState } from "react";

// Offers installation where the browser supports it, with honest notes on what works offline.
export default function InstallPanel() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const onPrompt = (event) => { event.preventDefault(); setPromptEvent(event); };
    const onInstalled = () => { setInstalled(true); setPromptEvent(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  const install = async () => {
    if (!promptEvent) return;
    promptEvent.prompt();
    await promptEvent.userChoice?.catch(() => {});
    setPromptEvent(null);
  };
  return (
    <section className="panel settings-section" aria-labelledby="install-title">
      <div className="panel-title"><h2 id="install-title">Install GlobeReady</h2></div>
      <p className="muted">Add GlobeReady to your phone or computer so it opens like an app. Offline, you can open the app, read the reviewed updates you have already loaded, and read guides. Saving changes, signing in, and reading new data need an internet connection, and changes made offline are not saved or queued.</p>
      {installed && <p role="status">GlobeReady is installed on this device.</p>}
      {promptEvent && <button type="button" className="button secondary" onClick={install}>Install on this device</button>}
      {!promptEvent && !installed && <p className="muted">If you do not see an install button: in Chrome or Edge use the install icon in the address bar; on iPhone or iPad use Share, then Add to Home Screen.</p>}
    </section>
  );
}
