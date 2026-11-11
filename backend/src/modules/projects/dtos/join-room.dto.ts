import { IsNotEmpty, IsUUID, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JoinRoomDto {
  @ApiProperty({ description: 'ID del diagrama al que unirse', example: 'd3b07384-d113-40a2-9e8c-529a3a9df80f' })
  @IsNotEmpty({ message: 'El ID del diagrama es obligatorio' })
  @IsUUID('4', { message: 'El ID del diagrama debe ser un UUID válido' })
  diagramId: string;

  @ApiPropertyOptional({ description: 'Código de sala personalizado', example: 'ROOM-ABC123' })
  @IsOptional()
  @IsString()
  roomCode?: string;

  @ApiPropertyOptional({ description: 'Color del cursor del usuario', example: '#007ACC' })
  @IsOptional()
  @IsString()
  cursorColor?: string;
}
