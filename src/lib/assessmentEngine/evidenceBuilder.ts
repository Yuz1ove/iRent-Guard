import type { EvidenceCard, NormalizedReturnCase, RiskCategory, ScoreResult } from "../../types/assessment";
import { getEnergyPercent, hasVoicePhotoContradiction } from "./scoringRules";

export function buildEvidenceCards(input: NormalizedReturnCase, scoreResult: ScoreResult, photoUploaded = false) {
  const cards: EvidenceCard[] = [];

  if (photoUploaded) {
    cards.push(makeCard("photo-uploaded", "photo", "info", "已接收還車照片", "AI 已將本次照片納入前端模擬判讀；原型不會上傳伺服器。", "租客還車照片", 0.82, "damage"));
  }
  if (input.voiceNote) {
    cards.push(makeCard("voice-note-received", "voice", "info", "已接收語音/文字備註", "租客提供的車況描述已納入初步整理，後續以中立方式提供營運人員覆核。", "租客語音/文字備註", 0.78, "dispute"));
  }
  cards.push(
    makeCard(
      "telematics-snapshot",
      "telematics",
      "info",
      "車聯網訊號快照",
      `能源 ${getEnergyPercent(input)}%，胎壓${input.telematics.tirePressureLow ? "異常" : "正常"}，DTC ${input.telematics.dtcWarning ? "有警示" : "正常"}。`,
      "車聯網訊號",
      0.86,
      "safety"
    )
  );
  cards.push(
    makeCard(
      "history-summary",
      "history",
      input.history.unresolvedWorkOrders > 0 || input.history.repeatedDamageArea ? "warning" : "info",
      "歷史工單摘要",
      `近期待處理工單 ${input.history.unresolvedWorkOrders} 筆，近期客服紀錄 ${input.history.recentComplaints} 筆${input.history.repeatedDamageArea ? `，重複區域為 ${input.history.repeatedDamageArea}` : ""}。`,
      "歷史工單系統",
      0.84,
      "dispute"
    )
  );
  cards.push(makeCard("ai-rule-policy", "policy", "info", "AI 規則判定", "系統依照片、備註、車聯網、歷史工單與下一筆訂單時間進行 deterministic 判讀。", "AI 決策規則", 0.9, "safety"));

  input.photoFindings.forEach((finding) => cards.push(photoFindingToEvidence(finding)));
  Object.entries(scoreResult.keywordHits).forEach(([category, hits]) => {
    if (hits.length === 0) return;
    cards.push(
      makeCard(
        `voice-${category}`,
        "voice",
        category === "dispute" ? "warning" : "info",
        "語音備註觸發風險關鍵字",
        `備註包含「${hits.join("、")}」，已納入${riskCategoryLabel(category as RiskCategory)}評分。`,
        "租客語音轉文字",
        0.78,
        category as RiskCategory
      )
    );
  });

  const energy = getEnergyPercent(input);
  if (energy < 35) {
    cards.push(
      makeCard(
        "energy-low",
        "telematics",
        energy < 20 ? "warning" : "info",
        "能源低於營運門檻",
        `目前能源約 ${energy}% ，會影響下一筆訂單可用性。`,
        "車聯網能源訊號",
        0.88,
        "energy"
      )
    );
  }
  if (input.telematics.tirePressureLow) {
    cards.push(makeCard("tire-pressure", "telematics", "critical", "胎壓異常強制暫停", "車聯網回報胎壓低於安全門檻，車輛不可直接交付下一位租客。", "TPMS 胎壓訊號", 0.93, "safety"));
  }
  if (input.telematics.dtcWarning) {
    cards.push(makeCard("dtc", "telematics", "critical", "DTC / 故障燈警示", "偵測到故障警示，需建立維修工單並下架或暫停出租。", "車聯網 DTC 訊號", 0.91, "safety"));
  }
  if (input.telematics.locationConfidence < 0.7) {
    cards.push(makeCard("location-confidence", "telematics", "warning", "還車位置信心不足", `定位信心 ${Math.round(input.telematics.locationConfidence * 100)}%，建議人工覆核車輛實際位置。`, "GPS / 站點比對", 0.66, "dispute"));
  }
  if (input.telematics.odometerDeltaKm > 160) {
    cards.push(makeCard("odometer-delta", "telematics", "warning", "里程差異偏高", `本趟里程 ${Math.round(input.telematics.odometerDeltaKm)} km，超出一般短租行程，建議比對訂單紀錄。`, "里程計訊號", 0.74, "safety"));
  }
  if (input.history.unresolvedWorkOrders > 0) {
    cards.push(makeCard("unresolved-work-orders", "history", "warning", "存在未結歷史工單", `同車仍有 ${input.history.unresolvedWorkOrders} 筆未結工單，不宜直接判定租客責任。`, "歷史工單系統", 0.86, "dispute"));
  }
  if (input.history.repeatedDamageArea) {
    cards.push(makeCard("repeat-area", "history", "warning", "同部位重複回報", `${input.history.repeatedDamageArea} 近期已有紀錄，需比對歷史照片與工單。`, "歷史工單系統", 0.84, "dispute"));
  }
  if (hasVoicePhotoContradiction(input, scoreResult.keywordHits)) {
    cards.push(makeCard("voice-photo-mismatch", "policy", "warning", "照片與語音訊號不一致", "照片偵測與租客描述未完全對齊，系統建議人工覆核後再做責任判斷。", "AI 覆核政策", 0.62, "dispute"));
  }
  if (cards.length === 0) {
    cards.push(makeCard("all-clear", "policy", "info", "未觸發主要風險規則", "照片、語音、車聯網與歷史紀錄皆未達派工門檻。", "AI 決策規則", 0.9, "safety"));
  }
  return cards;
}

