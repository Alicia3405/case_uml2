import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AiAnnotationStatus } from '../entities/ai-annotation.entity';

export class CreateSnapshotDto {
  @ApiPropertyOptional({ example: 'Avance fin del Día 1 - Módulo Pedidos' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string;
}

export class UpdateAiAnnotationStatusDto {
  @ApiProperty({ enum: ['open', 'applied', 'dismissed'], example: 'applied' })
  @IsIn(['open', 'applied', 'dismissed'])
  status: AiAnnotationStatus;
}

