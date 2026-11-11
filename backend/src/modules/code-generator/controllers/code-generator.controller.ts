import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProduces } from '@nestjs/swagger';
import { CodeGeneratorService } from '../services/code-generator.service';
import { S3StorageService } from '../services/s3-storage.service';
import { GenerateCodeRequestDto } from '../dtos/generate-code-request.dto';
import { CodeGenerationPreviewResponseDto } from '../dtos/code-generation-preview-response.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../auth/entities/user.entity';

@ApiTags('code-generator')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('codegen')
export class CodeGeneratorController {
  constructor(
    private readonly codegenService: CodeGeneratorService,
    private readonly s3StorageService: S3StorageService,
  ) {}

  @Post('preview/:diagramId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generar vista previa del código Spring Boot 4 + Flyway a partir del ID del diagrama' })
  @ApiResponse({
    status: 200,
    description: 'Estructura de archivos y código generado para todas las capas',
    type: CodeGenerationPreviewResponseDto,
  })
  async previewFromDiagramId(
    @Param('diagramId', ParseUUIDPipe) diagramId: string,
    @Body() dto: GenerateCodeRequestDto,
    @CurrentUser() user: User,
  ): Promise<CodeGenerationPreviewResponseDto> {
    return this.codegenService.previewFromDiagramId(diagramId, dto, user.id);
  }

  @Post('download/:diagramId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Compilar y descargar el proyecto Spring Boot completo en un archivo .zip a partir del ID del diagrama' })
  @ApiProduces('application/zip')
  @ApiResponse({
    status: 200,
    description: 'Archivo ZIP con la solución Spring Boot completa, Dockerfile, docker-compose.yml y Flyway',
  })
  async downloadZipFromDiagramId(
    @Param('diagramId', ParseUUIDPipe) diagramId: string,
    @Body() dto: GenerateCodeRequestDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, buffer } = await this.codegenService.downloadZipFromDiagramId(diagramId, dto, user.id);

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  @Post('s3-upload/:diagramId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Compilar proyecto y subirlo a Amazon S3 retornando la URL prefirmada de descarga',
  })
  @ApiResponse({
    status: 200,
    description: 'Artefacto ZIP almacenado en Amazon S3 con URL temporal de descarga directa',
  })
  async uploadZipToS3(
    @Param('diagramId', ParseUUIDPipe) diagramId: string,
    @Body() dto: GenerateCodeRequestDto,
    @CurrentUser() user: User,
  ) {
    const { filename, buffer } = await this.codegenService.downloadZipFromDiagramId(
      diagramId,
      dto,
      user.id,
    );

    const result = await this.s3StorageService.uploadZip(filename, buffer);

    return {
      message: 'Proyecto exportado y almacenado exitosamente en Amazon S3',
      ...result,
    };
  }

  @Get('s3-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar el estado de conectividad con el bucket de Amazon S3' })
  getS3Status() {
    return {
      configured: this.s3StorageService.isConfigured(),
      message: this.s3StorageService.isConfigured()
        ? 'Almacenamiento S3 activo y listo para transferencias'
        : 'Almacenamiento S3 no configurado (modo local en memoria)',
    };
  }
}
