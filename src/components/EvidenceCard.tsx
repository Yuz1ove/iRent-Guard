import { Camera, Database, FileClock, MessageSquareText, ShieldAlert } from "lucide-react";
import type { EvidenceCard as EvidenceCardType } from "../types/assessment";

const typeIcons = {
  photo: Camera,
  voice: MessageSquareText,
  telematics: Database,
  history: FileClock,
  policy: ShieldAlert
};

export function EvidenceCard({ evidence }: { evidence: EvidenceCardType }) {
  const Icon = typeIcons[evidence.type];
  return (
    <article className={`evidence-card ${evidence.severity}`}>
      <Icon size={18} />
      <div>
        <strong>{evidence.title}</strong>
        <p>{evidence.description}</p>
        <small>
          {evidence.source}｜信心 {Math.round(evidence.confidence * 100)}%
        </small>
      </div>
    </article>
  );
}
