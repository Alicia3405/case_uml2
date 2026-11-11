import { ApiProperty } from '@nestjs/swagger';

export class GeneratedFileDto {
  @ApiProperty({ description: 'Ruta relativa del archivo dentro del proyecto generado', example: 'src/main/java/com/app/studio/entities/Producto.java' })
  path: string;

  @ApiProperty({ description: 'Nombre base del archivo', example: 'Producto.java' })
  filename: string;

  @ApiProperty({ description: 'Lenguaje de programación o formato', example: 'java' })
  language: string;

  @ApiProperty({ description: 'Capa arquitectónica a la que pertenece', example: 'entity' })
  layer: 'entity' | 'repository' | 'service' | 'controller' | 'dto' | 'migration' | 'config' | 'docker' | 'docs';

  @ApiProperty({ description: 'Contenido completo del archivo generado' })
  content: string;
}

export class CodeGenerationPreviewResponseDto {
  @ApiProperty({ description: 'Nombre del proyecto generado', example: 'spring-boot-uml-api' })
  projectName: string;

  @ApiProperty({ description: 'Cantidad total de archivos generados en todas las capas', example: 28 })
  totalFiles: number;

  @ApiProperty({ description: 'Lista estructurada de archivos generados', type: [GeneratedFileDto] })
  files: GeneratedFileDto[];
}
