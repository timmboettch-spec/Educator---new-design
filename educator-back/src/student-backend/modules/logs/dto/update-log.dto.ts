import { IsArray, IsOptional } from 'class-validator';

import { type TranscriptMessage } from '../../../../common/interfaces';

export class UpdateLogDto {
  @IsArray()
  @IsOptional()
  messages?: TranscriptMessage[];
}
