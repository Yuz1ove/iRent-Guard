import type { CompanyReturnCase } from "../types/company";
import type { ClientReturnSubmission } from "../types/client";
import type { DemoCase, DemoCaseSubmission } from "../types/demoCase";
import type { ExpectedVehicleView, FinalPhotoInspectionResult, LlmProvider, PhotoInspectionStage, SupportInspectionPhoto } from "../types/photoInspection";
import type { ReturnHistory, ReturnTelematics } from "../types/returnCase";

export interface PhotoAiSmokeTestResult {
  overall_status: "pass" | "needs_retake" | "manual_review" | "failed";
  is_vehicle_visible: boolean;
  detected_view: string;
  expected_view: ExpectedVehicleView;
  expected_view_match: "yes" | "no" | "unknown" | "not_applicable";
  retake_required: boolean;
  confidence: number;
  quality_score: number;
  cleanliness_level: string;
  damage_level: string;
  flags: string[];
  evidence: string;
  customer_message: string;
  support_message: string;
  ai_meta: {
    source: LlmProvider;
    provider?: LlmProvider;
    responseId: string | null;
    model: string;
    fallbackUsed?: boolean;
    generatedAt: string;
    usage?: unknown;
  };
}

export async function postDemoSubmission(submission: ClientReturnSubmission) {
  const response = await fetch("/api/demo/submissions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ submission: clientSubmissionToDemoSubmission(submission) })
  });
  if (!response.ok) throw new Error("Failed to submit demo case");
  return (await response.json()) as DemoCase;
}

export async function fetchLatestDemoCase() {
  const response = await fetch("/api/demo/submissions/latest");
  if (!response.ok) return null;
  const payload = (await response.json()) as { case: DemoCase | null };
  return payload.case;
}

