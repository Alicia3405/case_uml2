import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type AiResolvedIntentMode = 'MUTATE' | 'ADVISE' | 'REVIEW' | 'DISCIPLINE' | 'RECAP';

export interface AiSuggestionItem {
  id: string;
  severity: 'idea' | 'warning' | 'discipline';
  targetNodeId?: string;
  targetClassName?: string;
  title: string;
  message: string;
  suggestedPrompt?: string;
}

export interface DisciplineAlertItem {
  code: string;
  severity: 'warning' | 'discipline';
  targetNodeId?: string;
  className?: string;
  message: string;
  suggestedPrompt?: string;
}

export class AiResponseDto {
  @ApiProperty({ description: 'Indica si la solicitud fue procesada exitosamente' })
  success: boolean;

  @ApiProperty({ description: 'Tipo de acción ejecutada', example: 'diagram_mutated | advise | review | discipline | recap | clarify | vision_extract' })
  action: string;

  @ApiProperty({ description: 'Mensaje descriptivo en lenguaje natural de los cambios realizados, recomendación o aclaración' })
  message: string;

  @ApiProperty({ description: 'Lista actualizada de nodos del diagrama', type: [Object] })
  nodes: any[];

  @ApiProperty({ description: 'Lista actualizada de conexiones del diagrama', type: [Object] })
  connections: any[];

  @ApiProperty({ description: 'Resumen conciso de cambios o hallazgos', example: 'Se creó la clase Producto con 3 atributos y relación hacia Categoria' })
  changesSummary: string;

  @ApiPropertyOptional({ description: 'Proveedor de IA que procesó la solicitud', example: 'ollama' })
  providerUsed?: string;

  @ApiPropertyOptional({ description: 'Nombre del modelo de IA que procesó la solicitud', example: 'qwen2.5-coder:7b' })
  modelUsed?: string;

  @ApiPropertyOptional({ description: 'Modo de intención resuelto por el router inteligente', example: 'ADVISE' })
  intentMode?: AiResolvedIntentMode;

  @ApiPropertyOptional({ description: 'Indica si la IA modificó el lienzo (true) o solo opinó/revisó (false)', example: false })
  mutatedDiagram?: boolean;

  @ApiPropertyOptional({ description: 'Sugerencias accionables propuestas por la IA como compañero desarrollador', type: [Object] })
  suggestions?: AiSuggestionItem[];

  @ApiPropertyOptional({ description: 'Anotaciones creadas en la pizarra para visibilidad de todo el equipo', type: [Object] })
  annotationsAdded?: any[];

  @ApiPropertyOptional({ description: 'Alertas de disciplina OMT / UML detectadas sobre el diseño actual', type: [Object] })
  disciplineAlerts?: DisciplineAlertItem[];

  @ApiPropertyOptional({ description: 'Indica si la respuesta fue publicada al chat grupal de la sala', example: true })
  broadcastedToRoom?: boolean;
}
