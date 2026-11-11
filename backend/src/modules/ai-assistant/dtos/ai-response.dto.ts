import { ApiProperty } from '@nestjs/swagger';

export class AiResponseDto {
  @ApiProperty({ description: 'Indica si la mutación fue exitosa o si se requirió aclaración' })
  success: boolean;

  @ApiProperty({ description: 'Tipo de acción ejecutada', example: 'create_table | add_relationship | clarify | vision_extract' })
  action: string;

  @ApiProperty({ description: 'Mensaje descriptivo en lenguaje natural de los cambios realizados o aclaración solicitada' })
  message: string;

  @ApiProperty({ description: 'Lista actualizada de nodos del diagrama', type: [Object] })
  nodes: any[];

  @ApiProperty({ description: 'Lista actualizada de conexiones del diagrama', type: [Object] })
  connections: any[];

  @ApiProperty({ description: 'Resumen conciso de cambios estructurales aplicados', example: 'Se creó la clase Producto con 3 atributos y relación hacia Categoria' })
  changesSummary: string;

  @ApiProperty({ description: 'Proveedor de IA que procesó la solicitud', example: 'ollama', required: false })
  providerUsed?: string;

  @ApiProperty({ description: 'Nombre del modelo de IA que procesó la solicitud', example: 'qwen2.5-coder:7b', required: false })
  modelUsed?: string;
}
