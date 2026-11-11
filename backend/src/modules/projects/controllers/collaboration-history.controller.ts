import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../auth/entities/user.entity';
import { YjsSyncService } from '../services/yjs-sync.service';
import { IsUUID } from 'class-validator';

class TransferHostDto {
  @IsUUID()
  targetUserId: string;
}

@ApiTags('collaboration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('collaboration')
export class CollaborationHistoryController {
  constructor(private readonly yjsSyncService: YjsSyncService) {}

  @Get('diagrams/:diagramId/resume')
  @ApiOperation({
    summary: 'Obtener paquete completo para retomar trabajo multi-sesión (resumen, historial, contribuciones, snapshots, alertas)',
  })
  @ApiResponse({ status: 200, description: 'Resumen multi-día e historial persistente' })
  async getResumeBundle(
    @Param('diagramId', ParseUUIDPipe) diagramId: string,
    @CurrentUser() user: User,
  ) {
    return this.yjsSyncService.getResumeBundle(diagramId, user.id);
  }

  @Get('diagrams/:diagramId/contributions')
  @ApiOperation({
    summary: 'Obtener métricas de autoría y contribución por colaborador y por nodo',
  })
  @ApiResponse({ status: 200, description: 'Reporte de contribuciones por autor' })
  async getContributions(
    @Param('diagramId', ParseUUIDPipe) diagramId: string,
    @CurrentUser() user: User,
  ) {
    return this.yjsSyncService.getContributionReport(diagramId, user.id);
  }

  @Post('sessions/:id/transfer-host')
  @ApiOperation({
    summary: 'Transferir manualmente el rol de anfitrión de sala a otro colaborador activo',
  })
  @ApiResponse({ status: 200, description: 'Anfitrión transferido' })
  async transferHost(
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() dto: TransferHostDto,
    @CurrentUser() user: User,
  ) {
    return this.yjsSyncService.transferHostManually(
      sessionId,
      user.id,
      dto.targetUserId,
    );
  }

  @Get('notifications')
  @ApiOperation({
    summary: 'Listar notificaciones persistentes (@menciones, avisos disciplinarios e historial)',
  })
  @ApiResponse({ status: 200, description: 'Notificaciones para el usuario autenticado' })
  async listNotifications(
    @CurrentUser() user: User,
    @Query('diagramId') diagramId?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.yjsSyncService.listNotificationsForUser(
      user.id,
      diagramId,
      unreadOnly === 'true',
    );
  }

  @Patch('notifications/:id/read')
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.yjsSyncService.markNotificationRead(id, user.id);
  }

  @Post('diagrams/:diagramId/notifications/read-all')
  @ApiOperation({ summary: 'Marcar como leídas todas las notificaciones de un diagrama' })
  async markAllRead(
    @Param('diagramId', ParseUUIDPipe) diagramId: string,
    @CurrentUser() user: User,
  ) {
    return this.yjsSyncService.markAllNotificationsRead(diagramId, user.id);
  }
}

