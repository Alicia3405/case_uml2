import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray, IsBoolean, IsIn } from 'class-validator';

export class AiVisionPromptDto {
  @ApiProperty({
    description: 'Imagen codificada en Base64 del diagrama UML a digitalizar',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA...',
  })
  @IsString()
  @IsNotEmpty()
  imageBase64: string;

  @ApiProperty({
    description: 'Tipo MIME de la imagen',
    example: 'image/png',
    default: 'image/png',
  })
  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @ApiPropertyOptional({
    description: 'Instrucción adicional opcional para guiar la extracción del diagrama',
    example: 'Digitaliza todas las clases y relaciones de la foto del pizarrón',
  })
  @IsOptional()
  @IsString()
  prompt?: string;

  @ApiProperty({
    description: 'Identificador del diagrama actual',
    example: 'd9b736b4-2b62-4217-a068-d0a5180f9702',
  })
  @IsString()
  @IsNotEmpty()
  diagramId: string;

  @ApiPropertyOptional({
    description: 'Código de sala de colaboración opcional',
    example: 'ROOM-FAC123',
  })
  @IsOptional()
  @IsString()
  roomCode?: string;

  @ApiPropertyOptional({
    description: 'Lista actual de nodos del diagrama para fusión/actualización',
    type: [Object],
  })
  @IsOptional()
  @IsArray()
  currentNodes?: any[];

  @ApiPropertyOptional({
    description: 'Lista actual de conexiones del diagrama para fusión/actualización',
    type: [Object],
  })
  @IsOptional()
  @IsArray()
  currentConnections?: any[];

  @ApiPropertyOptional({
    description: 'Historial de actividades realizadas en la sesión para contexto ampliado',
    type: [Object],
  })
  @IsOptional()
  @IsArray()
  sessionHistory?: any[];

  @ApiPropertyOptional({
    description: 'Proveedor de IA a utilizar',
    example: 'vertex',
  })
  @IsOptional()
  @IsString()
  provider?: 'ollama' | 'vertex';

  @ApiPropertyOptional({
    description: 'Modelo de IA específico',
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({
    description: 'Modo explícito al analizar imagen (auto | mutate | advise)',
    example: 'auto',
  })
  @IsOptional()
  @IsIn(['auto', 'mutate', 'advise'])
  mode?: 'auto' | 'mutate' | 'advise';

  @ApiPropertyOptional({
    description: 'Indica si el resultado debe anunciarse en el chat grupal de la sala',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  broadcastToRoom?: boolean;

  @ApiPropertyOptional({
    description: 'ID del colaborador que sube la imagen',
  })
  @IsOptional()
  @IsString()
  authorUserId?: string;

  @ApiPropertyOptional({
    description: 'Nombre del colaborador que sube la imagen',
  })
  @IsOptional()
  @IsString()
  authorUserName?: string;

  @ApiPropertyOptional({
    description: 'Si es true y la IA digitaliza/muta el diagrama, persiste el AST en MongoDB',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  persistChanges?: boolean;
}
