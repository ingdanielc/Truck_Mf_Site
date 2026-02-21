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
  /** @deprecated Usar owners[0].ownerId en su lugar */
  ownerId?: number;
  owners?: VehicleOwnerRelation[];
  currentDriverId: number | null;
  currentDriverName?: string;
}
