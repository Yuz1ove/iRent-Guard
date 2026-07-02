import { mockReturnCases } from "./mockReturnCases";
import type { ClientPhoto, ClientPhotoAngle, ClientReturnSubmission } from "../types/client";
import type { ReturnCase } from "../types/returnCase";

export const photoAngleLabels: Record<ClientPhotoAngle, string> = {
  front: "車頭",
  rear: "車尾",
  left: "左側",
  right: "右側",
  interior: "車內座椅",
  dashboard: "儀表板/油量或電量"
};

export const requiredPhotoAngles = Object.keys(photoAngleLabels) as ClientPhotoAngle[];

export const defaultClientSubmission: ClientReturnSubmission = returnCaseToClientSubmission(mockReturnCases[3]);

export function returnCaseToClientSubmission(returnCase: ReturnCase): ClientReturnSubmission {
  return {
    submissionId: `SUB-${returnCase.orderId}`,
    orderId: returnCase.orderId,
    vehicleId: returnCase.vehicleId,
    vehicleType: returnCase.vehicleType,
    vehicleModel: returnCase.model,
    returnStation: returnCase.location,
    returnTime: "2026-06-29T10:12",
    submittedAt: "2026-06-29T10:12:00+08:00",
    photos: requiredPhotoAngles.map((angle) => buildClientPhoto(angle, returnCase)),
    voiceNote: returnCase.voiceNote,
    textNote: "",
    quickNotes: [],
    clientAcknowledgement: true
  };
}

export function buildEmptySubmission(): ClientReturnSubmission {
  return {
    ...defaultClientSubmission,
    submissionId: "SUB-RT-260629-DEMO",
    orderId: "RT-260629-DEMO",
    vehicleId: "IR-7712",
    vehicleModel: "Toyota Altis",
    returnStation: "台南小西門站",
    returnTime: "2026-06-29T10:12",
    submittedAt: "",
    photos: requiredPhotoAngles.map((angle) => ({
      id: `photo-${angle}`,
      angle,
      label: photoAngleLabels[angle],
      status: "missing"
    })),
    voiceNote: "",
    textNote: "",
    quickNotes: [],
    clientAcknowledgement: false
  };
}

function buildClientPhoto(angle: ClientPhotoAngle, returnCase: ReturnCase): ClientPhoto {
  const hasRightDamage = angle === "right" && returnCase.photoFindings.some((item) => ["scratch", "bumper", "dent"].includes(item));
  const hasInteriorIssue = angle === "interior" && returnCase.photoFindings.some((item) => ["trash", "spill", "smell"].includes(item));
  return {
    id: `${returnCase.id}-${angle}`,
    angle,
    label: photoAngleLabels[angle],
    status: hasRightDamage ? "retake_required" : hasInteriorIssue ? "passed" : "passed",
    aiHint: hasRightDamage ? "建議補拍右前方與右側車身細節" : undefined
  };
}
