import { ModelPartnerMembership } from './partner-mermbership-model';
import { ModelPartner } from './partner-model';
import { ModelUser } from './user-model';

export class ModelPayment {
  constructor(
    public id?: number | null,
    public now?: boolean,
    public paymentMethodId?: number,
    public partner: ModelPartner = new ModelPartner(),
    public partnerMembership: ModelPartnerMembership = new ModelPartnerMembership(),
    public amount?: number,
    public balance?: number,
    public paymentDate?: Date,
    public user: ModelUser = new ModelUser(),
    public status?: string
  ) {}
}
