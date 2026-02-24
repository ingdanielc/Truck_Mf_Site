import { ModelDriver } from './driver-model';
import { ModelVehicle } from './vehicle-model';

export interface ModelTrip {
  id: number | null;
  tripNumber?: string;
  status: string;
  origin: string;
  destination: string;
  freight: number;
  manifestNumber: string;
  advance: number;
  balance: number;
  vehicleId?: number;
  vehiclePlate?: string;

  vehicle?: ModelVehicle;
  driverId?: number;
  driver?: ModelDriver;
  company?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  numberOfDays?: number;
  loadType?: string;
  advancePayment?: number;
  paidBalance?: boolean;
  creationDate?: string | Date;
  updateDate?: string | Date;
}
