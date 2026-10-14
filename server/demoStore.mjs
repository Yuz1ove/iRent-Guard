import { randomUUID } from "node:crypto";
import {
  assertDemoCaseTransition,
  CASE_WORKFLOW_VERSION,
  decideNextBookingForStatus,
  dispatchPriorityForStatus,
  nextBookingWindow,
  RISK_POLICY,
  riskLevelForScore,
  vehicleStatusForScore
} from "../shared/caseWorkflow.js";
import { createCaseStateStore, createInitialCaseState } from "./caseStateStore.mjs";

function initialState() {
  return createInitialCaseState();
}

const caseStateStore = createCaseStateStore();
const MANUAL_REVIEW_OUTCOMES = new Set(["confirmed_scratch", "not_damage", "dirty", "unclear_photo", "dispatch_required"]);

export async function listCases() {
  return (await caseStateStore.read()).state.cases;
}

export async function getLatestCase() {
  return (await caseStateStore.read()).state.cases[0] ?? null;
}

export async function getCase(caseId) {
  return (await caseStateStore.read()).state.cases.find((item) => caseMatches(item, caseId)) ?? null;
}

// Customer-service notes are independent evidence, not a manual-review outcome
// or a case-state transition. Retrying a contact request must not append twice.
export async function recordCustomerContact(caseId, input) {
  assertPatchShape(input, ["kind", "notes", "request_id"]);
  if (!["tracking", "contacted"].includes(input.kind)) {
    throw invalidCaseCommand("invalid_customer_contact", "Customer contact kind must be tracking or contacted.");
  }
  if (typeof input.notes !== "string" || input.notes.length > 2000) {
    throw invalidCaseCommand("invalid_customer_contact", "Customer contact notes must be a string of at most 2000 characters.");
  }
  if (typeof input.request_id !== "string" || !/^[A-Za-z0-9_.:-]{1,140}$/.test(input.request_id)) {
    throw invalidCaseCommand("invalid_customer_contact", "A valid customer contact request_id is required.");
  }
  const notes = input.notes.trim();
  return caseStateStore.mutate((state) => {
    const index = state.cases.findIndex((item) => caseMatches(item, caseId));
    if (index < 0) return null;
    const current = state.cases[index];
    const contacts = current.customerServiceNotes ?? [];
    const existing = contacts.find((note) => note.request_id === input.request_id);
    if (existing) {
      if (existing.kind !== input.kind || existing.notes !== notes) {
        const error = invalidCaseCommand("customer_contact_request_conflict", "The request_id was already used for different customer contact content.");
        error.statusCode = 409;
        throw error;
      }
      return current;
    }
    const now = new Date().toISOString();
    const contact = {
      id: `CONTACT-${randomUUID()}`,
      kind: input.kind,
      notes,
      request_id: input.request_id,
      createdAt: now,
      contacted: input.kind === "contacted"
    };
    state.cases[index] = {
      ...current,
      updatedAt: now,
      customerServiceNotes: [...contacts, contact],
      auditTrail: [...current.auditTrail, makeAudit(
        `${contact.id}-audit`, now, "customer_service",
        contact.contacted ? "customer_contacted" : "customer_tracking_created",
        contact.contacted ? "客服已記錄聯絡結果。" : "客服已建立後續追蹤紀錄。",
        { contactId: contact.id, request_id: contact.request_id, evidenceIds: [contact.id] }
      )]
    };
    return state.cases[index];
  });
}

export async function resetCases() {
  return caseStateStore.mutate((state) => {
    Object.assign(state, initialState());
    return { ok: true };
  });
}

export async function savePhotoInspectionRecord(input, result) {
  return caseStateStore.mutate((state) => {
    const now = new Date().toISOString();
    const records = input.photos.map((photo) => {
      const aiPhoto = result.photos.find((item) => item.photo_id === photo.id);

      return {
        id: photo.id,
        caseId: input.caseId ?? null,
        rentalId: input.rentalId ?? null,
        userId: input.userId ?? null,
        imageUrl: photo.imageUrl,
        stage: photo.stage,
        expectedView: photo.expectedView,
        uploadedBy: "customer",
        createdAt: photo.capturedAt ?? now,
        ai: aiPhoto
          ? {
              status: photoAiStatus(result, aiPhoto),
              detectedView: aiPhoto.detected_view,
              viewConfidence: aiPhoto.view_confidence,
              cleanlinessLevel: aiPhoto.cleanliness.level,
              damageLevel: aiPhoto.damage.level,
              retakeRequired: aiPhoto.retake_required,
              summary: aiPhoto.support_message,
              issues: aiPhoto.issues,
              rawResult: {
                ...result,
                photos: [aiPhoto]
              }
            }
          : null
      };
    });

    const nextIds = new Set(records.map((record) => `${record.caseId ?? ""}:${record.rentalId ?? ""}:${record.id}`));
    state.photoInspections = [
      ...records,
      ...state.photoInspections.filter((record) => !nextIds.has(`${record.caseId ?? ""}:${record.rentalId ?? ""}:${record.id}`))
    ];
    return records;
  });
}

export async function getSupportCasePhotos(caseId) {
  const state = (await caseStateStore.read()).state;
  const demoCase = state.cases.find((item) => caseMatches(item, caseId));

  if (demoCase) {
    return (demoCase.submission.photoSlots ?? [])
      .filter((slot) => slot.imageUrl || slot.aiInspection)
      .map((slot) => supportPhotoFromSlot(demoCase, slot));
  }

  return state.photoInspections
    .filter((record) => record.caseId === caseId || record.rentalId === caseId)
    .map((record) => ({
      id: record.id,
      caseId: record.caseId,
      rentalId: record.rentalId,
      imageUrl: record.imageUrl,
      stage: record.stage,
      expectedView: record.expectedView,
      uploadedBy: record.uploadedBy,
      createdAt: record.createdAt,
      ai: record.ai
    }));
}

