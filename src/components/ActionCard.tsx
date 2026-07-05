import { ArrowRight, CheckCircle2 } from "lucide-react";
import React from "react";
import type { Action } from "../types/assessment";

export function ActionCard({ action }: { action: Action }) {
  const [queued, setQueued] = React.useState(false);

  return (
    <button
      aria-pressed={queued}
      className={`action-card interactive-card ${queued ? "completed" : ""}`}
      onClick={() => setQueued((value) => !value)}
      type="button"
    >
      <CheckCircle2 size={18} />
      <div>
        <strong>{action.label}</strong>
        <p>{action.description}</p>
        <small>{queued ? "已加入派工草稿" : "點擊建立草稿狀態"}</small>
      </div>
      <ArrowRight size={17} />
    </button>
  );
}
