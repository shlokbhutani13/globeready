import React from "react";
import { ShieldCheck } from "lucide-react";

export default function Disclaimer({ compact = false }) {
  return (
    <div className={`disclaimer ${compact ? "compact" : ""}`}>
      <ShieldCheck size={17} />
      <p>
        GlobeReady provides general information. Confirm immigration, legal, health,
        financial, and tax decisions with official sources or a qualified professional.
      </p>
    </div>
  );
}
