import type { AiAssessment } from "./assessment";
import type { AuditTrailEvent } from "./auditTrail";
import type { ClientReturnSubmission } from "./client";
import type { ReturnHistory, ReturnTelematics } from "./returnCase";

export interface BookingContext {
  nextBookingId: string;
  nextBookingMinutes: number;
  nextCustomerTier: "standard" | "member" | "business";
  alternativeVehicleCount: number;
}

export interface WorkOrderHistory {
  id: string;
  type: "cleaning" | "charge_or_refuel" | "repair" | "retake_photo" | "manual_review";
  summary: string;
  status: "completed" | "open";
  closedAt?: string;
}

export interface CompanyReturnCase {
  assessmentId: string;
  scenarioName: string;
  submission: ClientReturnSubmission;
  telematics: ReturnTelematics;
  bookingContext: BookingContext;
  history: ReturnHistory;
  workOrderHistory: WorkOrderHistory[];
  assessment: AiAssessment;
  auditTrail: AuditTrailEvent[];
}
