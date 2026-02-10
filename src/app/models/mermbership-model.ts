export class ModelMembership {
  constructor(
    public id?: number | null,
    public name?: string,
    public membershipTypeId?: number,
    public membershipTypeName?: string,
    public expiresId?: number,
    public expiresName?: string,
    public cantSessions?: number,
    public price?: number,
    public status?: string
  ) {}
}
