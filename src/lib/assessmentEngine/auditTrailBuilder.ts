import type { AiAssessment } from "../../types/assessment";
import type { AuditTrailEvent } from "../../types/auditTrail";
import type { ClientReturnSubmission } from "../../types/client";

export function buildAuditTrail(submission: ClientReturnSubmission, assessment: AiAssessment): AuditTrailEvent[] {
  const baseTime = submission.submittedAt || new Date("2026-06-29T10:12:00+08:00").toISOString();
  return [
    {
      id: `${submission.submissionId}-customer-submit`,
      time: baseTime,
      actor: "customer",
      eventType: "return_submission_created",
      description: "租客送出照片、語音/文字備註與車況確認。"
    },
    {
      id: `${submission.submissionId}-ai-precheck`,
      time: offsetIso(baseTime, 8),
      actor: "ai",
      eventType: "client_precheck_completed",
      description: "客戶端 AI 初步檢查完成，僅產生補拍與備註提醒。"
    },
    {
      id: `${submission.submissionId}-company-assessment`,
      time: offsetIso(baseTime, 18),
      actor: "ai",
      eventType: "company_assessment_completed",
      description: `公司端完成風險評估，狀態為 ${assessment.status}，建議 ${assessment.nextBookingDecision}。`
    },
    {
      id: `${submission.submissionId}-ops-queue`,
      time: offsetIso(baseTime, 28),
      actor: "system",
      eventType: "ops_queue_updated",
      description: `已寫入營運佇列，派工優先序 ${assessment.dispatchPriority}。`
    }
  ];
}

function offsetIso(value: string, seconds: number) {
  const time = new Date(value).getTime();
  return new Date(time + seconds * 1000).toISOString();
}
