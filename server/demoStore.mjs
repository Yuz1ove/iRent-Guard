import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const storeFile = path.join(os.tmpdir(), "irent-guard-demo-store.json");
const globalKey = "__irentGuardDemoStore";

function initialState() {
  return { sequence: 0, cases: [], photoInspections: [] };
}

function readState() {
  if (!globalThis[globalKey]) {
    try {
      globalThis[globalKey] = JSON.parse(fs.readFileSync(storeFile, "utf8"));
    } catch {
      globalThis[globalKey] = initialState();
    }
  }
  if (!Array.isArray(globalThis[globalKey].photoInspections)) {
    globalThis[globalKey].photoInspections = [];
  }
  return globalThis[globalKey];
}

function writeState(state) {
  globalThis[globalKey] = state;
  try {
    fs.writeFileSync(storeFile, JSON.stringify(state, null, 2));
  } catch {
    // Serverless filesystems can be ephemeral; in-memory state still works for the warm demo process.
  }
}

export function listCases() {
  return readState().cases;
}

export function getLatestCase() {
  return readState().cases[0] ?? null;
}

export function getCase(caseId) {
  return readState().cases.find((item) => item.caseId === caseId) ?? null;
}

export function resetCases() {
  const state = initialState();
  writeState(state);
  return { ok: true };
}

export function savePhotoInspectionRecord(input, result) {
  const state = readState();
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
            status: result.final_decision.status,
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
  ].slice(0, 80);
  writeState(state);
  return records;
}

export function getSupportCasePhotos(caseId) {
  const state = readState();
  const demoCase = getCase(caseId) ?? state.cases.find((item) => item.assessmentId === caseId || item.submission?.orderId === caseId);

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

export function createCase(payload) {
  const state = readState();
  const sequence = state.sequence + 1;
  const now = new Date().toISOString();
  const caseId = `CASE-20260629-${String(sequence).padStart(4, "0")}`;
  const assessmentId = `AST-20260629-${String(sequence).padStart(4, "0")}`;
  const submission = normalizeSubmission(payload?.submission ?? payload);
  const assessment = buildAssessment(submission);
  const actions = buildActions(assessment, submission);
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
      nextBookingMinutes: assessment.riskLevel === "high" ? 35 : 80,
      nextCustomerTier: "member",
      alternativeVehicleCount: assessment.riskLevel === "high" ? 2 : 1
    },
    history: buildHistory(submission),
    assessment,
    evidenceCards: buildEvidenceCards(submission, assessment),
    actions,
    auditTrail: [
      makeAudit(`${caseId}-submitted`, now, "customer", "return_submission_created", "租客於客戶端送出還車照片與備註。"),
      makeAudit(`${caseId}-precheck`, now, "ai", "client_precheck_completed", "AI pre-check 已產生補拍與補充說明提醒。"),
      makeAudit(`${caseId}-company`, now, "ai", "company_case_created", "公司端 demo store 已建立共享稽核案件。")
    ]
  };
  state.sequence = sequence;
  state.cases = [demoCase, ...state.cases].slice(0, 12);
  writeState(state);
  return demoCase;
}

