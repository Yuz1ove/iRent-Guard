export type AuditActor = "customer" | "ai" | "ops" | "customer_service" | "system";

export interface AuditTrailEvent {
  id: string;
  time: string;
  actor: AuditActor;
  eventType: string;
  description: string;
}
