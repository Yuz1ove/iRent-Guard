export type ExpectedVehicleView = "front" | "rear" | "front_or_rear" | "any";

export type PhotoInspectionStage = "pickup" | "return" | "customer_check" | "support_claim" | "other";

export type DetectedVehicleView = "front" | "rear" | "left_side" | "right_side" | "interior" | "wheel" | "unknown";

export type InspectionLevel = "none" | "minor" | "moderate" | "severe" | "unknown";
export type LlmProvider = "school-relay" | "openai" | "mock" | "fallback" | "unconfigured";

export type FormalInspectionIssue = {
  area: "front" | "rear" | "left" | "right" | "interior" | "wheel" | "unknown";
  issueType: "dirty" | "scratch" | "dent" | "crack" | "missing_photo" | "unclear_photo";
  severity: "low" | "medium" | "high";
  confidence: number;
  reason: string;
};

export interface AiBbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AiPhotoIssue {
  issue_id: string;
  photo_id: string;
  vehicle_area: string;
  issue_kind: string;
  severity: "minor" | "moderate" | "severe" | "unknown";
  confidence: number;
  visual_evidence: string;
  bbox: AiBbox | null;
}

export interface AiSinglePhotoInspection {
  photo_id: string;
  is_vehicle_visible: boolean;
  detected_view: DetectedVehicleView;
  view_confidence: number;
  expected_view: ExpectedVehicleView;
  expected_view_match: "yes" | "no" | "unknown" | "not_applicable";
  photo_quality: {
    score: number;
    is_clear_enough: boolean;
    problems: string[];
  };
  cleanliness: {
    level: InspectionLevel;
    confidence: number;
    summary: string;
  };
  damage: {
    level: InspectionLevel;
    confidence: number;
    summary: string;
  };
  issues: AiPhotoIssue[];
  retake_required: boolean;
  retake_reasons: string[];
  flags: string[];
  customer_message: string;
  support_message: string;
}

export interface FinalPhotoInspectionResult {
  inspectionStatus: "pass" | "needs_review" | "fail";
  detectedIssues: FormalInspectionIssue[];
  missingAngles: Array<FormalInspectionIssue["area"]>;
  customerMessage: string;
  staffSummary: string;
  riskScore: number;
  overall_status: "pass" | "needs_retake" | "manual_review" | "failed";
  summary: string;
  needs_manual_review: boolean;
  manual_review_reasons: string[];
  photos: AiSinglePhotoInspection[];
  final_decision: {
    status: "pass" | "needs_retake" | "manual_review" | "failed";
    customer_message: string;
    support_message: string;
  };
  ai_meta: {
    source: LlmProvider;
    responseId: string | null;
    model: string;
    provider?: LlmProvider;
    fallbackUsed?: boolean;
    generatedAt: string;
    usage?: unknown;
  };
}

export interface SupportInspectionPhoto {
  id: string;
  caseId: string | null;
  rentalId: string | null;
  imageUrl: string | null;
  stage: PhotoInspectionStage;
  expectedView: ExpectedVehicleView;
  uploadedBy: string;
  createdAt: string;
  ai: null | {
    status: "pass" | "needs_retake" | "manual_review" | "failed" | "pending";
    detectedView: DetectedVehicleView;
    viewConfidence: number;
    cleanlinessLevel: InspectionLevel;
    damageLevel: InspectionLevel;
    retakeRequired: boolean;
    summary: string;
    issues: AiPhotoIssue[];
    rawResult: unknown;
  };
}
