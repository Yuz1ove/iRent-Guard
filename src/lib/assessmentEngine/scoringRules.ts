import type {
  NormalizedReturnCase,
  RiskBreakdown,
  RiskBreakdownItem,
  RiskFormulaComponent,
  RiskScoreFormula,
  ScoreResult,
  VoiceKeywordHits
} from "../../types/assessment";
import { clamp } from "../formatters";

export const voiceKeywordRules: Record<keyof VoiceKeywordHits, string[]> = {
  damage: ["刮傷", "擦傷", "撞到", "凹陷", "保險桿", "車門", "燈殼", "破裂"],
  cleanliness: ["髒", "垃圾", "飲料", "煙味", "異味", "寵物毛", "嘔吐", "泥巴"],
  energy: ["沒電", "低電量", "快沒油", "油量低", "充電"],
  safety: ["胎壓", "警示燈", "故障燈", "煞車", "異音", "方向盤"],
  dispute: ["原本就", "不是我", "拿到車時", "上一個人", "已經有", "我沒有"]
};

interface ScoreRiskOptions {
  photoUploaded?: boolean;
}

export function scoreRisk(input: NormalizedReturnCase, options: ScoreRiskOptions = {}): ScoreResult {
  const keywordHits = extractVoiceKeywords(input.voiceNote);
  const categoryBreakdown = {
    damage: calculateDamage(input, keywordHits.damage),
    cleanliness: calculateCleanliness(input, keywordHits.cleanliness),
    energy: calculateEnergy(input, keywordHits.energy),
    safety: calculateSafety(input, keywordHits.safety),
    dispute: calculateDispute(input, keywordHits.dispute)
  };
  const lineItems = buildRiskLineItems(input, categoryBreakdown, keywordHits, options);
  const formula = buildRiskFormula(lineItems);
  const breakdown: RiskBreakdown = {
    ...categoryBreakdown,
    lineItems,
    formula,
    scoreDisclaimer: "Demo 模擬分數，非正式判責結果"
  };
  const totalRiskScore = formula.finalRisk;
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

function buildRiskLineItems(
  input: NormalizedReturnCase,
  breakdown: Pick<RiskBreakdown, "damage" | "cleanliness" | "energy" | "safety" | "dispute">,
  keywordHits: VoiceKeywordHits,
  options: ScoreRiskOptions
): RiskBreakdownItem[] {
  const items: RiskBreakdownItem[] = [
    makeRiskItem("base-review", "基礎流程檢核", "每筆還車案件都先建立公司端覆核紀錄與 evidence trail。", 6, "baseScore")
  ];
  const photoDamageFindings = input.photoFindings.filter((finding) =>
    ["scratch", "dent", "broken_light", "bumper"].includes(finding)
  );
  const cleanlinessFindings = input.photoFindings.filter((finding) =>
    ["trash", "smell", "spill"].includes(finding)
  );

  if (options.photoUploaded === false) {
    items.push(makeRiskItem("photo-missing", "照片缺漏", "客戶端照片未完整進入公司端覆核流程，需提高補拍優先序。", 20, "photoRisk"));
  }

  if (photoDamageFindings.length > 0 || input.history.repeatedDamageArea) {
    const description = [
      photoDamageFindings.length > 0 ? `車況標記包含 ${photoDamageFindings.join("、")}` : "",
      input.history.repeatedDamageArea ? `歷史重複區域：${input.history.repeatedDamageArea}` : ""
    ].filter(Boolean).join("；");
    items.push(makeRiskItem("photo-damage", "照片 / 車況損傷標記", description, calculateDamage(input, []), "photoRisk", "damage"));
  }

  if (keywordHits.damage.length > 0) {
    items.push(makeRiskItem(
      "note-damage-keywords",
      "損傷關鍵字",
      `備註命中「${keywordHits.damage.join("、")}」，公司端需比對照片與歷史紀錄。`,
      Math.min(25, 15 + keywordHits.damage.length * 5),
      "noteRisk",
      "damage"
    ));
  }

  if (breakdown.cleanliness > 0) {
    const cleanlinessText = cleanlinessFindings.length > 0
      ? `車況標記包含 ${cleanlinessFindings.join("、")}`
      : `備註命中「${keywordHits.cleanliness.join("、")}」`;
    items.push(makeRiskItem("cleanliness-risk", "髒污標記", cleanlinessText, Math.min(15, breakdown.cleanliness), "photoRisk", "cleanliness"));
  }

  if (breakdown.energy > 0) {
    items.push(makeRiskItem(
      "energy-risk",
      "能源 / 續航訊號",
      `能源 ${getEnergyPercent(input)}%，${keywordHits.energy.length > 0 ? `備註命中「${keywordHits.energy.join("、")}」` : "低於營運門檻"}`,
      breakdown.energy,
      "noteRisk",
      "energy"
    ));
  }

  if (breakdown.safety > 0) {
    const safetySignals = [
      input.telematics.tirePressureLow ? "胎壓低" : "",
      input.telematics.dtcWarning ? "DTC 警示" : "",
      input.telematics.locationConfidence < 0.7 ? "定位信心不足" : "",
      input.telematics.odometerDeltaKm > 160 ? "里程差異偏高" : "",
      keywordHits.safety.length > 0 ? `備註命中「${keywordHits.safety.join("、")}」` : ""
    ].filter(Boolean);
    items.push(makeRiskItem("safety-risk", "安全 / 車聯網警示", safetySignals.join("、"), breakdown.safety, "noteRisk", "safety"));
  }

  if (breakdown.dispute > 0) {
    const disputeSignals = [
      input.history.recentComplaints > 0 ? `近 30 天客訴 ${input.history.recentComplaints} 件` : "",
      input.history.unresolvedWorkOrders > 0 ? `未結工單 ${input.history.unresolvedWorkOrders} 件` : "",
      input.history.repeatedDamageArea ? `重複區域 ${input.history.repeatedDamageArea}` : "",
      keywordHits.dispute.length > 0 ? `備註命中「${keywordHits.dispute.join("、")}」` : ""
    ].filter(Boolean);
    items.push(makeRiskItem("dispute-risk", "爭議 / 歷史訊號", disputeSignals.join("、"), breakdown.dispute, "noteRisk", "dispute"));
  }

  const orderPressureRisk = calculateOrderPressureRisk(input.nextBookingMinutes);
  if (orderPressureRisk > 0) {
    items.push(makeRiskItem(
      "next-booking-pressure",
      "下一筆訂單壓力",
      `${input.nextBookingMinutes} 分鐘後有下一筆訂單，需保留調度緩衝。`,
      orderPressureRisk,
      "orderPressureRisk"
    ));
  }

  const mitigationScore = calculateMitigationScore(input, keywordHits);
  if (mitigationScore > 0) {
    items.push(makeRiskItem(
      "customer-clarification",
      "客戶補充說明",
      "備註提供取車前狀況或足夠細節，可降低直接升級派工的風險。",
      -mitigationScore,
      "mitigationScore",
      "dispute"
    ));
  }

  return items.filter((item) => item.points !== 0);
}

function buildRiskFormula(items: RiskBreakdownItem[]): RiskScoreFormula {
  const sum = (component: RiskFormulaComponent) =>
    items
      .filter((item) => item.component === component)
      .reduce((total, item) => total + Math.max(0, item.points), 0);
  const baseScore = sum("baseScore");
  const photoRisk = sum("photoRisk");
  const noteRisk = sum("noteRisk");
  const orderPressureRisk = sum("orderPressureRisk");
  const mitigationScore = items
    .filter((item) => item.component === "mitigationScore")
    .reduce((total, item) => total + Math.abs(Math.min(0, item.points)), 0);
  const rawScore = baseScore + photoRisk + noteRisk + orderPressureRisk - mitigationScore;
  const finalRisk = clamp(rawScore);
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

function calculateOrderPressureRisk(nextBookingMinutes: number) {
  if (nextBookingMinutes < 45) return 20;
  if (nextBookingMinutes < 60) return 15;
  if (nextBookingMinutes < 90) return 8;
  return 0;
}

function calculateMitigationScore(input: NormalizedReturnCase, keywordHits: VoiceKeywordHits) {
  let score = 0;
  const compactNote = input.voiceNote.replace(/\s+/g, "");
  if (compactNote.length >= 18) score += 5;
  if (keywordHits.dispute.length > 0) score += 5;
  return Math.min(10, score);
}

function makeRiskItem(
  id: string,
  label: string,
  description: string,
  points: number,
  component: RiskFormulaComponent,
  category?: RiskBreakdownItem["category"]
): RiskBreakdownItem {
  return { id, label, description, points, component, category };
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