export async function createCase(payload, options = {}) {
  return caseStateStore.mutate((state) => {
    const idempotencyKey = normalizeIdempotencyKey(options.idempotencyKey ?? payload?.submission?.clientSubmissionId ?? payload?.clientSubmissionId);
    if (idempotencyKey) {
      const existingCaseId = state.idempotencyKeys[idempotencyKey];
      const existingCase = existingCaseId ? state.cases.find((item) => item.caseId === existingCaseId) : null;
      if (existingCase) return existingCase;
    }
    const sequence = state.sequence + 1;
    const now = new Date().toISOString();
    const caseId = `CASE-${randomUUID()}`;
    const assessmentId = `AST-${randomUUID()}`;
    const submission = normalizeSubmission(payload?.submission ?? payload);
    const assessment = buildAssessment(submission);
    const actions = buildActions(assessment, submission);
    const evidenceCards = buildEvidenceCards(submission, assessment);
    const aiMetadata = auditAiMetadata(submission);
    const demoCase = {
    caseId,
    assessmentId,
    createdAt: now,
    updatedAt: now,
    status: "submitted",
    submission,
    telematics: buildTelematics(submission),
    bookingContext: {
      nextBookingId: `NB-20260629-${String(sequence + 30).padStart(4, "0")}`,
      nextBookingMinutes: assessment.projectedNextBookingMinutes,
      nextCustomerTier: "member",
      alternativeVehicleCount: assessment.nextBookingDecision === "reassign" ? 2 : 1
    },
    history: buildHistory(submission),
    assessment,
    evidenceCards,
    actions,
    auditTrail: [
      makeAudit(`${caseId}-submitted`, now, "customer", "return_submission_created", "租客於客戶端送出還車照片與備註。", {
        previousStatus: "draft",
        nextStatus: "submitted",
        evidenceIds: evidenceCards.map((card) => card.id)
      }),
      makeAudit(`${caseId}-precheck`, now, "ai", "client_precheck_completed", "AI pre-check 已產生補拍與補充說明提醒。", { ai: aiMetadata }),
      makeAudit(`${caseId}-company`, now, "ai", "company_case_created", "公司端 demo store 已建立共享稽核案件。", { ai: aiMetadata, evidenceIds: evidenceCards.map((card) => card.id) })
    ]
    };
    state.sequence = sequence;
    // Persistent integrated cases are historical evidence; never evict older
    // submissions because another visitor completed a demonstration.
    state.cases = [demoCase, ...state.cases];
    if (idempotencyKey) {
      state.idempotencyKeys[idempotencyKey] = caseId;
    }
    state.idempotencyKeys = Object.fromEntries(
      Object.entries(state.idempotencyKeys).filter(([, mappedCaseId]) => state.cases.some((item) => item.caseId === mappedCaseId))
    );
    return demoCase;
  });
}

export async function patchCase(caseId, patch) {
  return caseStateStore.mutate((state) => {
    const index = state.cases.findIndex((item) => caseMatches(item, caseId));
    if (index < 0) return null;
    assertPatchShape(patch, ["status"]);
    if (typeof patch.status !== "string" || !patch.status) throw invalidCaseCommand("invalid_case_patch", "A workflow status is required.");
    const now = new Date().toISOString();
    const current = state.cases[index];
    if (current.status === "work_order_created" && patch.status === "resolved") {
      throw invalidCaseCommand("work_order_completion_required", "Complete the work order with completion evidence before resolving the case.");
    }
    if (patch.status !== current.status) {
      assertDemoCaseTransition(current.status, patch.status);
    }
    if (patch.status !== "under_review" && patch.status !== current.status) {
      throw invalidCaseCommand("domain_command_required", "Use the manual-review or complete-work-order command for this transition.");
    }
    const auditTrail = [
    ...current.auditTrail,
    makeAudit(`${caseId}-patch-${Date.now()}`, now, "ops", "case_status_changed", `公司端更新案件狀態（workflow ${CASE_WORKFLOW_VERSION}）。`, {
      previousStatus: current.status,
      nextStatus: patch.status,
      evidenceIds: current.evidenceCards.map((card) => card.id)
    })
    ];
    state.cases[index] = {
    ...current,
    ...patch,
    updatedAt: now,
    auditTrail
    };
    return state.cases[index];
  });
}

/**
 * Records an authorised human review and applies its consequent state change
 * as one store mutation. This prevents a client from skipping `under_review`
 * on the way to a work order or a resolution.
 */
