import type { ClientPhoto, ClientPhotoAngle, ClientReturnSubmission } from "../types/client";
import type { FinalPhotoInspectionResult } from "../types/photoInspection";

export type SubmitBlockerCode =
  | "missing_photos"
  | "checking_photos"
  | "retake_required"
  | "ai_check_failed"
  | "manual_review_required"
  | "acknowledgement_required";

export interface SubmitBlocker {
  code: SubmitBlockerCode;
  angles: ClientPhotoAngle[];
  message: string;
  reasons: string[];
  canOverrideWithManualReview: boolean;
}

export function getSubmitBlockers(submission: ClientReturnSubmission): SubmitBlocker[] {
  const blockers: SubmitBlocker[] = [];
  const missing = requiredPhotos(submission).filter((photo) => photo.status === "missing").map((photo) => photo.angle);
  const checking = requiredPhotos(submission)
    .filter((photo) => photo.status === "checking" || photo.status === "compressing")
    .map((photo) => photo.angle);
  const retakePhotos = requiredPhotos(submission).filter((photo) => photo.status === "retake_required");
  const failedPhotos = requiredPhotos(submission).filter((photo) => photo.status === "failed" || photo.status === "uploaded" || hasUnverifiedPass(photo));

  if (missing.length > 0) {
    blockers.push({
      code: "missing_photos",
      angles: missing,
      message: "缺少必要照片，請補齊後再送出。",
      reasons: [],
      canOverrideWithManualReview: false
    });
  }

  if (checking.length > 0) {
    blockers.push({
      code: "checking_photos",
      angles: checking,
      message: "AI 檢核尚未完成，請等待所有照片完成檢核。",
      reasons: [],
      canOverrideWithManualReview: false
    });
  }

  if (retakePhotos.length > 0) {
    blockers.push({
      code: "retake_required",
      angles: retakePhotos.map((photo) => photo.angle),
      message: "仍有照片需要補拍，預設不可直接送出。",
      reasons: retakePhotos.flatMap((photo) => photoRetakeReasons(photo)),
      canOverrideWithManualReview: true
    });
  }

  if (failedPhotos.length > 0) {
    blockers.push({
      code: "ai_check_failed",
      angles: failedPhotos.map((photo) => photo.angle),
      message: "有照片尚未取得正式 AI 檢核結果，請重新檢核或送客服人工覆核。",
      reasons: failedPhotos.map((photo) => photo.errorMessage || photo.aiHint || "尚未取得正式 AI 判定。"),
      canOverrideWithManualReview: true
    });
  }

  const unverified = requiredPhotos(submission).filter(photo => ["manual_review", "needs_manual_review", "ai_unavailable"].includes(photo.status));
  if (unverified.length) blockers.push({code:"manual_review_required",angles:unverified.map(photo=>photo.angle),message:"照片內容或車輛角度尚未確認，不能當作通過；請補拍或明確送人工覆核。",reasons:unverified.map(photo=>photo.aiInspection?.customer_message || photo.aiHint || "照片內容尚未確認"),canOverrideWithManualReview:true});

  if (!submission.clientAcknowledgement) {
    blockers.push({
      code: "acknowledgement_required",
      angles: [],
      message: "請先勾選確認已依 App 指示完成還車照片與備註。",
      reasons: [],
      canOverrideWithManualReview: false
    });
  }

  return blockers;
}

export function getSubmitReadyCount(submission: ClientReturnSubmission) {
  return requiredPhotos(submission).filter((photo) => (photo.status === "passed" && !hasUnverifiedPass(photo)) || (photo.status === "demo_replay" && isDemoReplayResult(photo.aiInspectionRaw))).length;
}

export function getHardSubmitBlockers(blockers: SubmitBlocker[]) {
  return blockers.filter((blocker) => !blocker.canOverrideWithManualReview);
}

export function getManualReviewSubmitBlockers(blockers: SubmitBlocker[]) {
  return blockers.filter((blocker) => blocker.canOverrideWithManualReview);
}

function requiredPhotos(submission: ClientReturnSubmission) {
  return submission.photos.filter((photo) => !photo.id.startsWith("support-"));
}

function hasUnverifiedPass(photo: ClientPhoto) {
  if (isDemoReplayResult(photo.aiInspectionRaw)) return false;
  const inspected = photo.aiInspection;
  return photo.status === "passed" && (!isFormalAiResult(photo.aiInspectionRaw) || photo.aiInspectionRaw?.ai_meta?.source === "local-detector" || !inspected?.is_vehicle_visible || !inspected.photo_quality?.is_clear_enough || inspected.expected_view_match !== "yes" || inspected.retake_required || photo.aiInspectionRaw?.needs_manual_review === true);
}

function isFormalAiResult(result: FinalPhotoInspectionResult | null | undefined) {
  const source = result?.ai_meta?.source;
  const responseId = result?.ai_meta?.responseId;
  return (source === "school-relay" || source === "openai" || source === "local-detector") && typeof responseId === "string" && responseId.length > 0;
}

function isDemoReplayResult(result: FinalPhotoInspectionResult | null | undefined) {
  return result?.ai_meta?.resultKind === "demo_replay" || result?.ai_meta?.source === "demo_replay";
}

function photoRetakeReasons(photo: ClientPhoto) {
  const reasons = [
    ...(photo.aiInspection?.retake_reasons ?? []),
    photo.aiInspection?.customer_message,
    photo.errorMessage,
    photo.aiHint
  ].filter((reason): reason is string => Boolean(reason?.trim()));

  return Array.from(new Set(reasons));
}
