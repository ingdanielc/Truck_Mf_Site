export interface ModelExpense {
  id?: number;
  tripId?: number;
  vehicleId?: number;
  category: string;
  description: string;
  amount: number;
  date?: string | Date;
  receiptUrl?: string;
  metadata?: any;
}
