import { Controller, Post, Get, Body, UseGuards, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../auth/entities/user.entity';
import { AiAssistantService } from '../services/ai-assistant.service';
import { AiPromptDto } from '../dtos/ai-prompt.dto';
import { AiVisionPromptDto } from '../dtos/ai-vision-prompt.dto';
import { AiResponseDto } from '../dtos/ai-response.dto';
import { TestOllamaConnectionDto, UpdateOllamaConfigDto } from '../dtos/ollama-config.dto';

@ApiTags('AI Assistant (Copilot IA Colaborativo / Ollama Colab & Vertex AI)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Public()
  @Get('models')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lista los modelos de IA disponibles (locales/Colab en Ollama y nube con Google Gemini)',
  })
  async getModels() {
    return this.aiAssistantService.getAvailableModels();
  }

  @Get('ollama/config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtiene la configuración activa del runtime de Ollama (URL local o túnel Google Colab)',
  })
  async getOllamaConfig() {
    return this.aiAssistantService.getOllamaRuntimeConfig();
  }

  @Post('ollama/config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Actualiza en caliente la URL de Ollama / túnel Colab (ngrok) y modelos por defecto',
  })
  async updateOllamaConfig(@Body() dto: UpdateOllamaConfigDto) {
    return this.aiAssistantService.updateOllamaRuntimeConfig(dto);
  }

  @Post('ollama/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prueba la conectividad y latencia de Ollama/Colab y lista modelos detectados',
  })
  async testOllamaConnection(@Body() dto: TestOllamaConnectionDto) {
    return this.aiAssistantService.testOllamaConnection(dto);
  }

  @Post('prompt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Procesa una consulta, revisión, auditoría OMT, resumen de sesión o comando de mutación para el equipo colaborativo',
  })
  @ApiResponse({
    status: 200,
    description: 'Respuesta de la IA (opinión grupal/anotaciones o diagrama mutado)',
    type: AiResponseDto,
  })
  async processPrompt(
    @Body() dto: AiPromptDto,
    @CurrentUser() user?: User,
  ): Promise<AiResponseDto> {
    const payload = user
      ? {
          ...dto,
          authorUserId: dto.authorUserId || user.id,
          authorUserName: dto.authorUserName || user.fullName || user.email,
        }
      : dto;
    return this.aiAssistantService.processTextPrompt(payload);
  }

  @Post('vision-diagram')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Digitaliza o analiza un diagrama UML desde una imagen (Ollama Vision o Gemini Vision)',
  })
  @ApiResponse({
    status: 200,
    description: 'Diagrama digitalizado con clases, atributos y relaciones extraídas',
    type: AiResponseDto,
  })
  async processVisionDiagram(
    @Body() dto: AiVisionPromptDto,
    @CurrentUser() user?: User,
  ): Promise<AiResponseDto> {
    const payload = user
      ? {
          ...dto,
          authorUserId: dto.authorUserId || user.id,
          authorUserName: dto.authorUserName || user.fullName || user.email,
        }
      : dto;
    return this.aiAssistantService.processVisionDiagram(payload);
  }

  @Post('audio-prompt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Procesa una instrucción o consulta dictada por voz en el modo colaborativo',
  })
  @ApiResponse({
    status: 200,
    description: 'Respuesta de la IA a partir de la transcripción por voz',
    type: AiResponseDto,
  })
  async processAudioPrompt(
    @Body() dto: AiPromptDto,
    @CurrentUser() user?: User,
  ): Promise<AiResponseDto> {
    const payload = user
      ? {
          ...dto,
          authorUserId: dto.authorUserId || user.id,
          authorUserName: dto.authorUserName || user.fullName || user.email,
        }
      : dto;
    return this.aiAssistantService.processTextPrompt(payload);
  }
}
