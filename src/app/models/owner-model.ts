export class ModelOwner {
  constructor(
    public id?: number | null,
    public photo?: string,
    public documentTypeId?: number,
    public documentTypeName?: number,
    public documentNumber?: string,
    public name?: string,
    public email?: string,
    public cellPhone?: string,
    public cityId?: number,
    public cityName?: string,
    public genderId?: number,
    public birthdate?: any,
    public age?: number,
    public maxVehicles?: number,
    public status?: string,
    public password?: string,
    public vehicleCount?: number,
    public driverCount?: number,
    public user?: {
      id?: number;
      name?: string;
      email?: string;
      status?: string;
    },
  ) {}
}
