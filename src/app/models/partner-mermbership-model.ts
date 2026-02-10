import { ModelMembership } from './mermbership-model';

export class ModelPartnerMembership {
  constructor(
    public id?: number | null,
    public partnerId?: number,
    public membership: ModelMembership = new ModelMembership(),
    public cantSessions?: number,
    public price?: number,
    public startDate?: Date,
    public expirationDate?: Date | null,
    public status?: string
  ) {}
}
