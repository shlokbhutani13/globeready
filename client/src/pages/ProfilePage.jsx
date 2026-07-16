import React, { useState } from "react";
import { Save } from "lucide-react";

export default function ProfilePage({ profile, onSave }) {
  const [form, setForm] = useState(profile);
  const field = (name) => ({ value: form[name] || "", onChange: (event) => setForm({ ...form, [name]: event.target.value }) });
  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">Personalization</span><h1>Your student profile</h1><p>GlobeReady uses these details to prioritize relevant tasks and resources.</p></div></header>
      <form className="panel profile-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <label>Full name<input {...field("fullName")} /></label><label>Home country<input {...field("homeCountry")} /></label>
        <label>University<input {...field("university")} /></label><label>Program<input {...field("program")} /></label>
        <label>Visa type<select {...field("visaType")}><option>F-1</option><option>J-1</option><option>Other</option></select></label>
        <label>Journey stage<select {...field("journeyStage")}><option>Preparing for arrival</option><option>Newly arrived</option><option>Current student</option><option>Preparing for graduation</option></select></label>
        <button className="button primary"><Save size={17} /> Save profile</button>
      </form>
    </div>
  );
}
