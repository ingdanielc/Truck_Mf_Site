export interface ModelExpense {
  id?: number;
  vehicleId: number;
  tripId?: number;
  categoryId: number;
  categoryName?: string;
  category?: {
    id: number;
    name: string;
    expenseTypeId?: number;
    ownerId?: number | null;
  };
  amount: number;
  expenseDate: string | Date;
  description?: string;
  receiptImageUrl?: string;
  creationDate?: string | Date;
  updateDate?: string | Date;
}
