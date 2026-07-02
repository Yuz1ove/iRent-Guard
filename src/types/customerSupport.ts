export type CustomerReplyTone = "neutral" | "soft" | "short";

export interface CustomerSupportSummary {
  orderId: string;
  riskLevel: "low" | "medium" | "high";
  summary: string;
  requiresManualReview: boolean;
}
