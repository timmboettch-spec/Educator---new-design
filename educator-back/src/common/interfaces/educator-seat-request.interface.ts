export interface CreateEducatorSeatRequestInput {
  educatorId: string;
  districtAdminId: string;
  requestedSeats?: number | null;
  note?: string | null;
}
