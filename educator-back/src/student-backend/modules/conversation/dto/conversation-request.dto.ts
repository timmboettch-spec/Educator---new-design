import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ConversationRequestDto {
  @ApiProperty({
    description: 'The text message from the student',
    example: 'Hello, how are you?',
  })
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiProperty({
    description: 'The scenario ID',
    example: 'scenario-002',
  })
  @IsString()
  @IsNotEmpty()
  scenarioId!: string;

  @ApiProperty({
    description: 'Optional conversation history for context',
    required: false,
  })
  @IsOptional()
  conversationHistory?: Array<{
    role: 'student' | 'patient';
    text: string;
    timestamp: string;
  }>;
}
