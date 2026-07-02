import type {
  Action,
  ActionType,
  DispatchPriority,
  EvidenceCard,
  NextBookingDecision,
  RecommendedActionOwner,
  RecommendedActionType,
  ReturnStatus,
  RiskBreakdown,
  ScoreResult
} from "../../types/assessment";
import { decideNextBookingPolicy } from "./nextBookingPolicy";

const priorityOrder: DispatchPriority[] = ["low", "medium", "high", "critical"];

export function decideVehicleStatus(scoreResult: ScoreResult, evidenceCards: EvidenceCard[]): ReturnStatus {
  if (evidenceCards.some((card) => card.id === "dtc" || card.id === "broken-light")) return "offline";
  if (evidenceCards.some((card) => card.id === "tire-pressure")) return "hold";
  if (scoreResult.totalRiskScore >= 70) return "offline";
  if (scoreResult.totalRiskScore >= 50) return "hold";
  if (scoreResult.totalRiskScore >= 30) return "conditional";
  return "rentable";
}

export function decideDispatchPriority(
  status: ReturnStatus,
  scoreResult: ScoreResult,
  nextBookingMinutes: number
): DispatchPriority {
  let priority: DispatchPriority = "low";
  if (scoreResult.totalRiskScore >= 70 || status === "offline") priority = "critical";
  else if (scoreResult.totalRiskScore >= 50 || status === "hold") priority = "high";
  else if (scoreResult.totalRiskScore >= 30 || status === "conditional") priority = "medium";

  if (nextBookingMinutes < 60 && status !== "rentable") {
    priority = priorityOrder[Math.min(priorityOrder.indexOf(priority) + 1, priorityOrder.length - 1)];
  }
  return priority;
}

export function planActions(
  status: ReturnStatus,
  scoreResult: ScoreResult,
  nextBookingMinutes: number,
  evidenceCards: EvidenceCard[]
): Action[] {
  const decision = decideNextBookingPolicy(status, scoreResult.breakdown, nextBookingMinutes);
  const actions: Action[] = [];
  const priority = decideDispatchPriority(status, scoreResult, nextBookingMinutes);

  if (status === "rentable") {
    actions.push(makeAction("keep_booking", "keep_booking", "ops", priority, 3, false, "保留下一筆訂單", "寫入車況履歷並維持車輛可出租狀態。"));
  }
  if (scoreResult.breakdown.cleanliness > 0) {
    actions.push(makeAction("clean", "cleaning", "cleaning_team", priority, 25, nextBookingMinutes < 45, "清潔後再出租", "建立清潔派工並要求完成後複拍。"));
  }
  if (scoreResult.breakdown.energy > 0) {
    actions.push(makeAction("charge_refuel", "charge_or_refuel", "ops", priority, 35, nextBookingMinutes < 60, "補電/加油", "派工至最近補能點，完成後更新可出租狀態。"));
  }
  if (scoreResult.breakdown.damage >= 18 || evidenceCards.some((card) => card.id === "repeat-area")) {
    actions.push(makeAction("retake_photo", "retake_photo", "customer", priority, 8, false, "要求複拍車況", "補拍疑似車損角度，降低責任判斷爭議。"));
  }
  if (status === "hold" || status === "offline") {
    actions.push(makeAction("create_work_order", "repair", "maintenance_team", priority, 60, true, "建立維修工單", "暫停出租並安排維修或現場確認。"));
  }
  if (decision === "reassign") {
    actions.push(makeAction("reassign_next_booking", "reassign_booking", "ops", priority, 10, true, "改派下一筆訂單", "避免下一位租客到場後才發現車輛不可用。"));
  }
  if (requiresManualReview(scoreResult, evidenceCards)) {
    actions.push(makeAction("manual_review", "manual_review", "customer_service", priority, 15, decision === "reassign", "轉人工覆核", "保留 evidence trail，客服以中立口吻處理。"));
  }
  return uniqueActions(actions);
}

export function decideNextBooking(
  status: ReturnStatus,
  breakdown: RiskBreakdown,
  nextBookingMinutes: number
): NextBookingDecision {
  return decideNextBookingPolicy(status, breakdown, nextBookingMinutes);
}

export function requiresManualReview(scoreResult: ScoreResult, evidenceCards: EvidenceCard[]) {
  return (
    scoreResult.breakdown.dispute >= 8 ||
    scoreResult.confidence < 0.7 ||
    evidenceCards.some((card) => ["voice-photo-mismatch", "repeat-area", "unresolved-work-orders"].includes(card.id)) ||
    scoreResult.breakdown.damage >= 20
  );
}

function uniqueActions(actions: Action[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.id)) return false;
    seen.add(action.id);
    return true;
  });
}

function makeAction(
  id: ActionType,
  actionType: RecommendedActionType,
  ownerRole: RecommendedActionOwner,
  priority: Action["priority"],
  estimatedMinutes: number,
  blockingNextBooking: boolean,
  label: string,
  description: string
): Action {
  return {
    id,
    actionId: `act-${id}`,
    actionType,
    ownerRole,
    priority,
    estimatedMinutes,
    blockingNextBooking,
    label,
    description
  };
}
