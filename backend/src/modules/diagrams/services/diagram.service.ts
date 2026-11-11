import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DiagramRepository } from '../repositories/diagram.repository';
import { ProjectRepository } from '../../projects/repositories/project.repository';
import { ProjectMemberRepository } from '../../projects/repositories/project-member.repository';
import { Diagram } from '../entities/diagram.entity';
import { UmlNode } from '../entities/uml-node.entity';
import { UmlAttribute } from '../entities/uml-attribute.entity';
import { UmlMethod } from '../entities/uml-method.entity';
import { UmlConnection } from '../entities/uml-connection.entity';
import { CreateDiagramDto } from '../dtos/create-diagram.dto';
import { UpdateDiagramDto } from '../dtos/update-diagram.dto';
import { SaveDiagramAstDto } from '../dtos/save-diagram-ast.dto';
import { DiagramResponseDto } from '../dtos/diagram-response.dto';
import { ProjectRole } from '../../projects/entities/project-role.enum';

@Injectable()
export class DiagramService {
  constructor(
    private readonly diagramRepository: DiagramRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly projectMemberRepository: ProjectMemberRepository,
    private readonly dataSource: DataSource,
  ) {}

  private async checkProjectAccess(projectId: string, userId: string, requireWrite = false): Promise<void> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundException('El proyecto asociado no existe');
    }

    const role = await this.projectMemberRepository.findRole(projectId, userId);
    const isOwnerOrCreator = role === ProjectRole.OWNER || project.createdBy === userId;
    const isEditor = role === ProjectRole.EDITOR;

    if (!role && !isOwnerOrCreator) {
      throw new ForbiddenException('No tienes acceso a este proyecto ni a sus diagramas');
    }

    if (requireWrite && !isOwnerOrCreator && !isEditor) {
      throw new ForbiddenException('Solo los editores y propietarios pueden modificar diagramas');
    }
  }

  async create(dto: CreateDiagramDto, userId: string): Promise<DiagramResponseDto> {
    await this.checkProjectAccess(dto.projectId, userId, true);

    const diagramEntity = this.diagramRepository.create({
      projectId: dto.projectId,
      name: dto.name.trim(),
      version: dto.version || '1.0.0',
      defaultLineStyle: dto.defaultLineStyle || 'segment',
    });

    const saved = await this.diagramRepository.save(diagramEntity);
    const fullDiagram = await this.diagramRepository.findById(saved.id);
    return DiagramResponseDto.fromEntity(fullDiagram!);
  }

  async findAllByProjectId(projectId: string, userId: string): Promise<DiagramResponseDto[]> {
    await this.checkProjectAccess(projectId, userId, false);
    const diagrams = await this.diagramRepository.findAllByProjectId(projectId);
    return diagrams.map((d) => DiagramResponseDto.fromEntity(d));
  }

  async findOne(id: string, userId: string): Promise<DiagramResponseDto> {
    const diagram = await this.diagramRepository.findById(id);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    if (diagram.projectId) {
      await this.checkProjectAccess(diagram.projectId, userId, false);
    }

    return DiagramResponseDto.fromEntity(diagram);
  }

  async update(id: string, dto: UpdateDiagramDto, userId: string): Promise<DiagramResponseDto> {
    const diagram = await this.diagramRepository.findById(id);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    if (diagram.projectId) {
      await this.checkProjectAccess(diagram.projectId, userId, true);
    }

    await this.diagramRepository.update(id, {
      ...(dto.name && { name: dto.name.trim() }),
      ...(dto.version && { version: dto.version }),
      ...(dto.defaultLineStyle && { defaultLineStyle: dto.defaultLineStyle }),
    });

    const updated = await this.diagramRepository.findById(id);
    return DiagramResponseDto.fromEntity(updated!);
  }

  async saveAst(id: string, astDto: SaveDiagramAstDto, userId?: string): Promise<DiagramResponseDto> {
    const diagram = await this.diagramRepository.findById(id);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    if (diagram.projectId && userId) {
      await this.checkProjectAccess(diagram.projectId, userId, true);
    }

    await this.dataSource.transaction(async (manager) => {
      // 1. Limpiar conexiones y nodos existentes del diagrama
      await manager.delete(UmlConnection, { diagramId: id });

      const existingNodes = await manager.find(UmlNode, { where: { diagramId: id } });
      const nodeIds = existingNodes.map((n) => n.id);

      if (nodeIds.length > 0) {
        await manager
          .createQueryBuilder()
          .delete()
          .from(UmlAttribute)
          .where('node_id IN (:...nodeIds)', { nodeIds })
          .execute();

        await manager
          .createQueryBuilder()
          .delete()
          .from(UmlMethod)
          .where('node_id IN (:...nodeIds)', { nodeIds })
          .execute();

        await manager.delete(UmlNode, { diagramId: id });
      }

      // 2. Insertar nodos nuevos con atributos y métodos
      for (const nodeDto of astDto.nodes) {
        const node = manager.create(UmlNode, {
          id: nodeDto.id,
          diagramId: id,
          name: nodeDto.name !== undefined ? nodeDto.name : (nodeDto.isAnchor ? '' : 'ClassName'),
          positionX: nodeDto.positionX,
          positionY: nodeDto.positionY,
          width: nodeDto.width !== undefined ? nodeDto.width : (nodeDto.isAnchor ? 0 : 220),
          height: nodeDto.height || null,
          isAnchor: nodeDto.isAnchor || false,
          assocMainConnId: nodeDto.assocMainConnId || null,
        });
        await manager.save(node);

        if (nodeDto.attributes && nodeDto.attributes.length > 0) {
          const attributes = nodeDto.attributes.map((attr, index) =>
            manager.create(UmlAttribute, {
              nodeId: node.id,
              name: attr.name,
              type: attr.type,
              orderIndex: attr.orderIndex !== undefined ? attr.orderIndex : index,
            }),
          );
          await manager.save(attributes);
        }

        if (nodeDto.methods && nodeDto.methods.length > 0) {
          const methods = nodeDto.methods.map((method, index) =>
            manager.create(UmlMethod, {
              nodeId: node.id,
              name: method.name,
              parameters: method.parameters || '',
              returnType: method.returnType,
              orderIndex: method.orderIndex !== undefined ? method.orderIndex : index,
            }),
          );
          await manager.save(methods);
        }
      }

      // 3. Insertar conexiones nuevas
      if (astDto.connections && astDto.connections.length > 0) {
        const connections = astDto.connections.map((connDto) =>
          manager.create(UmlConnection, {
            id: connDto.id,
            diagramId: id,
            sourceNodeId: connDto.sourceNodeId,
            targetNodeId: connDto.targetNodeId,
            sourceId: connDto.sourceId,
            targetId: connDto.targetId,
            type: connDto.type,
            lineStyle: connDto.lineStyle || 'segment',
            name: connDto.name || null,
            sourceMultiplicity: connDto.sourceMultiplicity || '1',
            targetMultiplicity: connDto.targetMultiplicity || '0..*',
            assocAnchorNodeId: connDto.assocAnchorNodeId || null,
          }),
        );
        await manager.save(connections);
      }

      // 4. Actualizar fecha de modificación y estilo de línea por defecto
      await manager.update(Diagram, id, {
        ...(astDto.defaultLineStyle && { defaultLineStyle: astDto.defaultLineStyle }),
        updatedAt: new Date(),
      });
    });

    const updatedDiagram = await this.diagramRepository.findById(id);
    return DiagramResponseDto.fromEntity(updatedDiagram!);
  }

  async remove(id: string, userId: string): Promise<{ success: boolean; message: string }> {
    const diagram = await this.diagramRepository.findById(id);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    if (diagram.projectId) {
      await this.checkProjectAccess(diagram.projectId, userId, true);
    }

    await this.diagramRepository.delete(id);
    return { success: true, message: 'Diagrama eliminado exitosamente' };
  }
}
