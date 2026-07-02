import type { VehicleType } from "./returnCase";
import type { AiSinglePhotoInspection, FinalPhotoInspectionResult } from "./photoInspection";

export type ClientPhotoAngle = "front" | "rear" | "left" | "right" | "interior" | "dashboard";
export type ClientPhotoStatus = "missing" | "uploaded" | "checking" | "passed" | "retake_required";

export interface ClientPhoto {
  id: string;
  angle: ClientPhotoAngle;
  label: string;
  previewUrl?: string;
  imageUrl?: string;
  status: ClientPhotoStatus;
  aiHint?: string;
  aiInspection?: AiSinglePhotoInspection | null;
  aiInspectionRaw?: FinalPhotoInspectionResult | null;
}

export interface ClientReturnSubmission {
  submissionId: string;
  orderId: string;
  vehicleId: string;
  vehicleType: VehicleType;
  vehicleModel: string;
  returnStation: string;
  returnTime: string;
  submittedAt: string;
  photos: ClientPhoto[];
  voiceNote: string;
  textNote: string;
  quickNotes: string[];
  clientAcknowledgement: boolean;
}

export interface ClientPreCheck {
  missingPhotoAngles: ClientPhotoAngle[];
  retakePhotoAngles: ClientPhotoAngle[];
  needsMoreNote: boolean;
  highRiskDescriptions: string[];
  manualReviewSuggested: boolean;
  canSubmit: boolean;
  hints: string[];
  statusLabel: string;
}
