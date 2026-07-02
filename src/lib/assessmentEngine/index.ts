import type { AiAssessment, ReturnCase } from "../../types/assessment";
import { decideDispatchPriority, decideNextBooking, decideVehicleStatus, planActions, requiresManualReview } from "./actionPlanner";
import { buildEvidenceCards } from "./evidenceBuilder";
import { generateCustomerSummary, generateInternalSummary } from "./customerSummaryGenerator";
import { scoreRisk } from "./scoringRules";
import { normalizeReturnInput, validateReturnCase } from "./validation";

export function runAssessment(input: ReturnCase, options: { photoUploaded?: boolean } = {}): AiAssessment {
  const validation = validateReturnCase(input);
  const normalizedInput = normalizeReturnInput(input);
  const scoreResult = scoreRisk(normalizedInput);
  const evidenceCards = buildEvidenceCards(normalizedInput, scoreResult, Boolean(options.photoUploaded));
  const status = decideVehicleStatus(scoreResult, evidenceCards);
  const nextBookingDecision = decideNextBooking(status, scoreResult.breakdown, normalizedInput.nextBookingMinutes);
  const dispatchPriority = decideDispatchPriority(status, scoreResult, normalizedInput.nextBookingMinutes);
  const recommendedActions = planActions(status, scoreResult, normalizedInput.nextBookingMinutes, evidenceCards);
  const manualReviewRequired = requiresManualReview(scoreResult, evidenceCards);
  const shell = { status, nextBookingDecision, evidenceCards, dispatchPriority };

  return {
    riskScore: scoreResult.totalRiskScore,
    status,
    riskBreakdown: scoreResult.breakdown,
    evidenceCards,
    recommendedActions,
    nextBookingDecision,
    dispatchPriority,
    customerSummary: generateCustomerSummary(normalizedInput, shell),
    internalSummary: generateInternalSummary(normalizedInput, scoreResult, shell),
    validation,
    confidence: scoreResult.confidence,
    aiConfidence: scoreResult.confidence,
    manualReviewRequired
  };
}

export { buildAuditTrail } from "./auditTrailBuilder";
export { clientPreCheck, normalizeClientSubmission } from "./normalizeClientSubmission";
export { enrichCompanyCase, submissionToReturnCase } from "./enrichCompanyCase";
