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
  const hasAngleDamage = hasDamageForAngle(angle, returnCase);
  const hasInteriorIssue = angle === "interior" && returnCase.photoFindings.some((item) => ["trash", "spill", "smell"].includes(item));
  return {
    id: `${returnCase.id}-${angle}`,
    angle,
    label: photoAngleLabels[angle],
    imageUrl: buildMockPhotoDataUrl(angle, returnCase),
    status: hasAngleDamage ? "retake_required" : hasInteriorIssue ? "passed" : "passed",
    aiHint: hasAngleDamage ? `建議補拍${photoAngleLabels[angle]}細節` : undefined
  };
}

function buildMockPhotoDataUrl(angle: ClientPhotoAngle, returnCase: ReturnCase) {
  const issueLabel = mockPhotoIssueLabel(angle, returnCase);
  const plate = escapeSvg(returnCase.vehicleId);
  const title = escapeSvg(photoAngleLabels[angle]);
  const issue = escapeSvg(issueLabel);
  const accent = issueLabel === "檢核正常" ? "#079669" : issueLabel === "需補拍" ? "#b45309" : "#e60012";
  const surface = angle === "interior" || angle === "dashboard" ? "#f7f8fb" : "#eef4f8";
  const scene = buildMockPhotoScene(angle, returnCase, accent);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${surface}"/>
          <stop offset="1" stop-color="#ffffff"/>
        </linearGradient>
      </defs>
      <rect width="480" height="360" rx="26" fill="url(#bg)"/>
      <rect x="34" y="34" width="412" height="246" rx="22" fill="#ffffff" stroke="#dbe3ec" stroke-width="3"/>
      ${scene}
      <rect x="34" y="294" width="412" height="38" rx="12" fill="#ffffff" stroke="#dbe3ec" stroke-width="2"/>
      <circle cx="60" cy="313" r="8" fill="${accent}"/>
      <text x="80" y="320" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="#1f2933">${title}</text>
      <text x="420" y="320" text-anchor="end" font-family="Arial, sans-serif" font-size="20" font-weight="800" fill="${accent}">${issue}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildMockPhotoScene(angle: ClientPhotoAngle, returnCase: ReturnCase, accent: string) {
  const plate = escapeSvg(returnCase.vehicleId);
  if (angle === "front") return buildFrontScene(plate);
  if (angle === "rear") return buildRearScene(plate);
  if (angle === "left" || angle === "right") return buildSideScene(angle, plate, hasDamageForAngle(angle, returnCase), accent);
  if (angle === "interior") return buildInteriorScene(hasInteriorProblem(returnCase), accent);
  return buildDashboardScene(returnCase, accent);
}

function buildFrontScene(plate: string) {
  return `
    <path d="M116 218h248l-28-72c-6-15-20-25-36-25H180c-16 0-30 10-36 25l-28 72Z" fill="#dfe7ef" stroke="#718096" stroke-width="5"/>
    <path d="M166 154h148l18 48H148l18-48Z" fill="#f8fafc" stroke="#a0aec0" stroke-width="4"/>
    <rect x="120" y="203" width="58" height="24" rx="12" fill="#fff3c4" stroke="#d69e2e" stroke-width="3"/>
    <rect x="302" y="203" width="58" height="24" rx="12" fill="#fff3c4" stroke="#d69e2e" stroke-width="3"/>
    <circle cx="158" cy="236" r="20" fill="#1f2933"/>
    <circle cx="322" cy="236" r="20" fill="#1f2933"/>
    <rect x="194" y="225" width="92" height="28" rx="6" fill="#ffffff" stroke="#9aa5b1" stroke-width="3"/>
    <text x="240" y="245" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#1f2933">${plate}</text>
  `;
}

function buildRearScene(plate: string) {
  return `
    <text x="240" y="86" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="#52606d">車尾視角</text>
    <path d="M132 116h216c16 0 30 12 33 28l15 84c3 17-10 32-27 32H111c-17 0-30-15-27-32l15-84c3-16 17-28 33-28Z" fill="#dfe7ef" stroke="#66788a" stroke-width="6"/>
    <path d="M150 130h180l24 68H126l24-68Z" fill="#f8fafc" stroke="#9aa5b1" stroke-width="5"/>
    <line x1="240" y1="126" x2="240" y2="199" stroke="#cbd5e1" stroke-width="4"/>
    <rect x="105" y="198" width="66" height="34" rx="12" fill="#ffd6dc" stroke="#e60012" stroke-width="5"/>
    <rect x="309" y="198" width="66" height="34" rx="12" fill="#ffd6dc" stroke="#e60012" stroke-width="5"/>
    <rect x="128" y="238" width="224" height="18" rx="9" fill="#9aa5b1"/>
    <rect x="187" y="207" width="106" height="32" rx="7" fill="#ffffff" stroke="#7b8794" stroke-width="4"/>
    <text x="240" y="229" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="800" fill="#1f2933">${plate}</text>
    <circle cx="132" cy="260" r="13" fill="#1f2933"/>
    <circle cx="348" cy="260" r="13" fill="#1f2933"/>
    <path d="M198 104h84" stroke="#718096" stroke-width="5" stroke-linecap="round"/>
  `;
}

function buildSideScene(angle: "left" | "right", plate: string, hasDamage: boolean, accent: string) {
  const isLeft = angle === "left";
  const groupTransform = isLeft ? `transform="translate(480 0) scale(-1 1)"` : "";
  const labelX = isLeft ? 350 : 130;
  const labelAnchor = isLeft ? "end" : "start";
  const damage = hasDamage
    ? `
      <path d="M314 154l42 24m-34-36l42 8m-36 28l28-36" stroke="${accent}" stroke-width="7" stroke-linecap="round"/>
      <circle cx="348" cy="170" r="30" fill="none" stroke="${accent}" stroke-width="5" stroke-dasharray="8 7"/>
      <text x="344" y="129" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="${accent}">需補拍</text>
    `
    : "";
  return `
    <text x="${labelX}" y="91" text-anchor="${labelAnchor}" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="#52606d">${isLeft ? "左側視角" : "右側視角"}</text>
    <g ${groupTransform}>
      <path d="M88 211h300c19 0 34-13 38-31l5-25h-55l-42-42c-9-9-21-14-34-14H179c-14 0-27 7-35 18l-38 53H79l9 41Z" fill="#dde7f0" stroke="#66788a" stroke-width="6" stroke-linejoin="round"/>
      <path d="M171 122h70v66h-116l46-66Z" fill="#f8fafc" stroke="#9aa5b1" stroke-width="5"/>
      <path d="M252 122h72l42 66H252v-66Z" fill="#f8fafc" stroke="#9aa5b1" stroke-width="5"/>
      <line x1="247" y1="112" x2="247" y2="214" stroke="#66788a" stroke-width="5"/>
      <line x1="326" y1="128" x2="326" y2="214" stroke="#cbd5e1" stroke-width="4"/>
      <path d="M103 172h30" stroke="#e60012" stroke-width="8" stroke-linecap="round"/>
      <path d="M391 169h35" stroke="#fff3c4" stroke-width="8" stroke-linecap="round"/>
      <circle cx="144" cy="223" r="27" fill="#1f2933"/>
      <circle cx="144" cy="223" r="12" fill="#9aa5b1"/>
      <circle cx="348" cy="223" r="27" fill="#1f2933"/>
      <circle cx="348" cy="223" r="12" fill="#9aa5b1"/>
      <rect x="206" y="207" width="76" height="25" rx="6" fill="#ffffff" stroke="#7b8794" stroke-width="3"/>
      <text x="244" y="225" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="800" fill="#1f2933">${plate}</text>
      <path d="M106 212h318" stroke="#a0aec0" stroke-width="4" stroke-linecap="round"/>
      ${damage}
    </g>
    <path d="${isLeft ? "M109 101h58l-16-13m16 13l-16 13" : "M371 101h-58l16-13m-16 13l16 13"}" fill="none" stroke="#718096" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

function buildInteriorScene(hasProblem: boolean, accent: string) {
  const mess = hasProblem
    ? `
      <circle cx="304" cy="190" r="18" fill="#f6ad55" opacity="0.85"/>
      <path d="M292 188c18 8 31 4 43 16" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>
      <path d="M126 226l20 10 23-9" stroke="#8a3414" stroke-width="5" stroke-linecap="round"/>
      <rect x="332" y="220" width="34" height="22" rx="5" fill="#ffffff" stroke="${accent}" stroke-width="4" transform="rotate(-12 349 231)"/>
    `
    : "";
  return `
    <path d="M96 224h288v34H96z" fill="#d9e2ec" stroke="#718096" stroke-width="4"/>
    <rect x="116" y="126" width="86" height="104" rx="18" fill="#edf2f7" stroke="#718096" stroke-width="5"/>
    <rect x="278" y="126" width="86" height="104" rx="18" fill="#edf2f7" stroke="#718096" stroke-width="5"/>
    <rect x="131" y="145" width="56" height="62" rx="12" fill="#ffffff" stroke="#a0aec0" stroke-width="3"/>
    <rect x="293" y="145" width="56" height="62" rx="12" fill="#ffffff" stroke="#a0aec0" stroke-width="3"/>
    <path d="M224 120h32v136h-32z" fill="#cbd5e1"/>
    ${mess}
  `;
}

function buildDashboardScene(returnCase: ReturnCase, accent: string) {
  const battery = returnCase.telematics.batteryPercent ?? returnCase.telematics.fuelPercent ?? 76;
  const warningText = returnCase.telematics.tirePressureLow
    ? "胎壓"
    : returnCase.telematics.dtcWarning
      ? "故障燈"
      : battery <= 20
        ? "低電量"
        : "正常";
  const warning = warningText === "正常"
    ? ""
    : `
      <polygon points="240,122 266,168 214,168" fill="#fff5f5" stroke="${accent}" stroke-width="5"/>
      <text x="240" y="158" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="900" fill="${accent}">!</text>
    `;
  return `
    <path d="M104 232c17-70 78-112 136-112s119 42 136 112H104Z" fill="#1f2933" stroke="#52606d" stroke-width="5"/>
    <circle cx="174" cy="202" r="48" fill="#f8fafc" stroke="#a0aec0" stroke-width="5"/>
    <circle cx="306" cy="202" r="48" fill="#f8fafc" stroke="#a0aec0" stroke-width="5"/>
    <path d="M174 202l25-21" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>
    <path d="M306 202l-8-34" stroke="${battery <= 20 ? accent : "#079669"}" stroke-width="6" stroke-linecap="round"/>
    <rect x="202" y="225" width="76" height="30" rx="8" fill="#ffffff" stroke="#a0aec0" stroke-width="3"/>
    <text x="240" y="246" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="800" fill="${battery <= 20 ? accent : "#1f2933"}">${battery}%</text>
    ${warning}
    <text x="240" y="96" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="900" fill="${warningText === "正常" ? "#079669" : accent}">${escapeSvg(warningText)}</text>
  `;
}

function mockPhotoIssueLabel(angle: ClientPhotoAngle, returnCase: ReturnCase) {
  if (hasDamageForAngle(angle, returnCase)) return "需補拍";
  if (angle === "interior" && hasInteriorProblem(returnCase)) return "車內髒污";
  if (angle === "dashboard" && returnCase.telematics.tirePressureLow) return "胎壓異常";
  if (angle === "dashboard" && returnCase.telematics.dtcWarning) return "故障燈";
  if (angle === "dashboard" && (returnCase.telematics.batteryPercent ?? 100) <= 20) return "電量偏低";
  return "檢核正常";
}

function hasDamageForAngle(angle: ClientPhotoAngle, returnCase: ReturnCase) {
  if (!returnCase.photoFindings.some((item) => ["scratch", "bumper", "dent", "broken_light"].includes(item))) return false;
  const text = `${returnCase.voiceNote} ${returnCase.history.repeatedDamageArea ?? ""}`;
  if (angle === "left") return /左/.test(text);
  if (angle === "right") return /右/.test(text) || !/左|後/.test(text);
  if (angle === "rear") return /後|尾/.test(text);
  if (angle === "front") return /前|保險桿|燈/.test(text) && !/右|左/.test(text);
  return false;
}

function hasInteriorProblem(returnCase: ReturnCase) {
  return returnCase.photoFindings.some((item) => ["trash", "spill", "smell"].includes(item));
}

function escapeSvg(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
