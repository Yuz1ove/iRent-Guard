import type { DispatchPriority, ReturnStatus } from "../types/assessment";
import { priorityLabels, statusLabels, statusTone } from "../lib/formatters";

export function StatusBadge({ status }: { status: ReturnStatus }) {
  return <span className={`badge ${statusTone[status]}`}>{statusLabels[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: DispatchPriority }) {
  return <span className={`badge priority-${priority}`}>優先序 {priorityLabels[priority]}</span>;
}
