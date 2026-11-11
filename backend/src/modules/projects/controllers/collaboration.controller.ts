import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { YjsSyncService } from '../services/yjs-sync.service';
import { JoinRoomDto } from '../dtos/join-room.dto';
import { SessionResponseDto } from '../dtos/session-response.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../auth/entities/user.entity';

@ApiTags('collaboration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('collaboration/sessions')
export class CollaborationController {
  constructor(private readonly yjsSyncService: YjsSyncService) {}

  @Post('join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar o unirse a una sesión de colaboración en tiempo real' })
  @ApiResponse({ status: 200, description: 'Sesión activa obtenida o creada', type: SessionResponseDto })
  async joinSession(
    @Body() dto: JoinRoomDto,
    @CurrentUser() user: User,
  ): Promise<SessionResponseDto> {
    return this.yjsSyncService.joinOrCreateSession(dto, user.id);
  }

  @Get('diagram/:diagramId')
  @ApiOperation({ summary: 'Obtener la sesión de colaboración activa para un diagrama' })
  @ApiResponse({ status: 200, description: 'Sesión encontrada', type: SessionResponseDto })
  async getByDiagram(
    @Param('diagramId', ParseUUIDPipe) diagramId: string,
  ): Promise<SessionResponseDto | null> {
    return this.yjsSyncService.getActiveSessionByDiagram(diagramId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalles de una sesión de colaboración por ID' })
  @ApiResponse({ status: 200, description: 'Detalles de la sesión', type: SessionResponseDto })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada' })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SessionResponseDto> {
    return this.yjsSyncService.getSessionById(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Finalizar una sesión de colaboración' })
  @ApiResponse({ status: 200, description: 'Sesión finalizada exitosamente' })
  async closeSession(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.yjsSyncService.closeSession(id);
  }
}
