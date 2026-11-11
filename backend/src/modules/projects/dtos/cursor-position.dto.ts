import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CursorPositionDto {
  @ApiProperty({ description: 'ID de la sesión de colaboración' })
  @IsNotEmpty()
  @IsUUID('4')
  sessionId: string;

  @ApiProperty({ description: 'Posición X del cursor en el lienzo', example: 250.5 })
  @IsNotEmpty()
  @IsNumber()
  x: number;

  @ApiProperty({ description: 'Posición Y del cursor en el lienzo', example: 180.2 })
  @IsNotEmpty()
  @IsNumber()
  y: number;

  @ApiPropertyOptional({ description: 'Nombre completo del usuario que mueve el cursor' })
  @IsOptional()
  @IsString()
  userName?: string;

  @ApiPropertyOptional({ description: 'Color del cursor' })
  @IsOptional()
  @IsString()
  color?: string;
}
