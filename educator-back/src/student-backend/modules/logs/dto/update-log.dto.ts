import { IsArray, IsOptional } from 'class-validator';

import { type Transcript } from '../../../data/json-data.service';

export class UpdateLogDto {
  @IsArray()
  @IsOptional()
  messages?: Transcript['messages'];
}
