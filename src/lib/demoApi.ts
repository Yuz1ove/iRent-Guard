import type { CompanyReturnCase } from "../types/company";
import type { ClientReturnSubmission } from "../types/client";
import type { DemoCase, DemoCaseSubmission } from "../types/demoCase";
import type { ExpectedVehicleView, FinalPhotoInspectionResult, LlmProvider, PhotoInspectionStage, SupportInspectionPhoto } from "../types/photoInspection";
import type { ReturnHistory, ReturnTelematics } from "../types/returnCase";
import type { RiskBreakdown, RiskBreakdownItem, RiskFormulaComponent } from "../types/assessment";

export const CUSTOMER_PHOTO_INSPECTION_ERROR_MESSAGE = "AI 檢核暫時失敗，請重新上傳或稍後再試";

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

export interface PublicLlmHealthSnapshot {
  available: boolean;
  provider: "school-relay" | "openai" | "unconfigured" | string;
  baseURLConfigured: boolean;
  model: string | null;
  configurationState?: "ready" | "partial" | "missing";
  status: "ok" | "unconfigured" | "unauthorized" | "error" | string;
}

type CustomerPhotoInspectionInput = {
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
};

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

export async function fetchLlmHealth() {
  const response = await fetch("/api/llm/health?mode=config");
  if (!response.ok) throw new Error("Failed to read LLM health");
  return (await response.json()) as PublicLlmHealthSnapshot;
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

export async function inspectCustomerPhotos(input: CustomerPhotoInspectionInput) {
  const normalizedInput = await normalizeCustomerPhotoInspectionInput(input);
  const response = await fetch("/api/customer/photo-inspection", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(normalizedInput)
  });
  const payload = (await response.json()) as { ok: boolean; data?: FinalPhotoInspectionResult; error?: string };
  if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error ?? CUSTOMER_PHOTO_INSPECTION_ERROR_MESSAGE);
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

async function normalizeCustomerPhotoInspectionInput(input: CustomerPhotoInspectionInput): Promise<CustomerPhotoInspectionInput> {
  return {
    ...input,
    photos: await Promise.all(
      input.photos.map(async (photo) => ({
        ...photo,
        imageUrl: await normalizeImageReferenceForUpload(photo.imageUrl)
      }))
    )
  };
}

async function normalizeImageReferenceForUpload(imageUrl: string) {
  const trimmed = imageUrl.trim();

  if (/^data:image\/(?:jpeg|jpg|png);base64,/i.test(trimmed)) {
    return normalizeImageDataUrl(trimmed);
  }

  if (/^blob:/i.test(trimmed)) {
    const response = await fetch(trimmed);
    if (!response.ok) throw new Error(CUSTOMER_PHOTO_INSPECTION_ERROR_MESSAGE);
    const blob = await response.blob();
    if (!/^image\/(?:jpeg|jpg|png)$/i.test(blob.type)) {
      throw new Error(CUSTOMER_PHOTO_INSPECTION_ERROR_MESSAGE);
    }
    return blobToDataUrl(blob);
  }

  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  if (isLikelyBase64Image(trimmed)) {
    const base64 = trimmed.replace(/\s/g, "");
    const mime = detectImageMimeFromBase64(base64) ?? "image/jpeg";
    return `data:${mime};base64,${base64}`;
  }

  throw new Error(CUSTOMER_PHOTO_INSPECTION_ERROR_MESSAGE);
}