function photoFindingToEvidence(finding: string): EvidenceCard {
  const map: Record<string, EvidenceCard> = {
    scratch: makeCard("scratch", "photo", "warning", "照片疑似偵測外觀刮傷", "車身外觀出現刮痕訊號，建議與前次照片交叉比對。", "照片車損模型", 0.79, "damage"),
    dent: makeCard("dent", "photo", "warning", "照片疑似偵測凹陷", "外觀凹陷可能影響責任判定，建議人工覆核。", "照片車損模型", 0.82, "damage"),
    broken_light: makeCard("broken-light", "photo", "critical", "燈殼破損風險", "燈具破損屬高風險安全項目，系統建議強制下架。", "照片車損模型", 0.86, "safety"),
    bumper: makeCard("bumper", "photo", "warning", "保險桿區域異常", "保險桿區域可能有擦撞或刮傷，需要補拍與人工確認。", "照片車損模型", 0.78, "damage"),
    trash: makeCard("trash", "photo", "warning", "車內垃圾或髒污", "車內清潔狀態不佳，建議清潔後再出租。", "車內照片模型", 0.8, "cleanliness"),
    smell: makeCard("smell", "voice", "warning", "異味或煙味回報", "租客備註或歷史紀錄顯示異味風險，需清潔確認。", "語音備註", 0.72, "cleanliness"),
    spill: makeCard("spill", "photo", "warning", "飲料灑出或液體汙損", "內裝清潔風險較高，建議派工清潔並檢查座椅。", "車內照片模型", 0.83, "cleanliness")
  };
  return map[finding] ?? makeCard(finding, "policy", "info", "其他車況訊號", `${finding} 已納入 AI 檢核。`, "AI 決策規則", 0.7, "damage");
}

function makeCard(
  id: string,
  type: EvidenceCard["type"],
  severity: EvidenceCard["severity"],
  title: string,
  description: string,
  source: string,
  confidence: number,
  relatedRiskCategory: RiskCategory
): EvidenceCard {
  return { id, type, severity, title, description, source, confidence, relatedRiskCategory };
}

function riskCategoryLabel(category: RiskCategory) {
  const labels: Record<RiskCategory, string> = {
    damage: "外觀/車損",
    cleanliness: "清潔",
    energy: "能源",
    safety: "安全",
    dispute: "爭議"
  };
  return labels[category];
}
