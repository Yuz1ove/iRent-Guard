import { mockReturnCases } from "./mockReturnCases";
import { returnCaseToClientSubmission } from "./clientSubmissions";
import { enrichCompanyCase } from "../lib/assessmentEngine/enrichCompanyCase";
import type { CompanyReturnCase, WorkOrderHistory } from "../types/company";
import type { ReturnCase } from "../types/returnCase";

export const companyReturnCases: CompanyReturnCase[] = mockReturnCases.map((returnCase, index) =>
  enrichCompanyCase({
    assessmentId: `AST-20260629-${String(index + 1).padStart(4, "0")}`,
    scenarioName: returnCase.scenarioName,
    submission: returnCaseToClientSubmission(returnCase),
    telematics: returnCase.telematics,
    bookingContext: {
      nextBookingId: `NB-260629-${String(index + 31).padStart(3, "0")}`,
      nextBookingMinutes: returnCase.nextBookingMinutes,
      nextCustomerTier: index % 3 === 0 ? "business" : index % 2 === 0 ? "member" : "standard",
      alternativeVehicleCount: returnCase.location.includes("高鐵") ? 3 : index % 2 === 0 ? 2 : 1
    },
    history: returnCase.history,
    workOrderHistory: buildWorkOrderHistory(returnCase),
    photoFindings: returnCase.photoFindings
  })
);

export function getCompanyCaseByAssessmentId(id: string) {
  return companyReturnCases.find((item) => item.assessmentId === id) ?? companyReturnCases[0];
}

function buildWorkOrderHistory(returnCase: ReturnCase): WorkOrderHistory[] {
  const items: WorkOrderHistory[] = [];
  if (returnCase.history.unresolvedWorkOrders > 0) {
    items.push({
      id: `WO-HIS-${returnCase.vehicleId}`,
      type: "repair",
      summary: returnCase.history.repeatedDamageArea ? `${returnCase.history.repeatedDamageArea} 待比對歷史照片` : "未結現場確認工單",
      status: "open"
    });
  }
  if (returnCase.history.recentComplaints > 0) {
    items.push({
      id: `CS-HIS-${returnCase.vehicleId}`,
      type: "manual_review",
      summary: `近 30 天有 ${returnCase.history.recentComplaints} 筆客服紀錄`,
      status: "completed",
      closedAt: "2026-06-24T18:30:00+08:00"
    });
  }
  return items;
}
