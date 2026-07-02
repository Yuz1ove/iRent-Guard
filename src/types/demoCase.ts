import type { AiAssessment, EvidenceCard, RecommendedAction } from "./assessment";
import type { AiSinglePhotoInspection, ExpectedVehicleView, FinalPhotoInspectionResult, PhotoInspectionStage } from "./photoInspection";

export type DemoCaseStatus = "submitted" | "under_review" | "work_order_created" | "resolved";

export interface DemoCaseSubmission {
  vehicleId: string;
  plateNumber: string;
  vehicleModel?: string;
  returnLocation: string;
  returnTime?: string;
  orderId?: string;
  damageNote: string;
  quickOptions: string[];
  photoSlots: Array<{
    id: string;
    angle: string;
    label: string;
    status: string;
    imageUrl?: string | null;
    expectedView?: ExpectedVehicleView;
    stage?: PhotoInspectionStage;
    aiInspection?: AiSinglePhotoInspection | null;
    aiRawResult?: FinalPhotoInspectionResult | null;
  }>;
  customerVisibleSummary: string;
}

export interface DemoCase {
  caseId: string;
  assessmentId: string;
  createdAt: string;
  updatedAt: string;
  status: DemoCaseStatus;
  submission: DemoCaseSubmission;
  telematics: Record<string, unknown>;
  bookingContext: Record<string, unknown>;
  history: Record<string, unknown>;
  assessment: AiAssessment & {
    riskLevel: "low" | "medium" | "high";
    internalReasoning: string;
    customerSafeMessage: string;
  };
  evidenceCards: EvidenceCard[];
  actions: RecommendedAction[];
  auditTrail: Array<{
    id: string;
    time: string;
    actor: "customer" | "ai" | "ops" | "customer_service" | "system";
    eventType: string;
    description: string;
  }>;
}
