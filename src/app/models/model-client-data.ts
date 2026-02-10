export class ModelClientData {
  constructor(
    public customerCode?: number,
    public documentTypeCode?: number,
    public documentTypeType?: number,
    public documentNumber?: string,
    public firstName?: string,
    public secondName?: string,
    public lastName?: string,
    public secondLastName?: string,
    public cellPhone?: string,
    public email?: string,
    public campaignCountryCode?: number,
    public campaignCountry?: string,
    public campaignCityId?: number,
    public campaignCityCode?: string,
    public address?: string,
    public birthdate?: any,
    public gender?: string,
    public partnerCode?: number,
    public customerValues: CustomerValues = new CustomerValues()
  ) {}
}

export class CustomerValues {
  constructor(
    public economicActivityCode?: number,
    public salaryRangeCode?: number,
    public dependentCode?: number,
    public age: number = 0,
    public pep?: boolean
  ) {}
}
