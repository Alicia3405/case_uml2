import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { ProjectRepository } from '../repositories/project.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { UserRepository } from '../../auth/repositories/user.repository';
import { AddMemberDto } from '../dtos/add-member.dto';
import { UpdateMemberRoleDto } from '../dtos/update-member-role.dto';
import { ProjectMemberResponseDto } from '../dtos/project-member-response.dto';
import { ProjectRole } from '../entities/project-role.enum';
import { CollaborationGateway } from '../gateways/collaboration.gateway';

@Injectable()
export class ProjectMemberService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly projectMemberRepository: ProjectMemberRepository,
    private readonly userRepository: UserRepository,
    @Optional() private readonly collaborationGateway?: CollaborationGateway,
  ) {}

  async getProjectMembers(projectId: string, userId: string): Promise<ProjectMemberResponseDto[]> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    const role = await this.projectMemberRepository.findRole(projectId, userId);
    if (!role && project.createdBy !== userId) {
      throw new ForbiddenException('No tienes acceso a los miembros de este proyecto');
    }

    const members = await this.projectMemberRepository.findByProjectId(projectId);
    return members.map((m) => ProjectMemberResponseDto.fromEntity(m));
  }

  async addMember(projectId: string, dto: AddMemberDto, currentUserId: string): Promise<ProjectMemberResponseDto> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    const currentRole = await this.projectMemberRepository.findRole(projectId, currentUserId);
    if (currentRole !== ProjectRole.OWNER && project.createdBy !== currentUserId) {
      throw new ForbiddenException('Solo el propietario puede agregar miembros al proyecto');
    }

    const targetUser = await this.userRepository.findByEmail(dto.email.trim().toLowerCase());
    if (!targetUser) {
      throw new NotFoundException(`No se encontró ningún usuario con el correo: ${dto.email}`);
    }

    const existingMember = await this.projectMemberRepository.findByProjectIdAndUserId(projectId, targetUser.id);
    if (existingMember) {
      throw new ConflictException('El usuario ya es miembro de este proyecto');
    }

    const role = dto.role || ProjectRole.EDITOR;
    const canDownloadCode =
      dto.canDownloadCode !== undefined ? dto.canDownloadCode : role !== ProjectRole.VIEWER;

    const newMemberEntity = this.projectMemberRepository.create({
      projectId,
      userId: targetUser.id,
      role,
      canDownloadCode,
    });
    const savedMember = await this.projectMemberRepository.save(newMemberEntity);
    savedMember.user = targetUser;

    return ProjectMemberResponseDto.fromEntity(savedMember);
  }

  async updateMemberRole(
    projectId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
    currentUserId: string,
  ): Promise<ProjectMemberResponseDto> {
    if (dto.role === undefined && dto.canDownloadCode === undefined) {
      throw new BadRequestException('Debe especificar el nuevo rol o el permiso de descarga');
    }

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    const currentRole = await this.projectMemberRepository.findRole(projectId, currentUserId);
    if (currentRole !== ProjectRole.OWNER && project.createdBy !== currentUserId) {
      throw new ForbiddenException('Solo el propietario puede cambiar los roles y permisos de los miembros');
    }

    if (project.createdBy === targetUserId) {
      throw new BadRequestException('No puedes cambiar los permisos del creador principal del proyecto');
    }

    const member = await this.projectMemberRepository.findByProjectIdAndUserId(projectId, targetUserId);
    if (!member) {
      throw new NotFoundException('El usuario no es miembro de este proyecto');
    }

    const updatePayload: { role?: ProjectRole; canDownloadCode?: boolean } = {};
    if (dto.role !== undefined) {
      updatePayload.role = dto.role;
    }
    if (dto.canDownloadCode !== undefined) {
      updatePayload.canDownloadCode = dto.canDownloadCode;
    }

    if (typeof this.projectMemberRepository.updateMember === 'function') {
      await this.projectMemberRepository.updateMember(projectId, targetUserId, updatePayload);
    } else if (dto.role !== undefined) {
      await this.projectMemberRepository.updateRole(projectId, targetUserId, dto.role);
    }

    const updated = await this.projectMemberRepository.findByProjectIdAndUserId(projectId, targetUserId);
    const response = ProjectMemberResponseDto.fromEntity(updated!);

    const diagramIds = (project.diagrams || []).map((d) => d.id);
    if (diagramIds.length > 0) {
      this.collaborationGateway?.emitProjectPermissionsUpdated(diagramIds, {
        projectId,
        userId: targetUserId,
        role: response.role,
        canDownloadCode: response.canDownloadCode,
      });
    }

    return response;
  }

  async removeMember(
    projectId: string,
    targetUserId: string,
    currentUserId: string,
  ): Promise<{ success: boolean; message: string }> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    const currentRole = await this.projectMemberRepository.findRole(projectId, currentUserId);
    const isOwner = currentRole === ProjectRole.OWNER || project.createdBy === currentUserId;
    const isSelf = targetUserId === currentUserId;

    if (!isOwner && !isSelf) {
      throw new ForbiddenException('No tienes permisos para remover a este miembro');
    }

    if (project.createdBy === targetUserId) {
      throw new BadRequestException('El creador principal no puede abandonar el proyecto');
    }

    const member = await this.projectMemberRepository.findByProjectIdAndUserId(projectId, targetUserId);
    if (!member) {
      throw new NotFoundException('El usuario no es miembro de este proyecto');
    }

    await this.projectMemberRepository.delete(projectId, targetUserId);

    const diagramIds = (project.diagrams || []).map((d) => d.id);
    if (diagramIds.length > 0) {
      this.collaborationGateway?.emitProjectPermissionsUpdated(diagramIds, {
        projectId,
        userId: targetUserId,
        removed: true,
      });
    }

    return { success: true, message: 'Miembro removido exitosamente' };
  }
}
