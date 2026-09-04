import { CommonStatus } from '../enums/status.enum';

export class SchoolStatusChangedEvent {
  constructor(
    public readonly schoolId: string,
    public readonly schoolName: string,
    public readonly newStatus: CommonStatus,
  ) {}
}
