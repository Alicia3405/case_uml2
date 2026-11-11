import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray, IsBoolean, IsIn } from 'class-validator';

export type AiPromptMode = 'auto' | 'mutate' | 'advise' | 'review' | 'discipline' | 'recap';

export class AiPromptDto {
  @ApiProperty({
    description: 'Instrucción, pregunta o consulta en lenguaje natural para el compañero Copilot IA',
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

  @ApiPropertyOptional({
    description: 'Código de sala de colaboración opcional',
    example: 'ROOM-FAC123',
  })
  @IsOptional()
  @IsString()
  roomCode?: string;

  @ApiPropertyOptional({
    description: 'Lista actual de nodos del diagrama para contexto',
    type: [Object],
  })
  @IsOptional()
  @IsArray()
  currentNodes?: any[];

  @ApiPropertyOptional({
    description: 'Lista actual de conexiones del diagrama para contexto',
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
    description: 'Proveedor de IA a utilizar (ollama o vertex)',
    example: 'ollama',
  })
  @IsOptional()
  @IsString()
  provider?: 'ollama' | 'vertex';

  @ApiPropertyOptional({
    description: 'Modelo de IA específico a utilizar (ej: qwen2.5:3b, qwen2.5-coder:7b)',
    example: 'qwen2.5-coder:7b',
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({
    description: 'Modo explícito de participación de la IA (auto | mutate | advise | review | discipline | recap)',
    example: 'auto',
  })
  @IsOptional()
  @IsIn(['auto', 'mutate', 'advise', 'review', 'discipline', 'recap'])
  mode?: AiPromptMode;

  @ApiPropertyOptional({
    description: 'Indica si la respuesta de la IA debe difundirse en el chat grupal de la sala',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  broadcastToRoom?: boolean;

  @ApiPropertyOptional({
    description: 'Indica si las ideas o alertas detectadas deben fijarse como anotaciones en la pizarra',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  createWhiteboardNotes?: boolean;

  @ApiPropertyOptional({
    description: 'ID del colaborador que invoca a la IA',
  })
  @IsOptional()
  @IsString()
  authorUserId?: string;

  @ApiPropertyOptional({
    description: 'Nombre visible del colaborador que invoca a la IA',
  })
  @IsOptional()
  @IsString()
  authorUserName?: string;

  @ApiPropertyOptional({
    description: 'IDs de nodos seleccionados actualmente en el lienzo como foco de consulta o revisión',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  selectedNodeIds?: string[];

  @ApiPropertyOptional({
    description: 'Si es true y la IA muta el diagrama, persiste automáticamente el AST en MongoDB además de sincronizar por WebSocket',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  persistChanges?: boolean;
}