export async function recordManualReviewDecision(caseId, input) {
  return caseStateStore.mutate((state) => {
    const index = state.cases.findIndex((item) => caseMatches(item, caseId));
    if (index < 0) return null;

    const now = new Date().toISOString();
    const manualReviewOutcome = normalizeManualReviewOutcome(input, now);
    const current = state.cases[index];
    if (current.status === "work_order_created" && manualReviewOutcome.outcome === "dispatch_required") return current;

    let workflowStatus = current.status;
    const auditTrail = [...current.auditTrail];
    const manualReviewEvidenceId = `${caseId}-manual-review-history`;
    if (workflowStatus === "submitted") {
      assertDemoCaseTransition(workflowStatus, "under_review");
      workflowStatus = "under_review";
      auditTrail.push(
        makeAudit(
          `${caseId}-manual-review-start-${Date.now()}`,
          now,
          "system",
          "manual_review_started",
          `案件已進入人工覆核（workflow ${CASE_WORKFLOW_VERSION}）。`,
          { previousStatus: "submitted", nextStatus: "under_review", evidenceIds: current.evidenceCards.map((card) => card.id) }
        )
      );
    }

    const targetStatus = targetStatusForManualReview(manualReviewOutcome.outcome);
    if (targetStatus !== workflowStatus) assertDemoCaseTransition(workflowStatus, targetStatus);

    auditTrail.push(
      makeAudit(
        `${caseId}-manual-review-${Date.now()}`,
        now,
        "customer_service",
        "manual_review_saved",
        `人工覆核結果已寫入車況履歷：${manualReviewOutcomeLabel(manualReviewOutcome.outcome)}。`,
        { evidenceIds: [manualReviewEvidenceId] }
      )
    );
    if (targetStatus === "work_order_created") {
      auditTrail.push(
        makeAudit(
          `${caseId}-work-order-${Date.now()}`,
          now,
          "ops",
          "work_order_created",
          "人工覆核確認需派工，已建立工單並暫停車輛放行。",
          { previousStatus: workflowStatus, nextStatus: "work_order_created", evidenceIds: [manualReviewEvidenceId] }
        )
      );
    } else if (targetStatus === "resolved") {
      auditTrail.push(
        makeAudit(
          `${caseId}-resolved-${Date.now()}`,
          now,
          "ops",
          "case_resolved",
          "人工覆核確認無需派工，案件已結案並保留完整證據軌跡。",
          { previousStatus: workflowStatus, nextStatus: "resolved", evidenceIds: [manualReviewEvidenceId] }
        )
      );
    }

    const evidenceCards = [
      makeEvidence(
        manualReviewEvidenceId,
        manualReviewOutcome.outcome === "dirty" ? "photo" : "history",
        manualReviewOutcome.outcome === "dispatch_required" ? "critical" : manualReviewOutcome.outcome === "not_damage" ? "info" : "warning",
        "人工覆核結果已寫入車況履歷",
        `${manualReviewOutcomeLabel(manualReviewOutcome.outcome)}。${manualReviewOutcome.note || "此結果可作為未來 AI 改善資料。"}`,
        "客服人工覆核",
        1,
        manualReviewOutcome.outcome === "dirty" ? "cleanliness" : "damage"
      ),
      ...current.evidenceCards.filter((card) => card.id !== manualReviewEvidenceId)
    ];

    state.cases[index] = {
      ...current,
      status: targetStatus,
      manualReviewOutcome,
      updatedAt: now,
      evidenceCards,
      auditTrail
    };
    return state.cases[index];
  });
}

/**
 * Closes an existing work order only after a human supplies completion
 * evidence. Generic PATCH intentionally cannot perform this transition.
 */
export async function completeDemoWorkOrder(caseId, input) {
  return caseStateStore.mutate((state) => {
    const index = state.cases.findIndex((item) => caseMatches(item, caseId));
    if (index < 0) return null;
    const current = state.cases[index];
    if (current.status === "resolved") return current;
    if (current.status !== "work_order_created") {
      throw invalidCaseCommand("work_order_not_ready", "Only a created work order can be completed.");
    }

    const now = new Date().toISOString();
    const completion = normalizeWorkOrderCompletion(input, now);
    assertDemoCaseTransition(current.status, "resolved");
    const evidenceId = `${caseId}-work-order-completion`;
    const evidenceCards = [
      makeEvidence(
        evidenceId,
        "history",
        "info",
        "工單完成證據已保存",
        completion.note,
        "維修 / 營運完工確認",
        1,
        "safety"
      ),
      ...current.evidenceCards.filter((card) => card.id !== evidenceId)
    ];
    const evidenceIds = [evidenceId, ...completion.evidenceIds];
    state.cases[index] = {
      ...current,
      status: "resolved",
      updatedAt: now,
      evidenceCards,
      auditTrail: [
        ...current.auditTrail,
        makeAudit(`${caseId}-work-order-completion-${Date.now()}`, now, "maintenance", "work_order_completion_saved", "工單完成證據已寫入案件履歷。", { evidenceIds }),
        makeAudit(`${caseId}-work-order-resolved-${Date.now()}`, now, "maintenance", "work_order_completed", "工單完成，案件已結案並恢復可出租評估。", {
          previousStatus: "work_order_created",
          nextStatus: "resolved",
          evidenceIds
        })
      ]
    };
    return state.cases[index];
  });
}

export async function reanalyzeCase(caseId, patch = {}) {
  return caseStateStore.mutate((state) => {
    const index = state.cases.findIndex((item) => caseMatches(item, caseId));
    if (index < 0) return null;
    assertPatchShape(patch, ["submission"]);

    const now = new Date().toISOString();
    const current = state.cases[index];
    const submission = normalizeSubmission(patch.submission ?? current.submission);
    const assessment = buildAssessment(submission);
    const actions = buildActions(assessment, submission);
    const evidenceCards = buildEvidenceCards(submission, assessment);

    state.cases[index] = {
    ...current,
    updatedAt: now,
    submission,
    telematics: current.telematics ?? buildTelematics(submission),
    bookingContext: {
      ...current.bookingContext,
      nextBookingMinutes: assessment.projectedNextBookingMinutes,
      alternativeVehicleCount: assessment.nextBookingDecision === "reassign" ? Math.max(2, Number(current.bookingContext?.alternativeVehicleCount ?? 1)) : Number(current.bookingContext?.alternativeVehicleCount ?? 1)
    },
    history: buildHistory(submission),
    assessment,
    evidenceCards,
    actions,
    auditTrail: [
      ...current.auditTrail,
      makeAudit(`${current.caseId}-reanalyze-${Date.now()}`, now, "ai", "ai_reanalysis_completed", "AI 重新分析完成，已更新 assessment、evidence、actions 與稽核軌跡。", {
        ai: auditAiMetadata(submission),
        evidenceIds: evidenceCards.map((card) => card.id)
      })
    ]
    };
    return state.cases[index];
  });
}

export function aiHealth() {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY || process.env.AI_API_KEY);
  const photoEvidenceModel = process.env.AI_PHOTO_EVIDENCE_MODEL || process.env.AI_MODEL || "gpt-5.4";

  return {
    ok: true,
    provider: process.env.AI_PROVIDER || (hasApiKey ? "openai" : "mock"),
    hasApiKey,
    mode: hasApiKey ? "provider-ready" : "mock-fallback",
    photoEvidenceModel,
    photoInspectionModel: process.env.AI_PHOTO_INSPECTION_MODEL || photoEvidenceModel
  };
}

