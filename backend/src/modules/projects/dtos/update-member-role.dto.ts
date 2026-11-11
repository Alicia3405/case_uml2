import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectRole } from '../entities/project-role.enum';

export class UpdateMemberRoleDto {
  @ApiPropertyOptional({ enum: ProjectRole, example: ProjectRole.EDITOR })
  @IsOptional()
  @IsEnum(ProjectRole, { message: 'El rol debe ser OWNER, EDITOR o VIEWER' })
  role?: ProjectRole;

  @ApiPropertyOptional({
    example: false,
    description: 'Habilita o restringe la descarga/exportación de código generado para este miembro',
  })
  @IsOptional()
  @IsBoolean({ message: 'El permiso canDownloadCode debe ser booleano' })
  canDownloadCode?: boolean;
}
