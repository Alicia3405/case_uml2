import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateOllamaConfigDto {
  @ApiPropertyOptional({
    description: 'URL base de Ollama local o túnel Google Colab/ngrok (ej: https://xxxx.ngrok-free.app)',
    example: 'https://abcd-1234.ngrok-free.app',
  })
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  baseUrl?: string;

  @ApiPropertyOptional({
    description: 'Modelo principal para texto/UML en Ollama',
    example: 'qwen2.5:3b',
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({
    description: 'Modelo de visión multimodal en Ollama (ej: qwen2.5vl:7b, llava:7b)',
    example: 'qwen2.5vl:7b',
  })
  @IsOptional()
  @IsString()
  visionModel?: string;

  @ApiPropertyOptional({
    description: 'Si es true, restablece URL y modelos a los valores iniciales definidos en variables de entorno',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  resetToEnv?: boolean;
}

export class TestOllamaConnectionDto {
  @ApiPropertyOptional({
    description: 'URL base opcional a probar sin guardar todavía la configuración',
    example: 'http://localhost:11434',
  })
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  baseUrl?: string;
}