export function returnPrecheck(payload) {
  const submission = normalizeSubmission(payload?.submission ?? payload);
  const note = `${submission.damageNote} ${submission.quickOptions.join(" ")}`;
  const retake = [];
  const hints = [];
  if (/右側|右前|刮傷|擦傷/.test(note)) {
    retake.push("right", "front-right");
    hints.push("系統偵測到可能需要補充照片，建議您再拍攝右側車身。");
    hints.push("系統偵測到可能需要補充照片，建議您再拍攝右前方車身。");
  }
  if (/原本就有|取車前|不是我|已經有/.test(note)) {
    hints.push("若車況為取車前已存在，請於備註中補充時間、位置或可辨識描述。");
  }
  if (hints.length === 0) hints.push("AI 初步檢查未發現需補拍項目，您可以送出還車紀錄。");
  return {
    provider: process.env.AI_PROVIDER || "mock",
    fallbackUsed: !process.env.AI_API_KEY,
    retakePhotoAngles: [...new Set(retake)],
    hints,
    customerSafeMessage: hints.join(" ")
  };
}

function normalizeSubmission(input = {}) {
  const quickOptions = Array.isArray(input.quickOptions) ? input.quickOptions : input.quickNotes ?? [];
  const photoSlots = Array.isArray(input.photoSlots)
    ? input.photoSlots.map(normalizePhotoSlot)
    : (input.photos ?? []).map((photo) => ({
        id: photo.id,
        angle: photo.angle,
        label: photo.label,
        status: photo.status,
        imageUrl: photo.imageUrl ?? photo.previewUrl ?? null,
        expectedView: photo.expectedView ?? expectedViewFromAngle(photo.angle),
        stage: photo.stage ?? (String(photo.id ?? "").startsWith("support-") ? "support_claim" : "return"),
        aiInspection: photo.aiInspection ?? null,
        aiRawResult: photo.aiRawResult ?? photo.aiInspectionRaw ?? null
      })).map(normalizePhotoSlot);
  const damageNote = [input.damageNote, input.voiceNote, input.textNote].filter(Boolean).join("，");
  return {
    clientSubmissionId: normalizeIdempotencyKey(input.clientSubmissionId),
    vehicleId: input.vehicleId || "IR-7712",
    plateNumber: input.plateNumber || input.vehicleId || "IR-7712",
    vehicleModel: input.vehicleModel || "Toyota Altis",
    returnLocation: input.returnLocation || input.returnStation || "台南小西門站",
    returnTime: input.returnTime || new Date().toISOString(),
    orderId: input.orderId || "RT-260629-DEMO",
    damageNote,
    quickOptions,
    photoSlots,
    customerVisibleSummary: buildCustomerVisibleSummary(damageNote, quickOptions)
  };
}

function normalizeIdempotencyKey(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) return null;
  return normalized;
}

function localPhotoNeedsVerification(slot) {
  const raw = slot.aiRawResult ?? slot.aiInspectionRaw;
  if (raw?.ai_meta?.source !== "local-detector") return false;
  const photos = [slot.aiInspection, ...(Array.isArray(raw.photos) ? raw.photos : [])].filter(Boolean);
  return photos.length === 0 || photos.some((photo) =>
    photo.is_vehicle_visible !== true || photo.expected_view_match !== "yes" ||
    photo.photo_quality?.is_clear_enough !== true || photo.detected_view === "unknown"
  );
}

function normalizePhotoSlot(slot) {
  const needsVerification = localPhotoNeedsVerification(slot);
  return {
    ...slot,
    ...(needsVerification ? { status: slot.status === "retake_required" || slot.aiInspection?.retake_required ? "retake_required" : "needs_manual_review" } : {}),
    expectedView: slot.expectedView ?? expectedViewFromAngle(slot.angle),
    stage: slot.stage ?? (String(slot.id ?? "").startsWith("support-") ? "support_claim" : "return"),
    imageUrl: slot.imageUrl ?? null,
    aiInspection: slot.aiInspection ?? null,
    aiRawResult: slot.aiRawResult ?? slot.aiInspectionRaw ?? null
  };
}

function supportPhotoFromSlot(demoCase, slot) {
  const aiPhoto = slot.aiInspection ?? null;
  const rawResult = slot.aiRawResult ?? (aiPhoto ? { photos: [aiPhoto] } : null);
  const status = photoAiStatus(rawResult, aiPhoto);

  return {
    id: slot.id,
    caseId: demoCase.caseId,
    rentalId: demoCase.submission.orderId ?? demoCase.caseId,
    imageUrl: slot.imageUrl ?? null,
    stage: slot.stage ?? "return",
    expectedView: slot.expectedView ?? expectedViewFromAngle(slot.angle),
    uploadedBy: "customer",
    createdAt: demoCase.createdAt,
    ai: aiPhoto
      ? {
          status,
          detectedView: aiPhoto.detected_view,
          viewConfidence: aiPhoto.view_confidence,
          cleanlinessLevel: aiPhoto.cleanliness.level,
          damageLevel: aiPhoto.damage.level,
          retakeRequired: aiPhoto.retake_required,
          summary: aiPhoto.support_message,
          issues: aiPhoto.issues,
          rawResult
        }
      : null
  };
}

function photoAiStatus(rawResult, aiPhoto) {
  if (localPhotoNeedsVerification({aiRawResult: rawResult, aiInspection: aiPhoto})) return aiPhoto?.retake_required ? "needs_retake" : "manual_review";
  if (rawResult?.ai_meta?.resultKind === "ai_unavailable") return "ai_unavailable";
  if (rawResult?.ai_meta?.resultKind === "demo_replay" || rawResult?.ai_meta?.source === "demo_replay") return "demo_replay";
  if (rawResult?.final_decision?.status) return rawResult.final_decision.status;
  if (aiPhoto?.retake_required) return "needs_retake";
  return aiPhoto ? "pass" : "pending";
}