export function patchCase(caseId, patch) {
  const state = readState();
  const index = state.cases.findIndex((item) => item.caseId === caseId);
  if (index < 0) return null;
  const now = new Date().toISOString();
  state.cases[index] = {
    ...state.cases[index],
    ...patch,
    updatedAt: now,
    auditTrail: [
      ...state.cases[index].auditTrail,
      makeAudit(`${caseId}-patch-${Date.now()}`, now, "ops", "case_updated", "公司端更新案件狀態。")
    ]
  };
  writeState(state);
  return state.cases[index];
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
    ? input.photoSlots
    : (input.photos ?? []).map((photo) => ({
        id: photo.id,
        angle: photo.angle,
        label: photo.label,
        status: photo.status,
        imageUrl: photo.imageUrl ?? photo.previewUrl ?? null,
        aiInspection: photo.aiInspection ?? null,
        aiRawResult: photo.aiRawResult ?? photo.aiInspectionRaw ?? null
      }));
  const damageNote = [input.damageNote, input.voiceNote, input.textNote].filter(Boolean).join("，");
  return {
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

function supportPhotoFromSlot(demoCase, slot) {
  const aiPhoto = slot.aiInspection ?? null;
  const rawResult = slot.aiRawResult ?? (aiPhoto ? { photos: [aiPhoto] } : null);
  const status = rawResult?.final_decision?.status ?? (aiPhoto?.retake_required ? "needs_retake" : aiPhoto ? "pass" : "pending");

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

function expectedViewFromAngle(angle) {
  if (angle === "front") return "front";
  if (angle === "rear") return "rear";
  return "any";
}

function buildAssessment(submission) {
  const text = `${submission.damageNote} ${submission.quickOptions.join(" ")}`;
  const hasDamage = /刮傷|擦傷|凹陷|右側|右前|保險桿/.test(text);
  const hasExisting = /原本就有|取車前|不是我|已經有/.test(text);
  const hasSafety = /胎壓|警示燈|故障燈|煞車/.test(text);
  const hasClean = /垃圾|髒|飲料|煙味|異味/.test(text);
  const riskScore = Math.min(100, (hasDamage ? 32 : 6) + (hasExisting ? 12 : 0) + (hasSafety ? 28 : 0) + (hasClean ? 10 : 0));
  const riskLevel = riskScore >= 60 ? "high" : riskScore >= 30 ? "medium" : "low";
  return {
    riskScore,
    riskLevel,
    status: hasSafety ? "hold" : riskLevel === "medium" ? "conditional" : "rentable",
    riskBreakdown: {
      damage: hasDamage ? 24 : 0,
      cleanliness: hasClean ? 8 : 0,
      energy: 0,
      safety: hasSafety ? 24 : 0,
      dispute: hasExisting ? 8 : 0
    },
    nextBookingDecision: riskLevel === "high" ? "reassign" : riskLevel === "medium" ? "delay" : "keep",
    dispatchPriority: riskLevel === "high" ? "high" : riskLevel === "medium" ? "medium" : "low",
    aiConfidence: hasExisting ? 0.78 : 0.91,
    confidence: hasExisting ? 0.78 : 0.91,
    manualReviewRequired: hasDamage || hasExisting || hasSafety,
    internalReasoning: hasDamage
      ? "租客描述包含右側/右前車身刮傷訊號，需比對照片、歷史工單與下一筆訂單時間。"
      : "未觸發主要車況風險規則。",
    customerSafeMessage: hasDamage
      ? "系統已收到您的車況說明，將提供營運人員後續覆核。若為取車前已存在，請補充時間、位置或可辨識描述。"
      : "還車紀錄已送出，系統初步檢查未發現需補拍項目。",
    customerSummary: hasDamage
      ? `您好，訂單 ${submission.orderId} 的還車資料已收到。系統會保留照片與備註紀錄，後續以人工覆核確認，不會在資訊不足時直接判定責任。`
      : `您好，訂單 ${submission.orderId} 已完成還車資料送出，系統將保留紀錄供後續查閱。`,
    internalSummary: `${submission.vehicleId} 共享 demo case 已建立，風險 ${riskScore}/100，建議 ${riskLevel === "high" ? "改派下一筆訂單並人工覆核" : riskLevel === "medium" ? "補拍/確認後再出租" : "保留下一筆訂單"}。`,
    validation: { valid: true, errors: [] }
  };
}

function buildActions(assessment) {
  const actions = [];
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
    makeEvidence("photo-uploaded", "photo", "info", "已接收還車照片", "客戶端照片狀態已寫入共享案件。", "客戶端還車流程", 0.82, "damage"),
    makeEvidence("voice-note-received", "voice", assessment.riskBreakdown.damage > 0 ? "warning" : "info", "已接收語音/文字備註", submission.damageNote || "租客未留下額外描述。", "租客備註", 0.78, "dispute"),
    makeEvidence("telematics-snapshot", "telematics", "info", "車聯網訊號快照", "能源 64%，胎壓正常，DTC 正常。", "車聯網訊號", 0.86, "safety"),
    makeEvidence("history-summary", "history", "info", "歷史工單摘要", "近期無未結維修工單；若同部位曾回報，需人工比對。", "歷史工單系統", 0.84, "dispute"),
    makeEvidence("ai-rule-policy", "policy", "info", "AI 規則判定", "系統依照片、備註、車聯網、歷史工單與下一筆訂單時間進行 deterministic 判讀。", "AI 決策規則", 0.9, "safety")
  ];
}

function makeEvidence(id, type, severity, title, description, source, confidence, relatedRiskCategory) {
  return { id, type, severity, title, description, source, confidence, relatedRiskCategory };
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

function makeAudit(id, time, actor, eventType, description) {
  return { id, time, actor, eventType, description };
}
