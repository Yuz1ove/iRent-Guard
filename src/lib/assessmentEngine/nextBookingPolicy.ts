import type { NextBookingDecision, ReturnStatus, RiskBreakdown } from "../../types/assessment";

export function decideNextBookingPolicy(
  status: ReturnStatus,
  breakdown: RiskBreakdown,
  nextBookingMinutes: number
): NextBookingDecision {
  if (nextBookingMinutes < 30 && breakdown.safety >= 18) return "reassign";
  if (nextBookingMinutes < 60 && status !== "rentable") return "reassign";
  if (nextBookingMinutes >= 60 && nextBookingMinutes <= 120 && canFinishBeforeNextBooking(breakdown)) return "delay";
  if (status === "offline") return "reassign";
  if (status === "hold") return nextBookingMinutes > 120 ? "delay" : "reassign";
  if (status === "conditional") return "delay";
  return "keep";
}

function canFinishBeforeNextBooking(breakdown: RiskBreakdown) {
  return breakdown.safety < 12 && breakdown.damage < 20 && (breakdown.cleanliness > 0 || breakdown.energy > 0);
}