function expectedViewFromAngle(angle) {
  if (angle === "front") return "front";
  if (angle === "rear") return "rear";
  if (angle === "left") return "left_side";
  if (angle === "right") return "right_side";
  if (angle === "interior") return "interior";
  if (angle === "dashboard") return "dashboard";
  if (angle === "wheel") return "wheel";
  return "any";
}

function buildAssessment(submission) {
  const text = `${submission.damageNote} ${submission.quickOptions.join(" ")}`;
  const photoSignals = collectPhotoInspectionSignals(submission);
  const hasDamageNote = /刮傷|擦傷|凹陷|右側|右前|保險桿/.test(text);
  const hasCleanNote = /垃圾|髒|飲料|煙味|異味/.test(text);
  const hasDamage = hasDamageNote || photoSignals.hasDamage;
  const hasExisting = /原本就有|取車前|不是我|已經有/.test(text);
  const hasSafety = /胎壓|警示燈|故障燈|煞車/.test(text);
  const hasClean = hasCleanNote || photoSignals.hasDirty;
  const projectedNextBookingMinutes = hasSafety || hasDamage || photoSignals.hasRetake || photoSignals.hasManualReview || photoSignals.hasLowConfidence
    ? 35
    : hasClean
      ? 55
      : 80;
  const lineItems = buildRiskLineItems(submission, {
    hasDamage,
    hasDamageNote,
    hasExisting,
    hasSafety,
    hasClean,
    hasCleanNote,
    nextBookingMinutes: projectedNextBookingMinutes,
    photoSignals
  });
  const formula = buildRiskFormula(lineItems);
  const riskScore = formula.finalRisk;
  const riskLevel = riskLevelForScore(riskScore);
  const scoredStatus = hasSafety ? "offline" : vehicleStatusForScore(riskScore);
  const status = photoSignals.hasUnverifiedLocal && scoredStatus !== "offline" ? "hold" : scoredStatus;
  const riskBreakdown = {
    damage: hasDamage ? 24 : 0,
    cleanliness: hasClean ? 8 : 0,
    energy: 0,
    safety: hasSafety ? 24 : 0,
    dispute: hasExisting ? 8 : 0,
    lineItems,
    formula,
    scoreDisclaimer: "Demo 模擬分數，非正式判責結果"
  };
  const nextBookingDecision = decideNextBookingForStatus(status, riskBreakdown, projectedNextBookingMinutes);
  return {
    riskScore,
    riskLevel,
    status,
    riskBreakdown,
    nextBookingDecision,
    dispatchPriority: dispatchPriorityForStatus(status),
    aiConfidence: photoSignals.hasLowConfidence ? 0.66 : hasExisting ? 0.78 : 0.91,
    confidence: photoSignals.hasLowConfidence ? 0.66 : hasExisting ? 0.78 : 0.91,
    manualReviewRequired: hasDamage || hasClean || hasExisting || hasSafety || photoSignals.hasManualReview || photoSignals.hasRetake || photoSignals.hasFailed || photoSignals.hasLowConfidence,
    internalReasoning: hasDamage
      ? "LLM 推理摘要：輸入已記錄右側/右前車身刮傷訊號，需比對照片、歷史工單與下一筆訂單時間。"
      : photoSignals.hasAiResult
        ? "AI 照片檢核已同步至公司端，未觸發主要車損關鍵字。"
        : "LLM 推理摘要：未觸發主要車況風險規則。",
    customerSafeMessage: photoSignals.hasUnverifiedLocal
      ? "照片的車輛、角度或畫質尚未確認，需人工覆核或補拍；目前不能確認車輛可出租。"
      : hasDamage
      ? "系統已收到您的車況說明，將提供營運人員後續覆核。若為取車前已存在，請補充時間、位置或可辨識描述。"
      : photoSignals.hasRetake
        ? "還車紀錄已收到，部分照片將由客服協助確認。"
        : "還車紀錄已送出，系統初步檢查未發現需補拍項目。",
    customerSummary: hasDamage
      ? `您好，訂單 ${submission.orderId} 的還車資料已收到。系統會保留照片與備註紀錄，後續以人工覆核確認，不會在資訊不足時直接判定責任。`
      : `您好，訂單 ${submission.orderId} 已完成還車資料送出，系統將保留紀錄供後續查閱。`,
    internalSummary: `${submission.vehicleId} 共享 demo case 已建立，Demo 模擬風險 ${riskScore}/100（原始累積 ${formula.rawScore}），AI 照片狀態：${photoSignals.summary}，下一筆訂單建議 ${nextBookingDecision === "reassign" ? "改派" : nextBookingDecision === "delay" ? "延後" : "保留"}。`,
    validation: { valid: true, errors: [] },
    projectedNextBookingMinutes
  };
}

