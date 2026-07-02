import type { ClientPhotoAngle, ClientPreCheck, ClientReturnSubmission } from "../../types/client";

const requiredAngles: ClientPhotoAngle[] = ["front", "rear", "left", "right", "interior", "dashboard"];

export function normalizeClientSubmission(input: ClientReturnSubmission): ClientReturnSubmission {
  const photos = requiredAngles.map((angle) => {
    const existing = input.photos.find((photo) => photo.angle === angle);
    return {
      id: existing?.id ?? `photo-${angle}`,
      angle,
      label: existing?.label ?? angle,
      previewUrl: existing?.previewUrl,
      status: existing?.status ?? "missing",
      aiHint: existing?.aiHint
    };
  });

  return {
    ...input,
    submissionId: input.submissionId || `SUB-${input.orderId || "DRAFT"}`,
    orderId: input.orderId.trim(),
    vehicleId: input.vehicleId.trim(),
    vehicleModel: input.vehicleModel.trim(),
    returnStation: input.returnStation.trim(),
    voiceNote: input.voiceNote.trim(),
    textNote: input.textNote.trim(),
    quickNotes: input.quickNotes.filter(Boolean),
    photos
  };
}

export function clientPreCheck(input: ClientReturnSubmission): ClientPreCheck {
  const submission = normalizeClientSubmission(input);
  const note = `${submission.voiceNote} ${submission.textNote} ${submission.quickNotes.join(" ")}`;
  const compactNote = note.replace(/\s+/g, "");
  const missingPhotoAngles = submission.photos.filter((photo) => photo.status === "missing").map((photo) => photo.angle);
  const retakePhotoAngles = new Set<ClientPhotoAngle>(
    submission.photos.filter((photo) => photo.status === "retake_required").map((photo) => photo.angle)
  );
  const highRiskDescriptions: string[] = [];

  if (/(右側|右前|右邊|右車身|右前方).*(刮傷|擦傷|保險桿|凹|撞)|(?:刮傷|擦傷).*(右側|右前|右邊|右車身|右前方)/.test(compactNote)) {
    retakePhotoAngles.add("right");
    highRiskDescriptions.push("備註提到右側或右前方車身可能有刮傷");
  }
  if (/(刮傷|擦傷|凹陷|撞|保險桿)/.test(compactNote)) highRiskDescriptions.push("備註提到外觀車損");
  if (/(胎壓|警示燈|故障燈|煞車|異音)/.test(compactNote)) highRiskDescriptions.push("備註提到安全或警示訊號");
  if (/(垃圾|髒|飲料|煙味|異味)/.test(compactNote)) highRiskDescriptions.push("備註提到車內清潔狀態");
  if (/(原本就|拿到車時|不是我|已經有)/.test(compactNote)) highRiskDescriptions.push("備註提到取車前可能已存在的狀況");

  const mentionsExistingCondition = highRiskDescriptions.some((item) => item.includes("取車前"));
  const needsMoreNote = mentionsExistingCondition || (highRiskDescriptions.length > 0 && compactNote.length < 16);
  const manualReviewSuggested = highRiskDescriptions.some((item) => item.includes("安全") || item.includes("取車前")) || retakePhotoAngles.size > 0;
  const hints = buildHints(missingPhotoAngles, [...retakePhotoAngles], highRiskDescriptions, needsMoreNote);
  return {
    missingPhotoAngles,
    retakePhotoAngles: [...retakePhotoAngles],
    needsMoreNote,
    highRiskDescriptions: [...new Set(highRiskDescriptions)],
    manualReviewSuggested,
    canSubmit: missingPhotoAngles.length === 0 && submission.clientAcknowledgement,
    hints,
    statusLabel: retakePhotoAngles.size > 0 ? "建議補拍" : highRiskDescriptions.length > 0 ? "已記錄，將提供覆核" : "初步檢查完成"
  };
}

function buildHints(
  missingPhotoAngles: ClientPhotoAngle[],
  retakePhotoAngles: ClientPhotoAngle[],
  highRiskDescriptions: string[],
  needsMoreNote: boolean
) {
  const hints: string[] = [];
  if (missingPhotoAngles.length > 0) hints.push(`尚有 ${missingPhotoAngles.length} 張必要照片未完成，請補齊後再送出。`);
  if (retakePhotoAngles.includes("right")) hints.push("系統偵測到可能需要補充照片，建議您再拍攝右前方或右側車身。");
  if (retakePhotoAngles.some((angle) => angle !== "right")) hints.push("部分照片清晰度或角度可能不足，建議補拍後再送出。");
  if (needsMoreNote) hints.push("若車況為取車前已存在，請於備註中補充時間、位置或可辨識描述。");
  if (highRiskDescriptions.length > 0) hints.push("此紀錄將提供營運人員後續覆核。");
  if (hints.length === 0) hints.push("AI 初步檢查未發現需補拍項目，您可以送出還車紀錄。");
  return hints;
}
