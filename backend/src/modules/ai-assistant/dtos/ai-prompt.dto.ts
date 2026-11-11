import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class AiPromptDto {
  @ApiProperty({
    description: 'Instrucción o comando en lenguaje natural para el asistente UML',
    example: 'Crea una tabla Producto con atributos id UUID, nombre String, precio Double y conéctala con Categoria con relación de asociación muchos a uno',
  })
  @IsString()
  @IsNotEmpty()
  prompt: string;

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
    description: 'Lista actual de nodos del diagrama para contexto',
    type: [Object],
    required: false,
  })
  @IsOptional()
  @IsArray()
  currentNodes?: any[];

  @ApiProperty({
    description: 'Lista actual de conexiones del diagrama para contexto',
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
    description: 'Proveedor de IA a utilizar (ollama o vertex)',
    required: false,
    example: 'ollama',
  })
  @IsOptional()
  @IsString()
  provider?: 'ollama' | 'vertex';

  @ApiProperty({
    description: 'Modelo de IA específico a utilizar (ej: qwen2.5:3b, qwen2.5-coder:7b)',
    required: false,
    example: 'qwen2.5-coder:7b',
  })
  @IsOptional()
  @IsString()
  model?: string;
}