function buildRiskLineItems(submission, signals) {
  const hasMissingPhoto =
    submission.photoSlots.length === 0 ||
    submission.photoSlots.some((slot) => slot.status === "missing" || slot.status === "retake_required");
  const items = [
    makeRiskItem("base-review", "基礎流程檢核", "每筆 shared demo case 都建立公司端覆核紀錄與 evidence trail。", 6, "baseScore")
  ];

  if (hasMissingPhoto) {
    items.push(makeRiskItem("photo-missing", "照片缺漏", "客戶端照片尚未完整通過，需提高補拍優先序。", 20, "photoRisk"));
  }
  if (signals.photoSignals?.hasRetake) {
    items.push(makeRiskItem("ai-photo-retake", "AI 照片需補拍", "顧客端 AI 檢核已要求補拍或確認角度。", 18, "photoRisk", "damage"));
  }
  if (signals.photoSignals?.hasWrongExpectedView || signals.photoSignals?.hasVehicleNotVisible) {
    items.push(makeRiskItem("ai-photo-angle-or-visibility", "AI 角度 / 車輛可見性不符", "照片角度錯誤、車輛不可見或可能放錯欄位，需補拍或人工確認。", 16, "photoRisk", "damage"));
  }
  if (signals.photoSignals?.hasLowImageQuality) {
    items.push(makeRiskItem("ai-photo-quality", "AI 照片品質不足", "照片模糊、過暗、裁切或清晰度不足，影響車況判讀。", 12, "photoRisk", "damage"));
  }
  if (signals.photoSignals?.hasManualReview) {
    items.push(makeRiskItem("ai-photo-manual-review", "AI 建議人工覆核", "顧客端照片含疑似損傷、翻拍或信心不足訊號。", 16, "photoRisk", "dispute"));
  }
  if (signals.photoSignals?.hasAiUnavailable) {
    items.push(makeRiskItem("ai-provider-unavailable", "AI provider unavailable", "照片已保存並轉人工覆核；不產生正式 AI 判定。", 14, "photoRisk", "dispute"));
  }
  if (signals.photoSignals?.hasDamageDetected) {
    items.push(makeRiskItem("ai-photo-damage-detected", "AI 偵測明確損傷", "照片 AI flags 包含 damage_detected，納入照片風險。", 24, "photoRisk", "damage"));
  }
  if (signals.photoSignals?.hasPossibleDamage) {
    items.push(makeRiskItem("ai-photo-possible-damage", "AI 偵測疑似損傷", "照片 AI flags 包含 possible_damage_detected，需由客服確認。", 14, "photoRisk", "damage"));
  }
  if (signals.photoSignals?.hasDirtyDetected) {
    items.push(makeRiskItem("ai-photo-dirty-detected", "AI 偵測髒污", "照片 AI flags 包含 dirty_detected，納入清潔風險。", 12, "photoRisk", "cleanliness"));
  }
  if (signals.hasDamageNote) {
    items.push(makeRiskItem("note-damage-keywords", "損傷關鍵字", "備註包含刮傷、右側、右前或保險桿等損傷訊號。", 25, "noteRisk", "damage"));
  }
  if (signals.hasCleanNote) {
    items.push(makeRiskItem("note-cleanliness-risk", "髒污備註", "備註包含垃圾、髒污、飲料、煙味或異味。", 15, "noteRisk", "cleanliness"));
  }
  if (signals.hasSafety) {
    items.push(makeRiskItem("safety-risk", "安全 / 車聯網警示", "備註包含胎壓、警示燈、故障燈或煞車訊號。", 28, "noteRisk", "safety"));
  }
  if (signals.hasExisting) {
    items.push(makeRiskItem("dispute-risk", "爭議 / 歷史訊號", "備註提到取車前可能已存在或非本次造成，需人工比對。", 12, "noteRisk", "dispute"));
  }

  const bookingWindow = nextBookingWindow(signals.nextBookingMinutes);
  const orderPressureRisk = RISK_POLICY.bookingPressurePoints[bookingWindow];
  if (orderPressureRisk > 0) {
    items.push(makeRiskItem("next-booking-pressure", "下一筆訂單壓力", `${signals.nextBookingMinutes} 分鐘後有下一筆訂單，需保留調度緩衝。`, orderPressureRisk, "orderPressureRisk"));
  }

  if (signals.hasExisting && submission.damageNote.replace(/\s+/g, "").length >= 10) {
    items.push(makeRiskItem("customer-clarification", "客戶補充說明", "租客補充取車前狀況，可降低直接升級派工風險。", -10, "mitigationScore", "dispute"));
  }

  return items;
}

function buildRiskFormula(items) {
  const sumPositive = (component) =>
    items
      .filter((item) => item.component === component)
      .reduce((total, item) => total + Math.max(0, item.points), 0);
  const baseScore = sumPositive("baseScore");
  const photoRisk = sumPositive("photoRisk");
  const noteRisk = sumPositive("noteRisk");
  const orderPressureRisk = sumPositive("orderPressureRisk");
  const mitigationScore = items
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

function makeRiskItem(id, label, description, points, component, category) {
  return { id, label, description, points, component, category };
}

function assertPatchShape(patch, allowedFields) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw invalidCaseCommand("invalid_case_patch", "Case update payload must be an object.");
  const unexpected = Object.keys(patch).filter((key) => !allowedFields.includes(key));
  if (unexpected.length > 0) {
    throw invalidCaseCommand("invalid_case_patch", `Case update fields are not allowed: ${unexpected.join(", ")}.`);
  }
}

function normalizeManualReviewOutcome(input, savedAt) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw invalidCaseCommand("invalid_manual_review", "Manual review outcome is required.");
  }
  const outcome = String(input.outcome ?? "").trim();
  if (!MANUAL_REVIEW_OUTCOMES.has(outcome)) {
    throw invalidCaseCommand("invalid_manual_review", "Manual review outcome is not supported.");
  }
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 2000) : "";
  return { outcome, note, savedAt };
}

function normalizeWorkOrderCompletion(input, savedAt) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw invalidCaseCommand("invalid_work_order_completion", "Work-order completion evidence is required.");
  }
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 2000) : "";
  if (note.length < 3) {
    throw invalidCaseCommand("invalid_work_order_completion", "Work-order completion note must be at least three characters.");
  }
  const evidenceIds = Array.isArray(input.evidenceIds)
    ? [...new Set(input.evidenceIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim().slice(0, 160)))].slice(0, 20)
    : [];
  return { note, evidenceIds, savedAt };
}

function targetStatusForManualReview(outcome) {
  if (outcome === "dispatch_required") return "work_order_created";
  if (outcome === "not_damage") return "resolved";
  return "under_review";
}

function invalidCaseCommand(code, message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}

