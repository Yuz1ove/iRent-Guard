import type { DispatchPriority, RiskCategory } from "./assessment";

export type WorkOrderType = "cleaning" | "charging" | "refuel" | "repair" | "inspection" | "manual_review";

export interface WorkOrderDraft {
  id: string;
  vehicleId: string;
  type: WorkOrderType;
  priority: DispatchPriority;
  reason: string;
  relatedRiskCategory: RiskCategory;
}
