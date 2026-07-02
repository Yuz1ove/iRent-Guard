import type { AiAssessment, NormalizedReturnCase, ScoreResult } from "../../types/assessment";
import { decisionLabels, minutesLabel, statusLabels } from "../formatters";

export function generateCustomerSummary(input: NormalizedReturnCase, assessment: Pick<AiAssessment, "status" | "nextBookingDecision" | "evidenceCards">) {
  const mainEvidence = assessment.evidenceCards
    .slice(0, 2)
    .map((item) => item.title)
    .join("、");
  const historyNote = input.history.repeatedDamageArea ? `另因 ${input.history.repeatedDamageArea} 有歷史紀錄，需比對過往資料。` : "";
  return `您好，關於訂單 ${input.orderId} 的還車檢核，系統已收到您提供的資料並完成 AI 輔助初判。目前車輛狀態為「${statusLabels[assessment.status]}」，主要依據包含${mainEvidence || "照片、語音、車聯網與歷史紀錄"}。${historyNote}此結果不會直接作為責任歸屬；若涉及賠償、爭議或證據不足，將由客服人工覆核後再與您聯繫。下一筆訂單處理建議為「${decisionLabels[assessment.nextBookingDecision]}」。`;
}

export function generateInternalSummary(
  input: NormalizedReturnCase,
  scoreResult: ScoreResult,
  assessment: Pick<AiAssessment, "status" | "nextBookingDecision" | "dispatchPriority">
) {
  const reasons = scoreResult.reasons.slice(0, 3).join("、") || "未觸發主要風險";
  return `${input.vehicleId} 於 ${input.location} 完成還車檢測，風險 ${scoreResult.totalRiskScore}/100，狀態 ${statusLabels[assessment.status]}。主要原因：${reasons}。下一筆訂單 ${minutesLabel(input.nextBookingMinutes)}，系統建議 ${decisionLabels[assessment.nextBookingDecision]}，派工優先序 ${assessment.dispatchPriority.toUpperCase()}。`;
}