function buildActions(assessment) {
  const actions = [];
  if (assessment.riskBreakdown.cleanliness > 0) {
    actions.push(makeAction("clean", "cleaning", "cleaning_team", assessment.dispatchPriority, 25, assessment.nextBookingDecision !== "keep", "清潔後再出租", "建立清潔派工並要求完成後複拍。"));
  }
  if (assessment.riskBreakdown.damage > 0) {
    actions.push(makeAction("retake_photo", "retake_photo", "customer", assessment.dispatchPriority, 8, false, "要求複拍車況", "補拍右側與右前方車身，降低後續爭議。"));
  }
  if (assessment.manualReviewRequired) {
    actions.push(makeAction("manual_review", "manual_review", "customer_service", assessment.dispatchPriority, 15, false, "轉人工覆核", "客服與營運人員以中立方式比對 evidence trail。"));
  }
  if (assessment.nextBookingDecision === "reassign") {
    actions.push(makeAction("reassign_next_booking", "reassign_booking", "ops", "high", 10, true, "改派下一筆訂單", "避免下一位租客到場後才發現車輛不可用。"));
  }
  if (actions.length === 0) {
    actions.push(makeAction("keep_booking", "keep_booking", "ops", "low", 3, false, "保留下一筆訂單", "寫入車況履歷並維持車輛可出租狀態。"));
  }
  return actions;
}

function makeAction(id, actionType, ownerRole, priority, estimatedMinutes, blockingNextBooking, label, description) {
  return { id, actionId: `act-${id}`, actionType, ownerRole, priority, estimatedMinutes, blockingNextBooking, label, description };
}

function buildEvidenceCards(submission, assessment) {
  return [
    ...buildAiPhotoEvidenceCards(submission),
    makeEvidence("photo-uploaded", "photo", "info", "已接收還車照片", "客戶端照片狀態已寫入共享案件。", "客戶端還車流程", 0.82, "damage"),
    makeEvidence("voice-note-received", "voice", assessment.riskBreakdown.damage > 0 ? "warning" : "info", "已接收語音/文字備註", submission.damageNote || "租客未留下額外描述。", "租客備註", 0.78, "dispute"),
    makeEvidence("telematics-snapshot", "telematics", "info", "車聯網訊號快照", "能源 64%，胎壓正常，DTC 正常。", "車聯網訊號", 0.86, "safety"),
    makeEvidence("history-summary", "history", "info", "歷史工單摘要", "近期無未結維修工單；若同部位曾回報，需人工比對。", "歷史工單系統", 0.84, "dispute"),
    makeEvidence("ai-rule-policy", "policy", "info", "AI 規則判定", "系統依照片、備註、車聯網、歷史工單與下一筆訂單時間進行 deterministic 判讀。", "AI 決策規則", 0.9, "safety")
  ];
}

function buildAiPhotoEvidenceCards(submission) {
  const cards = [];

  for (const slot of submission.photoSlots ?? []) {
    const ai = slot.aiInspection;
    const rawStatus = slot.aiRawResult?.final_decision?.status;
    if (!ai) continue;

    if (slot.aiRawResult?.ai_meta?.resultKind === "ai_unavailable") {
      cards.push(
        makeEvidence(
          `ai-unavailable-${slot.id}`,
          "photo",
          "warning",
          `AI provider unavailable：${slot.label}`,
          slot.aiRawResult.ai_meta.unavailableReason || "AI provider unavailable，案件已轉人工覆核，不產生正式 AI 判定。",
          "顧客端 AI Provider Health",
          1,
          "dispute"
        )
      );
      continue;
    }

    for (const issue of ai.issues ?? []) {
      cards.push(
        makeEvidence(
          `ai-photo-${slot.id}-${issue.issue_id}`,
          "photo",
          issue.severity === "severe" ? "critical" : "warning",
          `AI 照片檢核：${slot.label}`,
          `${slot.label} ${issueKindLabel(issue.issue_kind)}：${issue.visual_evidence || ai.support_message}`,
          "顧客端 AI 照片檢核",
          clampConfidence(issue.confidence),
          dirtyIssueKinds().includes(issue.issue_kind) ? "cleanliness" : "damage"
        )
      );
    }

    if (ai.retake_required) {
      cards.push(
        makeEvidence(
          `ai-retake-${slot.id}`,
          "photo",
          "warning",
          `AI 要求補拍：${slot.label}`,
          ai.support_message || ai.customer_message || "照片角度、清晰度或車輛可見性不足，系統已要求補拍。",
          "顧客端 AI 照片檢核",
          clampConfidence(ai.view_confidence || 0.78),
          "damage"
        )
      );
    } else if (rawStatus === "manual_review" || ai.flags?.includes("manual_review_recommended")) {
      cards.push(
        makeEvidence(
          `ai-manual-${slot.id}`,
          "photo",
          "warning",
          `AI 建議覆核：${slot.label}`,
          ai.support_message || "照片已保存，AI 建議客服人工覆核。",
          "顧客端 AI 照片檢核",
          clampConfidence(ai.view_confidence || 0.74),
          "dispute"
        )
      );
    }
  }

  return cards.slice(0, 10);
}

function makeEvidence(id, type, severity, title, description, source, confidence, relatedRiskCategory) {
  return { id, type, severity, title, description, source, confidence, relatedRiskCategory };
}

