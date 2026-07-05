import React from "react";
import { Camera, ChevronDown, Database, FileClock, MessageSquareText, ShieldAlert } from "lucide-react";
import type { EvidenceCard as EvidenceCardType } from "../types/assessment";

const typeIcons = {
  photo: Camera,
  voice: MessageSquareText,
  telematics: Database,
  history: FileClock,
  policy: ShieldAlert
};

export function EvidenceCard({ evidence }: { evidence: EvidenceCardType }) {
  const [expanded, setExpanded] = React.useState(false);
  const Icon = typeIcons[evidence.type];
  return (
    <article className={`evidence-card ${evidence.severity} ${expanded ? "expanded" : ""}`}>
      <div>
        <button
          aria-expanded={expanded}
          className="evidence-card-toggle"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          <Icon size={18} />
          <strong>{evidence.title}</strong>
          <ChevronDown aria-hidden="true" className="evidence-chevron" size={17} />
        </button>
        <p>{evidence.description}</p>
        <small>
          {evidence.source}｜信心 {Math.round(evidence.confidence * 100)}%
        </small>
        {expanded ? (
          <dl className="evidence-detail-list">
            <div>
              <dt>證據來源</dt>
              <dd>{evidence.source}</dd>
            </div>
            <div>
              <dt>可信度</dt>
              <dd>{Math.round(evidence.confidence * 100)}%</dd>
            </div>
            <div>
              <dt>狀態</dt>
              <dd>{severityLabel(evidence.severity)}</dd>
            </div>
          </dl>
        ) : null}
      </div>
    </article>
  );
}

function severityLabel(severity: EvidenceCardType["severity"]) {
  if (severity === "critical") return "需要優先處理";
  if (severity === "warning") return "需留意";
  return "資訊";
}
