export type VehicleType = "car" | "scooter";

export interface ReturnTelematics {
  batteryPercent?: number;
  fuelPercent?: number;
  tirePressureLow: boolean;
  dtcWarning: boolean;
  odometerDeltaKm: number;
  locationConfidence: number;
}

export interface ReturnHistory {
  recentComplaints: number;
  unresolvedWorkOrders: number;
  repeatedDamageArea?: string;
}

export interface ReturnCase {
  id: string;
  scenarioName: string;
  orderId: string;
  vehicleId: string;
  vehicleType: VehicleType;
  model: string;
  location: string;
  nextBookingMinutes: number;
  photoFindings: string[];
  voiceNote: string;
  telematics: ReturnTelematics;
  history: ReturnHistory;
}

export interface NormalizedReturnCase extends ReturnCase {
  voiceNote: string;
  photoFindings: string[];
  nextBookingMinutes: number;
  telematics: ReturnTelematics;
  history: ReturnHistory;
}