function collectPhotoInspectionSignals(submission) {
  const slots = submission.photoSlots ?? [];
  const aiPhotos = slots.map((slot) => slot.aiInspection).filter(Boolean);
  const hasRetake = slots.some((slot) => slot.status === "retake_required" || slot.aiInspection?.retake_required);
  const hasAiUnavailable = slots.some((slot) => slot.status === "ai_unavailable" || slot.aiRawResult?.ai_meta?.resultKind === "ai_unavailable");
  const hasFailed = slots.some((slot) => slot.status === "failed" || slot.status === "uploaded");
  const hasUnverifiedLocal = slots.some(localPhotoNeedsVerification);
  const hasManualReview = hasUnverifiedLocal || slots.some(
    (slot) =>
      slot.status === "manual_review" ||
      slot.status === "needs_manual_review" ||
      slot.status === "ai_unavailable" ||
      slot.aiRawResult?.final_decision?.status === "manual_review" ||
      slot.aiInspection?.flags?.includes("manual_review_recommended")
  );
  const hasDamage = aiPhotos.some(
    (photo) =>
      photo.flags?.includes("damage_detected") ||
      photo.flags?.includes("possible_damage_detected") ||
      (photo.damage?.level && !["none", "unknown"].includes(photo.damage.level))
  );
  const hasDirty = aiPhotos.some(
    (photo) => photo.flags?.includes("dirty_detected") || (photo.cleanliness?.level && !["none", "unknown"].includes(photo.cleanliness.level))
  );
  const hasDamageDetected = aiPhotos.some((photo) => photo.flags?.includes("damage_detected"));
  const hasPossibleDamage = aiPhotos.some(
    (photo) => photo.flags?.includes("possible_damage_detected") || (photo.issues ?? []).some((issue) => issue.issue_kind === "possible_damage")
  );
  const hasDirtyDetected = aiPhotos.some(
    (photo) => photo.flags?.includes("dirty_detected") || (photo.issues ?? []).some((issue) => dirtyIssueKinds().includes(issue.issue_kind))
  );
  const hasLowImageQuality = aiPhotos.some(
    (photo) => photo.flags?.includes("low_image_quality") || photo.photo_quality?.is_clear_enough === false
  );
  const hasWrongExpectedView = aiPhotos.some((photo) => photo.flags?.includes("wrong_expected_view") || photo.expected_view_match === "no");
  const hasVehicleNotVisible = aiPhotos.some((photo) => photo.flags?.includes("vehicle_not_visible") || photo.is_vehicle_visible === false);
  const hasLowConfidence = aiPhotos.some((photo) => Number(photo.view_confidence ?? 1) < 0.7 || (photo.issues ?? []).some((issue) => Number(issue.confidence ?? 1) < 0.7));

  return {
    hasAiResult: aiPhotos.length > 0,
    hasRetake,
    hasFailed,
    hasAiUnavailable,
    hasManualReview,
    hasUnverifiedLocal,
    hasDamage,
    hasDirty,
    hasDamageDetected,
    hasPossibleDamage,
    hasDirtyDetected,
    hasLowImageQuality,
    hasWrongExpectedView,
    hasVehicleNotVisible,
    hasLowConfidence,
    summary: aiPhotos.length === 0
      ? "尚無正式 AI 照片結果"
      : hasAiUnavailable
        ? "AI provider unavailable，轉人工覆核"
      : hasRetake
        ? "需補拍"
        : hasManualReview
          ? "需人工覆核"
          : hasDamage || hasDirty
            ? "已記錄車況資訊"
            : "照片通過"
  };
}

function caseMatches(item, caseId) {
  return item.caseId === caseId || item.assessmentId === caseId || item.submission?.orderId === caseId;
}

function issueKindLabel(kind) {
  return {
    dirty: "髒污",
    mud: "泥污",
    dust: "灰塵",
    stain: "污漬",
    bird_dropping: "鳥糞",
    scratch: "刮傷",
    dent: "凹陷",
    crack: "裂痕",
    paint_peel: "掉漆",
    paint_transfer: "漆面轉移",
    broken_light: "燈具破損",
    deformation: "變形",
    missing_part: "零件缺失",
    possible_damage: "疑似損傷",
    other: "車況資訊"
  }[kind] ?? "車況資訊";
}

function dirtyIssueKinds() {
  return ["dirty", "mud", "dust", "stain", "bird_dropping"];
}

function clampConfidence(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.75;
}

function buildTelematics() {
  return {
    batteryPercent: 64,
    tirePressureLow: false,
    dtcWarning: false,
    odometerDeltaKm: 17,
    locationConfidence: 0.92
  };
}

function buildHistory(submission) {
  return {
    recentComplaints: /原本就有|取車前|不是我|已經有/.test(submission.damageNote) ? 1 : 0,
    unresolvedWorkOrders: 0,
    repeatedDamageArea: /右側|右前|刮傷/.test(submission.damageNote) ? "右前/右側車身" : undefined
  };
}

function buildCustomerVisibleSummary(damageNote, quickOptions) {
  if (/右側|右前|刮傷/.test(`${damageNote} ${quickOptions.join(" ")}`)) {
    return "已收到車況補充，建議補拍右側與右前方，並補充取車前是否已存在。";
  }
  return "已收到還車資料，AI 初步檢查未發現需補拍項目。";
}

function makeAudit(id, time, actor, eventType, description, metadata = {}) {
  return {
    id,
    time,
    actor,
    eventType,
    description,
    policyVersion: CASE_WORKFLOW_VERSION,
    previousStatus: null,
    nextStatus: null,
    evidenceIds: [],
    ai: null,
    ...metadata
  };
}

function auditAiMetadata(submission) {
  const rawResult = submission.photoSlots
    ?.map((slot) => slot.aiRawResult)
    .find((result) => result?.ai_meta);
  const meta = rawResult?.ai_meta;
  if (!meta || typeof meta !== "object") return null;
  return {
    provider: typeof meta.provider === "string" ? meta.provider : typeof meta.source === "string" ? meta.source : null,
    model: typeof meta.model === "string" ? meta.model : null,
    responseId: typeof meta.responseId === "string" ? meta.responseId : null,
    fallbackUsed: meta.fallbackUsed === true,
    schemaVersion: typeof meta.schemaVersion === "string" ? meta.schemaVersion : null
  };
}

function manualReviewOutcomeLabel(outcome) {
  return {
    confirmed_scratch: "確認刮傷",
    not_damage: "非損傷",
    dirty: "髒污",
    unclear_photo: "照片不清楚",
    dispatch_required: "需派工"
  }[outcome] ?? "人工覆核";
}
