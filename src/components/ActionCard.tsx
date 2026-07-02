import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { Action } from "../types/assessment";

export function ActionCard({ action }: { action: Action }) {
  return (
    <article className="action-card">
      <CheckCircle2 size={18} />
      <div>
        <strong>{action.label}</strong>
        <p>{action.description}</p>
      </div>
      <ArrowRight size={17} />
    </article>
  );
}
