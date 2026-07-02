import type { ReturnStatus, VehicleType } from "./assessment";

export interface VehicleSnapshot {
  vehicleId: string;
  vehicleType: VehicleType;
  model: string;
  location: string;
  status: ReturnStatus;
  energyPercent?: number;
}
