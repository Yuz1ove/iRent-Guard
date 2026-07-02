import type { ReturnCase } from "./returnCase";

export type { NormalizedReturnCase, ReturnCase, ReturnHistory, ReturnTelematics, VehicleType } from "./returnCase";

export type ReturnStatus = "rentable" | "conditional" | "hold" | "offline";

export type NextBookingDecision =
  | "keep"
  | "delay"
  | "reassign"
  | "cancel_or_manual_review";

export type DispatchPriority = "low" | "medium" | "high" | "critical";

export type ActionType =
  | "keep_booking"
  | "clean"
  | "charge_refuel"
  | "retake_photo"
  | "create_work_order"
  | "reassign_next_booking"
  | "manual_review";

export type RecommendedActionType =
  | "cleaning"
  | "charge_or_refuel"
  | "repair"
  | "retake_photo"
  | "manual_review"
  | "reassign_booking"
  | "keep_booking";

export type RecommendedActionOwner =
  | "customer"
  | "ops"
  | "cleaning_team"
  | "maintenance_team"
  | "customer_service";

export type EvidenceType = "photo" | "voice" | "telematics" | "history" | "policy";

export type EvidenceSeverity = "info" | "warning" | "critical";

export type RiskCategory = "damage" | "cleanliness" | "energy" | "safety" | "dispute";

export interface EvidenceCard {
  id: string;
  type: EvidenceType;
  severity: EvidenceSeverity;
  title: string;
  description: string;
  source: string;
  confidence: number;
  relatedRiskCategory: RiskCategory;
}

export interface RecommendedAction {
  id: ActionType;
  actionId: string;
  actionType: RecommendedActionType;
  ownerRole: RecommendedActionOwner;
  priority: DispatchPriority;
  estimatedMinutes: number;
  blockingNextBooking: boolean;
  label: string;
  description: string;
}

export type Action = RecommendedAction;

export interface RiskBreakdown {
  damage: number;
  cleanliness: number;
  energy: number;
  safety: number;
  dispute: number;
}

export interface VoiceKeywordHits {
  damage: string[];
  cleanliness: string[];
  energy: string[];
  safety: string[];
  dispute: string[];
}

export interface ScoreResult {
  breakdown: RiskBreakdown;
  totalRiskScore: number;
  keywordHits: VoiceKeywordHits;
  confidence: number;
  reasons: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface AiAssessment {
  riskScore: number;
  status: ReturnStatus;
  riskBreakdown: RiskBreakdown;
  evidenceCards: EvidenceCard[];
  recommendedActions: Action[];
  nextBookingDecision: NextBookingDecision;
  dispatchPriority: DispatchPriority;
  customerSummary: string;
  internalSummary: string;
  validation: ValidationResult;
  confidence: number;
  aiConfidence: number;
  manualReviewRequired: boolean;
}

export interface CaseAssessment {
  returnCase: ReturnCase;
  assessment: AiAssessment;
}