export async function patchDemoCase(caseId: string, patch: Partial<DemoCase>) {
  const response = await fetch(`/api/demo/submissions/${encodeURIComponent(caseId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch)
  });
  if (!response.ok) throw new Error("Failed to update demo case");
  return (await response.json()) as DemoCase;
}

export async function fetchAiPrecheck(submission: ClientReturnSubmission) {
  const response = await fetch("/api/ai/return-precheck", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ submission: clientSubmissionToDemoSubmission(submission) })
  });
  if (!response.ok) return null;
  return (await response.json()) as { hints: string[]; retakePhotoAngles: string[]; fallbackUsed: boolean };
}

export async function inspectCustomerPhotos(input: {
  caseId?: string | null;
  rentalId?: string | null;
  userId?: string | null;
  expectedVehicle?: {
    plate?: string | null;
    makeModel?: string | null;
    color?: string | null;
  } | null;
  photos: Array<{
    id: string;
    imageUrl: string;
    expectedView: ExpectedVehicleView;
    stage: PhotoInspectionStage;
    capturedAt?: string | null;
    note?: string | null;
  }>;
  requireCompleteInspection?: boolean;
  requiredAngles?: Array<"front" | "rear" | "left" | "right" | "interior" | "wheel">;
}) {
  const response = await fetch("/api/customer/photo-inspection", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = (await response.json()) as { ok: boolean; data?: FinalPhotoInspectionResult; error?: string };
  if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error ?? "AI 照片檢核失敗");
  return payload.data;
}

export async function runPhotoAiSmokeTest(input: { file: File; expectedView: ExpectedVehicleView }) {
  const form = new FormData();
  form.append("file", input.file);
  form.append("expectedView", input.expectedView);

  const response = await fetch("/api/debug/photo-ai-smoke-test", {
    method: "POST",
    body: form
  });
  const payload = (await response.json()) as { ok: boolean; data?: PhotoAiSmokeTestResult; error?: string };
  if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error ?? "AI smoke test 失敗");
  return payload.data;
}

export async function fetchSupportCasePhotos(caseId: string) {
  const response = await fetch(`/api/support/cases/${encodeURIComponent(caseId)}/photos`);
  const payload = (await response.json()) as { ok: boolean; data?: SupportInspectionPhoto[]; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? "讀取照片失敗");
  return payload.data ?? [];
}

export function clientSubmissionToDemoSubmission(submission: ClientReturnSubmission): DemoCaseSubmission {
  return {
    vehicleId: submission.vehicleId,
    plateNumber: submission.vehicleId,
    vehicleModel: submission.vehicleModel,
    returnLocation: submission.returnStation,
    returnTime: submission.returnTime,
    orderId: submission.orderId,
    damageNote: [submission.voiceNote, submission.textNote].filter(Boolean).join("，"),
    quickOptions: submission.quickNotes,
    photoSlots: submission.photos.map((photo) => ({
      id: photo.id,
      angle: photo.angle,
      label: photo.label,
      status: photo.status,
      imageUrl: photo.imageUrl ?? photo.previewUrl ?? null,
      expectedView: expectedViewForAngle(photo.angle),
      stage: "return",
      aiInspection: photo.aiInspection ?? null,
      aiRawResult: photo.aiInspectionRaw ?? null
    })),
    customerVisibleSummary: "還車紀錄已送出，若需要補充照片或說明，系統會以中立方式提醒。"
  };
}

export function demoCaseToCompanyReturnCase(demoCase: DemoCase): CompanyReturnCase {
  const telematics = normalizeTelematics(demoCase.telematics);
  const history = normalizeHistory(demoCase.history);
  return {
    assessmentId: demoCase.assessmentId,
    scenarioName: "手機端最新送出",
    submission: {
      submissionId: demoCase.caseId,
      orderId: demoCase.submission.orderId ?? demoCase.caseId,
      vehicleId: demoCase.submission.vehicleId,
      vehicleType: "car",
      vehicleModel: demoCase.submission.vehicleModel ?? "Toyota Altis",
      returnStation: demoCase.submission.returnLocation,
      returnTime: demoCase.submission.returnTime ?? demoCase.createdAt,
      submittedAt: demoCase.createdAt,
      photos: demoCase.submission.photoSlots.map((slot) => ({
        id: slot.id,
        angle: slot.angle as never,
        label: slot.label,
        status: slot.status as never,
        previewUrl: slot.imageUrl ?? undefined,
        imageUrl: slot.imageUrl ?? undefined,
        aiInspection: slot.aiInspection ?? null,
        aiInspectionRaw: slot.aiRawResult ?? null
      })),
      voiceNote: demoCase.submission.damageNote,
      textNote: "",
      quickNotes: demoCase.submission.quickOptions,
      clientAcknowledgement: true
    },
    telematics,
    bookingContext: {
      nextBookingId: String(demoCase.bookingContext.nextBookingId ?? "NB-DEMO"),
      nextBookingMinutes: Number(demoCase.bookingContext.nextBookingMinutes ?? 80),
      nextCustomerTier: "member",
      alternativeVehicleCount: Number(demoCase.bookingContext.alternativeVehicleCount ?? 1)
    },
    history,
    workOrderHistory: [],
    assessment: {
      ...demoCase.assessment,
      evidenceCards: demoCase.evidenceCards,
      recommendedActions: demoCase.actions,
      validation: demoCase.assessment.validation ?? { valid: true, errors: [] },
      confidence: demoCase.assessment.confidence ?? demoCase.assessment.aiConfidence ?? 0.85,
      aiConfidence: demoCase.assessment.aiConfidence ?? demoCase.assessment.confidence ?? 0.85,
      manualReviewRequired: Boolean(demoCase.assessment.manualReviewRequired)
    },
    auditTrail: demoCase.auditTrail
  };
}

function expectedViewForAngle(angle: string): ExpectedVehicleView {
  if (angle === "front") return "front";
  if (angle === "rear") return "rear";
  return "any";
}

function normalizeTelematics(input: Record<string, unknown>): ReturnTelematics {
  return {
    batteryPercent: Number(input.batteryPercent ?? 64),
    tirePressureLow: Boolean(input.tirePressureLow),
    dtcWarning: Boolean(input.dtcWarning),
    odometerDeltaKm: Number(input.odometerDeltaKm ?? 17),
    locationConfidence: Number(input.locationConfidence ?? 0.92)
  };
}

function normalizeHistory(input: Record<string, unknown>): ReturnHistory {
  return {
    recentComplaints: Number(input.recentComplaints ?? 0),
    unresolvedWorkOrders: Number(input.unresolvedWorkOrders ?? 0),
    repeatedDamageArea: typeof input.repeatedDamageArea === "string" ? input.repeatedDamageArea : undefined
  };
}
