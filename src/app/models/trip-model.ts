import { ModelDriver } from './driver-model';
import { ModelVehicle } from './vehicle-model';

export interface ModelTrip {
  id: number | null;
  numberTrip?: string;
  status: string;
  originId: string;
  destinationId: string;
  freight: number;
  manifestNumber: string;
  advancePayment: number;
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
  paidBalance?: boolean;
  creationDate?: string | Date;
  updateDate?: string | Date;
}
