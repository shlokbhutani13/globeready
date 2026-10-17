import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { universityIdFor } from "../lib/news-data";
import { domainPattern } from "../lib/university";
import { normalizeStudentProfile, profileClaimNotice, trainingChoicesFor } from "../lib/student-profile";

const topicLabels = {
  general: "General", status: "Maintaining status", "forms-fees": "Forms and fees", employment: "Work and training",
  "travel-entry": "Travel and entry", "taxes-social-security": "Taxes and Social Security", emergency: "Emergencies",
  "campus-life": "Campus life", university: "My university",
};

export default function ProfilePage({ profile, onSave, showTopics = false }) {
  const [form, setForm] = useState(() => normalizeStudentProfile(profile));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(normalizeStudentProfile(profile)), [profile]);
  const field = (name) => ({ value: form[name] || "", onChange: (event) => { setSaved(false); setForm({ ...form, [name]: event.target.value }); } });
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSaved(false);
    const domain = (form.officialUniversityDomain || "").trim().toLowerCase();
    const validDomain = showTopics ? domainPattern.test(domain) : /^[a-z0-9.-]+\.edu$/u.test(domain);
    if (domain && !validDomain) {
      setError(showTopics ? "Enter the school's website domain without https:// or a path, such as school.edu or university.ac.uk." : "Enter the school's official .edu domain, such as school.edu.");
      return;
    }
    if (form.startDate && form.graduationDate && form.graduationDate < form.startDate) {
      setError("Graduation date must be on or after your start date.");
      return;
    }
    setBusy(true);
    const canonicalForm = { ...form };
    delete canonicalForm.degreeLevel;
    delete canonicalForm.visaType;
    delete canonicalForm.journeyStage;
    // The app reports a failed save through its own error banner and resolves to false.
    const result = await onSave({
      ...canonicalForm,
      universityId: universityIdFor(form.university),
      officialUniversityDomain: domain,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    });
    setBusy(false);
    setSaved(result !== false);
  };
  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">Personalization</span><h1>Your student profile</h1><p>GlobeReady uses these details to prioritize relevant tasks and resources.</p></div></header>
      <form className="panel profile-form" onSubmit={submit}>
        <label>Full name<input {...field("fullName")} /></label><label>Home country<input {...field("homeCountry")} /></label>
        <label>University<input {...field("university")} /></label><label>Program<input {...field("program")} /></label>
        <label>Official university website domain (optional)<input {...field("officialUniversityDomain")} placeholder={showTopics ? "school.edu or university.ac.uk" : "school.edu"} /></label>
        <p className="muted profile-note">A domain is reviewed by GlobeReady before its updates are shown as covered. Until then your school is marked as verification pending.</p>
        <p className="inline-notice profile-claim-notice"><strong>{profileClaimNotice}</strong> GlobeReady uses these answers to hide guidance that does not match the visa category you selected. It does not determine your status or eligibility.</p>
        <label>Program level<select {...field("programLevel")}><option value="undergraduate">Undergraduate</option><option value="masters">Master’s</option><option value="phd">PhD</option><option value="other">Other / non-degree</option></select></label>
        <label>Visa category<select value={form.visaCategory || "other"} onChange={(event) => { const visaCategory = event.target.value; setSaved(false); setForm({ ...form, visaCategory, trainingStatus: "not-reported" }); }}><option value="f-1">F-1</option><option value="j-1">J-1</option><option value="other">Other</option></select></label>
        <label>Program start date<input type="date" {...field("startDate")} /></label>
        <label>Expected graduation date<input type="date" {...field("graduationDate")} /></label>
        <label>Student stage<select {...field("studentStage")}><option value="pre-arrival">Pre-arrival</option><option value="arrived">Arrived</option><option value="studying">Studying</option><option value="post-completion">Post-completion</option></select></label>
        <label>OPT/CPT/Academic Training status<select {...field("trainingStatus")}>{trainingChoicesFor(form.visaCategory).map((choice) => <option value={choice.id} key={choice.id}>{choice.label}</option>)}</select></label>
        {showTopics && <fieldset className="topic-fieldset"><legend>Topics I want flagged in Updates</legend>
          <p className="muted profile-note">Used only to label updates that may be relevant. It is informational and never decides what applies to you.</p>
          <div className="topic-grid">{Object.entries(topicLabels).map(([id, label]) => <label className="check-row" key={id}><input type="checkbox" checked={(form.topics || []).includes(id)} onChange={(event) => { setSaved(false); const current = form.topics || []; setForm({ ...form, topics: event.target.checked ? [...current, id] : current.filter((topic) => topic !== id) }); }} /><span>{label}</span></label>)}</div>
        </fieldset>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        {saved && <p className="inline-notice" role="status">Profile saved.</p>}
        <button className="button primary" disabled={busy}><Save size={17} /> {busy ? "Saving…" : "Save profile"}</button>
      </form>
    </div>
  );
}
