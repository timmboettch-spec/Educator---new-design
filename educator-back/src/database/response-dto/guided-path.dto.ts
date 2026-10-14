import { ApiProperty } from '@nestjs/swagger';
import { RoleSlug } from 'src/common/constants';
import { GuidedPath } from '../entities/guided-path.entity';

export class GuidedPathResponseDto implements GuidedPath {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  guidedPathId!: string;

  @ApiProperty({ example: '9c858901-8a57-4791-81fe-4c455b099bc9' })
  userId!: string;

  @ApiProperty({ example: RoleSlug.EDUCATOR, enum: RoleSlug })
  roleType!: RoleSlug;

  @ApiProperty({
    example: { step1: true, step2: true, step3: false, step4: false, step5: false },
    description:
      'Opaque, frontend-owned guided-path progress. This example is illustrative only, not a backend contract — the backend never reads or validates its contents.',
  })
  state!: Record<string, unknown>;

  @ApiProperty({ example: false })
  completed!: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;
}
