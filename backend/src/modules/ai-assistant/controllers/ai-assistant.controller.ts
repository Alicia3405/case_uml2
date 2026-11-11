import { Controller, Post, Get, Body, UseGuards, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AiAssistantService } from '../services/ai-assistant.service';
import { AiPromptDto } from '../dtos/ai-prompt.dto';
import { AiVisionPromptDto } from '../dtos/ai-vision-prompt.dto';
import { AiResponseDto } from '../dtos/ai-response.dto';

import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('AI Assistant (Copilot Vertex AI / Ollama Local)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Public()
  @Get('models')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lista los modelos de IA disponibles (locales en Ollama y en la nube con Google Vertex AI)',
  })
  async getModels() {
    return this.aiAssistantService.getAvailableModels();
  }

  @Post('prompt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Procesa un comando de texto o dictado por voz para mutar el diagrama UML con Vertex AI',
  })
  @ApiResponse({
    status: 200,
    description: 'Diagrama modificado o solicitud de aclaración',
    type: AiResponseDto,
  })
  async processPrompt(@Body() dto: AiPromptDto): Promise<AiResponseDto> {
    return this.aiAssistantService.processTextPrompt(dto);
  }

  @Post('vision-diagram')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Digitaliza y extrae un diagrama UML completo a partir de una imagen (foto, pizarra o captura) usando Gemini Vision',
  })
  @ApiResponse({
    status: 200,
    description: 'Diagrama digitalizado con clases, atributos y relaciones extraídas',
    type: AiResponseDto,
  })
  async processVisionDiagram(@Body() dto: AiVisionPromptDto): Promise<AiResponseDto> {
    return this.aiAssistantService.processVisionDiagram(dto);
  }

  @Post('audio-prompt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Procesa un comando dictado por audio/voz (transcripción) para mutar el diagrama UML',
  })
  @ApiResponse({
    status: 200,
    description: 'Diagrama modificado a partir de la instrucción por voz',
    type: AiResponseDto,
  })
  async processAudioPrompt(@Body() dto: AiPromptDto): Promise<AiResponseDto> {
    return this.aiAssistantService.processTextPrompt(dto);
  }
}
