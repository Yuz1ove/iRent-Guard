import type { CompanyReturnCase, BookingContext, WorkOrderHistory } from "../../types/company";
import type { ClientReturnSubmission } from "../../types/client";
import type { ReturnCase, ReturnHistory, ReturnTelematics } from "../../types/returnCase";
import { runAssessment } from ".";
import { buildAuditTrail } from "./auditTrailBuilder";

export function enrichCompanyCase(args: {
  assessmentId: string;
  scenarioName: string;
  submission: ClientReturnSubmission;
  telematics: ReturnTelematics;
  bookingContext: BookingContext;
  history: ReturnHistory;
  workOrderHistory: WorkOrderHistory[];
  photoFindings: string[];
}): CompanyReturnCase {
  const returnCase = submissionToReturnCase(args);
  const assessment = runAssessment(returnCase, {
    photoUploaded: args.submission.photos.some((photo) => photo.status !== "missing")
  });
  return {
    assessmentId: args.assessmentId,
    scenarioName: args.scenarioName,
    submission: args.submission,
    telematics: args.telematics,
    bookingContext: args.bookingContext,
    history: args.history,
    workOrderHistory: args.workOrderHistory,
    assessment,
    auditTrail: buildAuditTrail(args.submission, assessment)
  };
}

export function submissionToReturnCase(args: {
  assessmentId?: string;
  scenarioName: string;
  submission: ClientReturnSubmission;
  telematics: ReturnTelematics;
  bookingContext: BookingContext;
  history: ReturnHistory;
  photoFindings: string[];
}): ReturnCase {
  return {
    id: args.assessmentId ?? args.submission.submissionId,
    scenarioName: args.scenarioName,
    orderId: args.submission.orderId,
    vehicleId: args.submission.vehicleId,
    vehicleType: args.submission.vehicleType,
    model: args.submission.vehicleModel,
    location: args.submission.returnStation,
    nextBookingMinutes: args.bookingContext.nextBookingMinutes,
    photoFindings: args.photoFindings,
    voiceNote: [args.submission.voiceNote, args.submission.textNote, ...args.submission.quickNotes].filter(Boolean).join("，"),
    telematics: args.telematics,
    history: args.history
  };
}
