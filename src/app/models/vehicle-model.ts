export interface ModelVehicle {
  id?: number;
  photo?: string;
  vehicleBrandId: string;
  vehicleBrandName?: string;
  model: string;
  year: number;
  color: string;
  plate: string;
  engineNumber: string;
  chassisNumber: string;
  numberOfAxles: number;
  status?: string;
}
