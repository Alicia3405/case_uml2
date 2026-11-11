import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DiagramService } from '../services/diagram.service';
import { CreateDiagramDto } from '../dtos/create-diagram.dto';
import { UpdateDiagramDto } from '../dtos/update-diagram.dto';
import { SaveDiagramAstDto } from '../dtos/save-diagram-ast.dto';
import { DiagramResponseDto } from '../dtos/diagram-response.dto';
import {
  CreateSnapshotDto,
  UpdateAiAnnotationStatusDto,
} from '../dtos/diagram-snapshot.dto';
import { DiagramSnapshot } from '../entities/diagram-snapshot.entity';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../auth/entities/user.entity';

@ApiTags('diagrams')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('diagrams')
export class DiagramController {
  constructor(private readonly diagramService: DiagramService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un nuevo diagrama dentro de un proyecto' })
  @ApiResponse({ status: 201, description: 'Diagrama creado exitosamente', type: DiagramResponseDto })
  async create(
    @Body() dto: CreateDiagramDto,
    @CurrentUser() user: User,
  ): Promise<DiagramResponseDto> {
    return this.diagramService.create(dto, user.id);
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'Listar todos los diagramas pertenecientes a un proyecto' })
  @ApiResponse({ status: 200, description: 'Lista de diagramas del proyecto', type: [DiagramResponseDto] })
  async findAllByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: User,
  ): Promise<DiagramResponseDto[]> {
    return this.diagramService.findAllByProjectId(projectId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un diagrama completo con sus nodos y conexiones (AST)' })
  @ApiResponse({ status: 200, description: 'Diagrama y AST cargados', type: DiagramResponseDto })
  @ApiResponse({ status: 404, description: 'Diagrama no encontrado' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<DiagramResponseDto> {
    return this.diagramService.findOne(id, user.id);
  }

  @Put(':id/ast')
  @ApiOperation({ summary: 'Guardar y sincronizar el AST completo del diagrama (nodos, atributos, métodos, relaciones)' })
  @ApiResponse({ status: 200, description: 'AST persistido exitosamente en MongoDB', type: DiagramResponseDto })
  async saveAst(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() astDto: SaveDiagramAstDto,
    @CurrentUser() user: User,
  ): Promise<DiagramResponseDto> {
    return this.diagramService.saveAst(id, astDto, user.id);
  }

  @Get(':id/snapshots')
  @ApiOperation({ summary: 'Listar checkpoints/snapshots históricos del diagrama para recuperación entre días' })
  async listSnapshots(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<DiagramSnapshot[]> {
    return this.diagramService.listSnapshots(id, user.id);
  }

  @Post(':id/snapshots')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un checkpoint manual del estado actual del diagrama' })
  async createSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateSnapshotDto,
    @CurrentUser() user: User,
  ): Promise<DiagramSnapshot> {
    return this.diagramService.createSnapshot(id, user.id, body?.label);
  }

  @Post(':id/snapshots/:snapshotId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restaurar un checkpoint guardado del diagrama' })
  async restoreSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
    @CurrentUser() user: User,
  ): Promise<DiagramResponseDto> {
    return this.diagramService.restoreSnapshot(id, snapshotId, user.id);
  }

  @Patch(':id/annotations/:annotationId')
  @ApiOperation({ summary: 'Actualizar estado (applied / dismissed) de una anotación de IA en la pizarra' })
  async updateAnnotationStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('annotationId') annotationId: string,
    @Body() body: UpdateAiAnnotationStatusDto,
    @CurrentUser() user: User,
  ): Promise<DiagramResponseDto> {
    return this.diagramService.updateAiAnnotationStatus(
      id,
      annotationId,
      body.status,
      user.id,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar metadatos del diagrama (nombre, versión, estilo de línea)' })
  @ApiResponse({ status: 200, description: 'Diagrama actualizado', type: DiagramResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDiagramDto,
    @CurrentUser() user: User,
  ): Promise<DiagramResponseDto> {
    return this.diagramService.update(id, dto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un diagrama' })
  @ApiResponse({ status: 200, description: 'Diagrama eliminado' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<{ success: boolean; message: string }> {
    return this.diagramService.remove(id, user.id);
  }
}
