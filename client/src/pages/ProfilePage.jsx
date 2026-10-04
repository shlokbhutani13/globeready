import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { universityIdFor } from "../lib/news-data";

export default function ProfilePage({ profile, onSave }) {
  const [form, setForm] = useState(profile);
  const [error, setError] = useState("");
  useEffect(() => setForm(profile), [profile]);
  const field = (name) => ({ value: form[name] || "", onChange: (event) => setForm({ ...form, [name]: event.target.value }) });
  const submit = (event) => {
    event.preventDefault();
    setError("");
    const domain = (form.officialUniversityDomain || "").trim().toLowerCase();
    if (domain && !/^[a-z0-9.-]+\.edu$/.test(domain)) {
      setError("Enter the school's website domain, such as school.edu.");
      return;
    }
    onSave({
      ...form,
      universityId: universityIdFor(form.university),
      officialUniversityDomain: domain,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    });
  };
  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">Personalization</span><h1>Your student profile</h1><p>GlobeReady uses these details to prioritize relevant tasks and resources.</p></div></header>
      <form className="panel profile-form" onSubmit={submit}>
        <label>Full name<input {...field("fullName")} /></label><label>Home country<input {...field("homeCountry")} /></label>
        <label>University<input {...field("university")} /></label><label>Program<input {...field("program")} /></label>
        <label>Official university website domain (optional)<input {...field("officialUniversityDomain")} placeholder="school.edu" /></label>
        <p className="muted profile-note">A domain is reviewed by GlobeReady before its updates are shown as covered. Until then your school is marked as verification pending.</p>
        <label>Visa type<select {...field("visaType")}><option>F-1</option><option>J-1</option><option>Other</option></select></label>
        <label>Journey stage<select {...field("journeyStage")}><option>Preparing for arrival</option><option>Newly arrived</option><option>Current student</option><option>Preparing for graduation</option></select></label>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <button className="button primary"><Save size={17} /> Save profile</button>
      </form>
    </div>
  );
}
