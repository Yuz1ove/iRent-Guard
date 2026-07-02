import type { DispatchPriority, NextBookingDecision, ReturnStatus } from "../types/assessment";

export const statusLabels: Record<ReturnStatus, string> = {
  rentable: "可立即出租",
  conditional: "有條件出租",
  hold: "暫停出租",
  offline: "強制下架"
};

export const statusTone: Record<ReturnStatus, string> = {
  rentable: "success",
  conditional: "warning",
  hold: "hold",
  offline: "danger"
};

export const priorityLabels: Record<DispatchPriority, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "最高"
};

export const decisionLabels: Record<NextBookingDecision, string> = {
  keep: "保留下一筆訂單",
  delay: "延後或等待處理完成",
  reassign: "改派下一筆訂單",
  cancel_or_manual_review: "取消或人工覆核"
};

export function minutesLabel(minutes: number) {
  if (minutes <= 0) return "已到場";
  if (minutes < 60) return `${minutes} 分鐘後`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小時後` : `${hours} 小時 ${rest} 分鐘後`;
}

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}
