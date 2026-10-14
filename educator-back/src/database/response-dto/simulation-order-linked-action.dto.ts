import { ApiProperty } from '@nestjs/swagger';
import { SimulationOrderLinkedAction } from '../entities/simulation-order-linked-action.entity';

export class SimulationOrderLinkedActionResponseDto implements SimulationOrderLinkedAction {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  orderId!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  actionId!: string;
}
