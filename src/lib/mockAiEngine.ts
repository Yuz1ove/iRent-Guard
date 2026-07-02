import type { ReturnCase } from "../types/assessment";
import { runAssessment } from "./assessmentEngine";

export function assessReturnCase(returnCase: ReturnCase, photoUploaded = false) {
  return runAssessment(returnCase, { photoUploaded });
}
