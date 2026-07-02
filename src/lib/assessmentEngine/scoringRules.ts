import type { NormalizedReturnCase, RiskBreakdown, ScoreResult, VoiceKeywordHits } from "../../types/assessment";
import { clamp } from "../formatters";

export const voiceKeywordRules: Record<keyof VoiceKeywordHits, string[]> = {
  damage: ["刮傷", "擦傷", "撞到", "凹陷", "保險桿", "車門", "燈殼", "破裂"],
  cleanliness: ["髒", "垃圾", "飲料", "煙味", "異味", "寵物毛", "嘔吐", "泥巴"],
  energy: ["沒電", "低電量", "快沒油", "油量低", "充電"],
  safety: ["胎壓", "警示燈", "故障燈", "煞車", "異音", "方向盤"],
  dispute: ["原本就", "不是我", "拿到車時", "上一個人", "已經有", "我沒有"]
};

export function scoreRisk(input: NormalizedReturnCase): ScoreResult {
  const keywordHits = extractVoiceKeywords(input.voiceNote);
  const breakdown: RiskBreakdown = {
    damage: calculateDamage(input, keywordHits.damage),
    cleanliness: calculateCleanliness(input, keywordHits.cleanliness),
    energy: calculateEnergy(input, keywordHits.energy),
    safety: calculateSafety(input, keywordHits.safety),
    dispute: calculateDispute(input, keywordHits.dispute)
  };
  const totalRiskScore = clamp(
    breakdown.damage + breakdown.cleanliness + breakdown.energy + breakdown.safety + breakdown.dispute
  );
  const reasons = buildReasons(input, breakdown, keywordHits);
  const confidence = calculateConfidence(input, breakdown, keywordHits);
  return { breakdown, totalRiskScore, keywordHits, confidence, reasons };
}

export function extractVoiceKeywords(voiceNote: string): VoiceKeywordHits {
  const normalized = voiceNote.replace(/\s+/g, "");
  return {
    damage: voiceKeywordRules.damage.filter((keyword) => normalized.includes(keyword)),
    cleanliness: voiceKeywordRules.cleanliness.filter((keyword) => normalized.includes(keyword)),
    energy: voiceKeywordRules.energy.filter((keyword) => normalized.includes(keyword)),
    safety: voiceKeywordRules.safety.filter((keyword) => normalized.includes(keyword)),
    dispute: voiceKeywordRules.dispute.filter((keyword) => normalized.includes(keyword))
  };
}

function calculateDamage(input: NormalizedReturnCase, voiceHits: string[]) {
  let score = 0;
  if (hasFinding(input, "scratch")) score += 12;
  if (hasFinding(input, "dent")) score += 18;
  if (hasFinding(input, "broken_light")) score += 25;
  if (hasFinding(input, "bumper")) score += 16;
  if (voiceHits.length > 0) score += Math.min(10, 5 + voiceHits.length * 2);
  if (input.history.repeatedDamageArea) score += 3;
  return clamp(score, 0, 30);
}

function calculateCleanliness(input: NormalizedReturnCase, voiceHits: string[]) {
  let score = 0;
  if (hasFinding(input, "trash")) score += 8;
  if (hasFinding(input, "smell")) score += 10;
  if (hasFinding(input, "spill")) score += 12;
  if (voiceHits.length > 0) score += Math.min(8, 4 + voiceHits.length);
  return clamp(score, 0, 15);
}

function calculateEnergy(input: NormalizedReturnCase, voiceHits: string[]) {
  const energy = getEnergyPercent(input);
  let score = 0;
  if (energy <= 8) score += 20;
  else if (energy < 20) score += 15;
  else if (energy < 35) score += 8;
  if (voiceHits.length > 0) score += Math.min(7, 4 + voiceHits.length);
  return clamp(score, 0, 20);
}

function calculateSafety(input: NormalizedReturnCase, voiceHits: string[]) {
  let score = 0;
  if (input.telematics.tirePressureLow) score += 20;
  if (input.telematics.dtcWarning) score += 25;
  if (input.telematics.locationConfidence < 0.7) score += 8;
  if (input.telematics.odometerDeltaKm > 160) score += 8;
  if (voiceHits.length > 0) score += Math.min(8, 5 + voiceHits.length);
  return clamp(score, 0, 25);
}

function calculateDispute(input: NormalizedReturnCase, voiceHits: string[]) {
  let score = 0;
  if (input.history.recentComplaints > 0) score += Math.min(5, input.history.recentComplaints * 2);
  if (input.history.unresolvedWorkOrders > 0) score += Math.min(4, input.history.unresolvedWorkOrders * 2);
  if (input.history.repeatedDamageArea) score += 3;
  if (voiceHits.length > 0) score += Math.min(6, 3 + voiceHits.length);
  return clamp(score, 0, 10);
}

function calculateConfidence(input: NormalizedReturnCase, breakdown: RiskBreakdown, keywordHits: VoiceKeywordHits) {
  let confidence = 0.92;
  if (input.telematics.locationConfidence < 0.7) confidence -= 0.14;
  if (input.history.unresolvedWorkOrders > 0) confidence -= 0.08;
  if (input.history.repeatedDamageArea) confidence -= 0.06;
  if (keywordHits.dispute.length > 0) confidence -= 0.08;
  if (hasVoicePhotoContradiction(input, keywordHits)) confidence -= 0.12;
  if (breakdown.dispute >= 8) confidence -= 0.04;
  return Math.round(clamp(confidence, 0.48, 0.98) * 100) / 100;
}

function buildReasons(input: NormalizedReturnCase, breakdown: RiskBreakdown, keywordHits: VoiceKeywordHits) {
  const reasons: string[] = [];
  if (breakdown.damage > 0) reasons.push("外觀車損訊號");
  if (breakdown.cleanliness > 0) reasons.push("清潔狀態需處理");
  if (breakdown.energy > 0) reasons.push("能源低於營運門檻");
  if (input.telematics.tirePressureLow || input.telematics.dtcWarning) reasons.push("安全車聯網警示");
  if (keywordHits.dispute.length > 0 || input.history.unresolvedWorkOrders > 0) reasons.push("責任歸屬需人工比對");
  if (input.nextBookingMinutes < 60) reasons.push("下一筆訂單接近");
  return reasons;
}

export function hasVoicePhotoContradiction(input: NormalizedReturnCase, keywordHits: VoiceKeywordHits) {
  const mentionsDamage = keywordHits.damage.length > 0;
  const photoHasDamage = input.photoFindings.some((finding) =>
    ["scratch", "dent", "broken_light", "bumper"].includes(finding)
  );
  return mentionsDamage !== photoHasDamage && (mentionsDamage || photoHasDamage);
}

export function getEnergyPercent(input: NormalizedReturnCase) {
  return input.telematics.batteryPercent ?? input.telematics.fuelPercent ?? 100;
}

function hasFinding(input: NormalizedReturnCase, target: string) {
  return input.photoFindings.includes(target);
}
