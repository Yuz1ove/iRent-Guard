import type { NormalizedReturnCase, ReturnCase, ValidationResult } from "../../types/assessment";

const fallbackTelematics = {
  tirePressureLow: false,
  dtcWarning: false,
  odometerDeltaKm: 0,
  locationConfidence: 1
};

const fallbackHistory = {
  recentComplaints: 0,
  unresolvedWorkOrders: 0
};

export function normalizeReturnInput(input: ReturnCase): NormalizedReturnCase {
  const nextBookingMinutes = Number.isFinite(Number(input.nextBookingMinutes))
    ? Math.max(0, Math.round(Number(input.nextBookingMinutes)))
    : 999;

  return {
    ...input,
    id: String(input.id || input.orderId || "draft-case"),
    scenarioName: String(input.scenarioName || "未命名情境"),
    orderId: String(input.orderId || "").trim(),
    vehicleId: String(input.vehicleId || "").trim(),
    vehicleType: input.vehicleType || "car",
    model: String(input.model || "未提供車型").trim(),
    location: String(input.location || "").trim(),
    nextBookingMinutes,
    photoFindings: Array.isArray(input.photoFindings) ? input.photoFindings.filter(Boolean) : [],
    voiceNote: String(input.voiceNote || "").trim(),
    telematics: {
      ...fallbackTelematics,
      ...(input.telematics ?? {}),
      batteryPercent: normalizeOptionalPercent(input.telematics?.batteryPercent),
      fuelPercent: normalizeOptionalPercent(input.telematics?.fuelPercent),
      odometerDeltaKm: Math.max(0, Number(input.telematics?.odometerDeltaKm ?? 0)),
      locationConfidence: normalizeConfidence(input.telematics?.locationConfidence)
    },
    history: {
      ...fallbackHistory,
      ...(input.history ?? {}),
      recentComplaints: Math.max(0, Number(input.history?.recentComplaints ?? 0)),
      unresolvedWorkOrders: Math.max(0, Number(input.history?.unresolvedWorkOrders ?? 0)),
      repeatedDamageArea: input.history?.repeatedDamageArea?.trim() || undefined
    }
  };
}

export function validateReturnCase(input: ReturnCase): ValidationResult {
  const errors: string[] = [];
  if (!input.orderId?.trim()) errors.push("缺少訂單編號 orderId");
  if (!input.vehicleId?.trim()) errors.push("缺少車輛編號 vehicleId");
  if (!input.location?.trim()) errors.push("缺少還車地點 location");
  if (!Number.isFinite(Number(input.nextBookingMinutes))) errors.push("下一筆訂單時間 nextBookingMinutes 需為數字");
  if (!input.telematics) {
    errors.push("缺少車聯網資料 telematics");
  } else {
    if (!Number.isFinite(Number(input.telematics.odometerDeltaKm))) errors.push("缺少或無法解析里程差 odometerDeltaKm");
    if (!Number.isFinite(Number(input.telematics.locationConfidence))) errors.push("缺少或無法解析定位信心 locationConfidence");
  }
  return { valid: errors.length === 0, errors };
}

function normalizeOptionalPercent(value: number | undefined) {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return undefined;
  return Math.max(0, Math.min(100, Math.round(Number(value))));
}

function normalizeConfidence(value: number | undefined) {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.min(1, Number(value)));
}
