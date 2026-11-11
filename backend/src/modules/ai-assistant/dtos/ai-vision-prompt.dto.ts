import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

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

  @ApiProperty({
    description: 'Instrucción adicional opcional para guiar la extracción del diagrama',
    required: false,
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

  @ApiProperty({
    description: 'Código de sala de colaboración opcional',
    required: false,
    example: 'ROOM-FAC123',
  })
  @IsOptional()
  @IsString()
  roomCode?: string;

  @ApiProperty({
    description: 'Lista actual de nodos del diagrama para fusión/actualización',
    type: [Object],
    required: false,
  })
  @IsOptional()
  @IsArray()
  currentNodes?: any[];

  @ApiProperty({
    description: 'Lista actual de conexiones del diagrama para fusión/actualización',
    type: [Object],
    required: false,
  })
  @IsOptional()
  @IsArray()
  currentConnections?: any[];

  @ApiProperty({
    description: 'Historial de actividades realizadas en la sesión para contexto ampliado',
    type: [Object],
    required: false,
  })
  @IsOptional()
  @IsArray()
  sessionHistory?: any[];

  @ApiProperty({
    description: 'Proveedor de IA a utilizar',
    required: false,
    example: 'vertex',
  })
  @IsOptional()
  @IsString()
  provider?: 'ollama' | 'vertex';

  @ApiProperty({
    description: 'Modelo de IA específico',
    required: false,
  })
  @IsOptional()
  @IsString()
  model?: string;
}
