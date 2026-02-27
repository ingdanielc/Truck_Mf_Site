export interface ModelExpense {
  id?: number;
  vehicleId: number;
  tripId?: number;
  categoryId: number;
  amount: number;
  expenseDate: string | Date;
  description?: string;
  receiptImageUrl?: string;
  creationDate?: string | Date;
  updateDate?: string | Date;
}
