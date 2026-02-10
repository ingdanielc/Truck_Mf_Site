export class ModelPartner {
  constructor(
    public id?: number | null,
    public photo?: string,
    public documentTypeId?: number,
    public documentTypeName?: number,
    public documentNumber?: string,
    public name?: string,
    public cellPhone?: string,
    public email?: string,
    public cityId?: number,
    public cityName?: string,
    public address?: string,
    public birthdate?: any,
    public age?: number,
    public genderId?: number,
    public status?: string,
    public accessTime?: Date,
    public partnerMembership: any[] = []

  ) {}
}
