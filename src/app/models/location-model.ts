export class ModelDriverLocation {
  constructor(
    public id?: number | null,
    public driverId?: number | null,
    public vehicleId?: number | null,
    public tripId?: number | null,
    public latitude?: number,
    public longitude?: number,
    public speedKmh?: number,
    public addressText?: string,
    public creationDate?: Date,
  ) {}
}
