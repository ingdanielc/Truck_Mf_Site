import { ModelPartner } from './partner-model';

export class ModelAccessControl {
  constructor(
    public id?: number | null,
    public partner: ModelPartner = new ModelPartner(),
    public accessTime?: Date,
    public status?: string
  ) {}
}