function normalizeImageDataUrl(value: string) {
  const match = value.match(/^data:image\/(jpeg|jpg|png);base64,([\s\S]+)$/i);
  if (!match) throw new Error(CUSTOMER_PHOTO_INSPECTION_ERROR_MESSAGE);
  const subtype = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, "");
  if (!isLikelyBase64Image(base64)) throw new Error(CUSTOMER_PHOTO_INSPECTION_ERROR_MESSAGE);
  return `data:image/${subtype};base64,${base64}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(CUSTOMER_PHOTO_INSPECTION_ERROR_MESSAGE));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(normalizeImageDataUrl(result));
    };
    reader.readAsDataURL(blob);
  });
}

function isLikelyBase64Image(value: string) {
  const compact = value.replace(/\s/g, "");
  return compact.length >= 32 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
}

function detectImageMimeFromBase64(base64: string) {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  return null;
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
    assessment: normalizeDemoAssessment(demoCase),
    auditTrail: demoCase.auditTrail
  };
}

function normalizeDemoAssessment(demoCase: DemoCase) {
  const assessment = demoCase.assessment;
  return {
    ...assessment,
    riskBreakdown: normalizeDemoRiskBreakdown(assessment.riskBreakdown, assessment.riskScore),
    evidenceCards: demoCase.evidenceCards,
    recommendedActions: demoCase.actions,
    validation: assessment.validation ?? { valid: true, errors: [] },
    confidence: assessment.confidence ?? assessment.aiConfidence ?? 0.85,
    aiConfidence: assessment.aiConfidence ?? assessment.confidence ?? 0.85,
    manualReviewRequired: Boolean(assessment.manualReviewRequired)
  };
}

function normalizeDemoRiskBreakdown(breakdown: RiskBreakdown, displayedRiskScore: number): RiskBreakdown {
  if (breakdown.formula && breakdown.lineItems?.length) return breakdown;

  const lineItems = buildLegacyRiskLineItems(breakdown);
  const categoryTotal = lineItems.reduce((total, item) => total + Math.max(0, item.points), 0);
  const displayedScore = Math.max(0, Number(displayedRiskScore) || 0);
  if (displayedScore > categoryTotal) {
    lineItems.push(makeLegacyRiskItem(
      "legacy-demo-weighting",
      "既有 Demo 規則加權",
      "舊版 shared demo case 已有 risk score，轉換時保留原分數並補上來源差額。",
      displayedScore - categoryTotal,
      "noteRisk"
    ));
  }

  const formula = buildFormulaFromLineItems(lineItems);
  return {
    ...breakdown,
    lineItems,
    formula,
    scoreDisclaimer: breakdown.scoreDisclaimer ?? "Demo 模擬分數，非正式判責結果"
  };
}

function buildLegacyRiskLineItems(breakdown: RiskBreakdown): RiskBreakdownItem[] {
  return [
    breakdown.damage > 0 ? makeLegacyRiskItem("legacy-damage", "照片 / 車況損傷標記", "由既有外觀/車損分類回推的 Demo 模擬來源。", breakdown.damage, "photoRisk", "damage") : null,
    breakdown.cleanliness > 0 ? makeLegacyRiskItem("legacy-cleanliness", "髒污標記", "由既有車內清潔分類回推的 Demo 模擬來源。", breakdown.cleanliness, "photoRisk", "cleanliness") : null,
    breakdown.energy > 0 ? makeLegacyRiskItem("legacy-energy", "能源 / 續航訊號", "由既有能源狀態分類回推的 Demo 模擬來源。", breakdown.energy, "noteRisk", "energy") : null,
    breakdown.safety > 0 ? makeLegacyRiskItem("legacy-safety", "安全 / 車聯網警示", "由既有安全/車聯網分類回推的 Demo 模擬來源。", breakdown.safety, "noteRisk", "safety") : null,
    breakdown.dispute > 0 ? makeLegacyRiskItem("legacy-dispute", "爭議 / 歷史訊號", "由既有爭議風險分類回推的 Demo 模擬來源。", breakdown.dispute, "noteRisk", "dispute") : null
  ].filter((item): item is RiskBreakdownItem => Boolean(item));
}

function buildFormulaFromLineItems(lineItems: RiskBreakdownItem[]) {
  const sumPositive = (component: RiskFormulaComponent) =>
    lineItems
      .filter((item) => item.component === component)
      .reduce((total, item) => total + Math.max(0, item.points), 0);
  const baseScore = sumPositive("baseScore");
  const photoRisk = sumPositive("photoRisk");
  const noteRisk = sumPositive("noteRisk");
  const orderPressureRisk = sumPositive("orderPressureRisk");
  const mitigationScore = lineItems
    .filter((item) => item.component === "mitigationScore")
    .reduce((total, item) => total + Math.abs(Math.min(0, item.points)), 0);
  const rawScore = baseScore + photoRisk + noteRisk + orderPressureRisk - mitigationScore;
  const finalRisk = Math.max(0, Math.min(100, rawScore));
  return {
    baseScore,
    photoRisk,
    noteRisk,
    orderPressureRisk,
    mitigationScore,
    rawScore,
    finalRisk,
    clamped: rawScore !== finalRisk
  };
}

function makeLegacyRiskItem(
  id: string,
  label: string,
  description: string,
  points: number,
  component: RiskFormulaComponent,
  category?: RiskBreakdownItem["category"]
): RiskBreakdownItem {
  return { id, label, description, points, component, category };
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
