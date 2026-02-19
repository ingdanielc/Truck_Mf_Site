export class ModelDriver {
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
    public vehicles?: number,
    public status?: string,
    public password?: string,
  ) {}
}
