import { ModelOwner } from './owner-model';

/** Relación vehículo-propietario que llega anidada en cada vehículo */
export interface VehicleOwnerRelation {
  id: number;
  vehicleId: number;
  ownerId: number;
  owner: ModelOwner;
  ownershipPercentage: number;
  creationDate?: string;
  updateDate?: string;
}

export interface ModelVehicle {
  id?: number;
  photo?: string;
  vehicleBrandId: number;
  vehicleBrandName?: string;
  model: string;
  year: number;
  color: string;
  plate: string;
  engineNumber: string;
  chassisNumber: string;
  numberOfAxles: number;
  status?: string;
  ownerId?: number;
  owners?: VehicleOwnerRelation[];
  currentDriverId: number | null;
  currentDriverName?: string;
  /** Kilometros con los que el vehiculo entro a CashTruck. */
  initialKm?: number;
  /** Suma de los kilometros de los viajes completados del vehiculo. */
  totalKm?: number;
  lastTripStatus?: string;
  lastTripId?: number | null;
  occupied?: boolean;
}
