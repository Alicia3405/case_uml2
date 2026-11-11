import { Injectable, Logger, OnApplicationBootstrap, Inject, forwardRef } from '@nestjs/common';
import { AuthSeedService } from '../../auth/services/auth-seed.service';
import { User } from '../../auth/entities/user.entity';
import { ProjectRole } from '../entities/project-role.enum';
import { ProjectRepository } from '../repositories/project.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { SessionRepository } from '../repositories/session.repository';
import { DiagramRepository } from '../../diagrams/repositories/diagram.repository';
import { DiagramService } from '../../diagrams/services/diagram.service';
import { SaveDiagramAstDto } from '../../diagrams/dtos/save-diagram-ast.dto';
import { getUtcDateKey } from '../../../common/utils/mongoose-entity.util';

export interface DemoMemberSeedSpec {
  email: string;
  role: ProjectRole;
  canDownloadCode: boolean;
}

export interface DemoProjectSeedSpec {
  name: string;
  description: string;
  basePackage: string;
  javaVersion: number;
  springBootVersion: string;
  ownerEmail: string;
  diagramName: string;
  roomCode: string;
  members: DemoMemberSeedSpec[];
  ast: SaveDiagramAstDto;
}

export const DEMO_COLLAB_PROJECTS: DemoProjectSeedSpec[] = [
  {
    name: 'Ecommerce Colaborativo Demo',
    description:
      'Proyecto demo pre-poblado para probar colaboración WebSocket en tiempo real con 4 roles simultáneos (OWNER, EDITOR+ZIP, EDITOR sin ZIP y VIEWER).',
    basePackage: 'com.casestudio.ecommerce',
    javaVersion: 21,
    springBootVersion: '3.4.0',
    ownerEmail: 'cesar@uagrm.edu.bo',
    diagramName: 'Ecommerce UML Core',
    roomCode: 'ECOM-2026',
    members: [
      { email: 'cesar@uagrm.edu.bo', role: ProjectRole.OWNER, canDownloadCode: true },
      { email: 'ana@uagrm.edu.bo', role: ProjectRole.EDITOR, canDownloadCode: true },
      { email: 'luis@uagrm.edu.bo', role: ProjectRole.EDITOR, canDownloadCode: false },
      { email: 'sofia@uagrm.edu.bo', role: ProjectRole.VIEWER, canDownloadCode: false },
    ],
    ast: {
      defaultLineStyle: 'segment',
      nodes: [
        {
          id: 'seed_ecom_node_usuario',
          name: 'Usuario',
          elementType: 'CLASS',
          positionX: 80,
          positionY: 90,
          width: 240,
          attributes: [
            { name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false, orderIndex: 0 },
            { name: 'nombre', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 1 },
            { name: 'email', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 2 },
            { name: 'activo', type: 'Boolean', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 3 },
          ],
          methods: [
            { name: 'validarAcceso', parameters: 'clave: String', returnType: 'Boolean', visibility: '+', orderIndex: 0 },
          ],
        },
        {
          id: 'seed_ecom_node_pedido',
          name: 'Pedido',
          elementType: 'CLASS',
          positionX: 430,
          positionY: 80,
          width: 250,
          attributes: [
            { name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false, orderIndex: 0 },
            { name: 'codigo', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 1 },
            { name: 'fechaCreacion', type: 'LocalDateTime', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 2 },
            { name: 'total', type: 'BigDecimal', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 3 },
          ],
          methods: [
            { name: 'calcularTotal', parameters: '', returnType: 'BigDecimal', visibility: '+', orderIndex: 0 },
            { name: 'confirmar', parameters: '', returnType: 'void', visibility: '+', orderIndex: 1 },
          ],
        },
        {
          id: 'seed_ecom_node_detalle',
          name: 'DetallePedido',
          elementType: 'CLASS',
          positionX: 810,
          positionY: 90,
          width: 240,
          attributes: [
            { name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false, orderIndex: 0 },
            { name: 'cantidad', type: 'Integer', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 1 },
            { name: 'precioUnitario', type: 'BigDecimal', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 2 },
          ],
          methods: [
            { name: 'subtotal', parameters: '', returnType: 'BigDecimal', visibility: '+', orderIndex: 0 },
          ],
        },
        {
          id: 'seed_ecom_node_producto',
          name: 'Producto',
          elementType: 'CLASS',
          positionX: 810,
          positionY: 360,
          width: 240,
          attributes: [
            { name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false, orderIndex: 0 },
            { name: 'sku', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 1 },
            { name: 'nombre', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 2 },
            { name: 'precio', type: 'BigDecimal', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 3 },
            { name: 'stock', type: 'Integer', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 4 },
          ],
          methods: [
            { name: 'descontarStock', parameters: 'unidades: Integer', returnType: 'Boolean', visibility: '+', orderIndex: 0 },
          ],
        },
        {
          id: 'seed_ecom_node_estado',
          name: 'EstadoPedido',
          elementType: 'ENUM',
          stereotype: '«enumeration»',
          positionX: 430,
          positionY: 380,
          width: 230,
          attributes: [
            { name: 'PENDIENTE', type: 'EnumConstant', visibility: '+', isPrimaryKey: false, isNullable: false, orderIndex: 0 },
            { name: 'PAGADO', type: 'EnumConstant', visibility: '+', isPrimaryKey: false, isNullable: false, orderIndex: 1 },
            { name: 'ENVIADO', type: 'EnumConstant', visibility: '+', isPrimaryKey: false, isNullable: false, orderIndex: 2 },
            { name: 'CANCELADO', type: 'EnumConstant', visibility: '+', isPrimaryKey: false, isNullable: false, orderIndex: 3 },
          ],
          methods: [],
        },
        {
          id: 'seed_ecom_node_nota',
          name: 'Guía Sala ECOM-2026',
          elementType: 'NOTE',
          noteContent:
            'Equipo Demo 4 Usuarios: Cesar (OWNER), Ana (EDITOR+ZIP), Luis (EDITOR sin ZIP) y Sofía (VIEWER solo lectura).',
          positionX: 80,
          positionY: 380,
          width: 250,
          attributes: [],
          methods: [],
        },
      ],
      connections: [
        {
          id: 'seed_ecom_conn_usuario_pedido',
          sourceNodeId: 'seed_ecom_node_usuario',
          targetNodeId: 'seed_ecom_node_pedido',
          sourceId: 'seed_ecom_node_usuario_right',
          targetId: 'seed_ecom_node_pedido_left',
          type: 'association',
          lineStyle: 'segment',
          name: 'realiza',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
        {
          id: 'seed_ecom_conn_pedido_detalle',
          sourceNodeId: 'seed_ecom_node_pedido',
          targetNodeId: 'seed_ecom_node_detalle',
          sourceId: 'seed_ecom_node_pedido_right',
          targetId: 'seed_ecom_node_detalle_left',
          type: 'composition',
          lineStyle: 'segment',
          name: 'contiene',
          sourceMultiplicity: '1',
          targetMultiplicity: '1..*',
        },
        {
          id: 'seed_ecom_conn_producto_detalle',
          sourceNodeId: 'seed_ecom_node_producto',
          targetNodeId: 'seed_ecom_node_detalle',
          sourceId: 'seed_ecom_node_producto_top',
          targetId: 'seed_ecom_node_detalle_bottom',
          type: 'association',
          lineStyle: 'segment',
          name: 'referencia',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
        {
          id: 'seed_ecom_conn_pedido_estado',
          sourceNodeId: 'seed_ecom_node_pedido',
          targetNodeId: 'seed_ecom_node_estado',
          sourceId: 'seed_ecom_node_pedido_bottom',
          targetId: 'seed_ecom_node_estado_top',
          type: 'dependency',
          lineStyle: 'segment',
          name: 'usa',
          sourceMultiplicity: '1',
          targetMultiplicity: '1',
        },
      ],
    },
  },
  {
    name: 'Sistema Clinica Universitaria',
    description:
      'Segundo proyecto colaborativo multiusuario donde Ana es OWNER, Cesar y Luis son EDITOR (con ZIP) y Sofía participa como VIEWER.',
    basePackage: 'edu.uagrm.clinica',
    javaVersion: 21,
    springBootVersion: '3.4.0',
    ownerEmail: 'ana@uagrm.edu.bo',
    diagramName: 'Modelo Clinica UML',
    roomCode: 'CLIN-2026',
    members: [
      { email: 'ana@uagrm.edu.bo', role: ProjectRole.OWNER, canDownloadCode: true },
      { email: 'cesar@uagrm.edu.bo', role: ProjectRole.EDITOR, canDownloadCode: true },
      { email: 'luis@uagrm.edu.bo', role: ProjectRole.EDITOR, canDownloadCode: true },
      { email: 'sofia@uagrm.edu.bo', role: ProjectRole.VIEWER, canDownloadCode: false },
    ],
    ast: {
      defaultLineStyle: 'segment',
      nodes: [
        {
          id: 'seed_clin_node_persona',
          name: 'Persona',
          elementType: 'CLASS',
          positionX: 400,
          positionY: 70,
          width: 240,
          attributes: [
            { name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false, orderIndex: 0 },
            { name: 'ci', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 1 },
            { name: 'nombreCompleto', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 2 },
            { name: 'telefono', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: true, orderIndex: 3 },
          ],
          methods: [],
        },
        {
          id: 'seed_clin_node_paciente',
          name: 'Paciente',
          elementType: 'CLASS',
          positionX: 160,
          positionY: 320,
          width: 240,
          attributes: [
            { name: 'historiaClinica', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 0 },
            { name: 'grupoSanguineo', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: true, orderIndex: 1 },
          ],
          methods: [],
        },
        {
          id: 'seed_clin_node_medico',
          name: 'Medico',
          elementType: 'CLASS',
          positionX: 640,
          positionY: 320,
          width: 240,
          attributes: [
            { name: 'matriculaProfesional', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 0 },
            { name: 'especialidad', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 1 },
          ],
          methods: [],
        },
        {
          id: 'seed_clin_node_cita',
          name: 'CitaMedica',
          elementType: 'CLASS',
          positionX: 400,
          positionY: 570,
          width: 250,
          attributes: [
            { name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false, orderIndex: 0 },
            { name: 'fechaHora', type: 'LocalDateTime', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 1 },
            { name: 'motivo', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 2 },
            { name: 'confirmada', type: 'Boolean', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 3 },
          ],
          methods: [
            { name: 'reprogramar', parameters: 'nuevaFecha: LocalDateTime', returnType: 'void', visibility: '+', orderIndex: 0 },
          ],
        },
      ],
      connections: [
        {
          id: 'seed_clin_conn_pac_pers',
          sourceNodeId: 'seed_clin_node_paciente',
          targetNodeId: 'seed_clin_node_persona',
          sourceId: 'seed_clin_node_paciente_top',
          targetId: 'seed_clin_node_persona_bottom',
          type: 'generalization',
          lineStyle: 'segment',
          sourceMultiplicity: '1',
          targetMultiplicity: '1',
        },
        {
          id: 'seed_clin_conn_med_pers',
          sourceNodeId: 'seed_clin_node_medico',
          targetNodeId: 'seed_clin_node_persona',
          sourceId: 'seed_clin_node_medico_top',
          targetId: 'seed_clin_node_persona_bottom',
          type: 'generalization',
          lineStyle: 'segment',
          sourceMultiplicity: '1',
          targetMultiplicity: '1',
        },
        {
          id: 'seed_clin_conn_pac_cita',
          sourceNodeId: 'seed_clin_node_paciente',
          targetNodeId: 'seed_clin_node_cita',
          sourceId: 'seed_clin_node_paciente_bottom',
          targetId: 'seed_clin_node_cita_left',
          type: 'association',
          lineStyle: 'segment',
          name: 'agenda',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
        {
          id: 'seed_clin_conn_med_cita',
          sourceNodeId: 'seed_clin_node_medico',
          targetNodeId: 'seed_clin_node_cita',
          sourceId: 'seed_clin_node_medico_bottom',
          targetId: 'seed_clin_node_cita_right',
          type: 'association',
          lineStyle: 'segment',
          name: 'atiende',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
      ],
    },
  },
];

@Injectable()
export class DemoCollabSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoCollabSeedService.name);

  constructor(
    private readonly authSeedService: AuthSeedService,
    private readonly projectRepository: ProjectRepository,
    private readonly projectMemberRepository: ProjectMemberRepository,
    @Inject(forwardRef(() => DiagramRepository))
    private readonly diagramRepository: DiagramRepository,
    @Inject(forwardRef(() => DiagramService))
    private readonly diagramService: DiagramService,
    private readonly sessionRepository: SessionRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedIfNeeded();
  }

  /**
   * Pobla de forma idempotente proyectos colaborativos con 4 miembros,
   * diagramas UML iniciales y salas activas de WebSocket sin sobreescribir
   * ediciones posteriores hechas por los usuarios.
   */
  async seedIfNeeded(): Promise<void> {
    try {
      const users = await this.authSeedService.ensureDemoUsersSeeded();
      if (users.length === 0) {
        return;
      }

      const usersByEmail = new Map<string, User>(
        users.map((u) => [u.email.toLowerCase(), u]),
      );

      let seededProjects = 0;

      for (const spec of DEMO_COLLAB_PROJECTS) {
        const owner = usersByEmail.get(spec.ownerEmail.toLowerCase());
        if (!owner) continue;

        const ownerProjects = await this.projectRepository.findAllForUser(owner.id);
        let project = ownerProjects.find(
          (p) => p.name === spec.name && p.createdBy === owner.id,
        );

        let isNewProject = false;
        if (!project) {
          const created = this.projectRepository.create({
            name: spec.name,
            description: spec.description,
            basePackage: spec.basePackage,
            javaVersion: spec.javaVersion,
            springBootVersion: spec.springBootVersion,
            createdBy: owner.id,
          });
          project = await this.projectRepository.save(created);
          isNewProject = true;
          seededProjects++;
        }

        // Garantizar que los 4 miembros existan sin alterar roles editados manualmente después
        for (const memberSpec of spec.members) {
          const memberUser = usersByEmail.get(memberSpec.email.toLowerCase());
          if (!memberUser) continue;

          const existingMember = await this.projectMemberRepository.findByProjectIdAndUserId(
            project.id,
            memberUser.id,
          );
          if (!existingMember) {
            const member = this.projectMemberRepository.create({
              projectId: project.id,
              userId: memberUser.id,
              role: memberSpec.role,
              canDownloadCode: memberSpec.canDownloadCode,
            });
            await this.projectMemberRepository.save(member);
          }
        }

        // Crear diagrama inicial y AST solo si el proyecto aún no tiene diagramas
        const diagrams = await this.diagramRepository.findAllByProjectId(project.id);
        let primaryDiagramId = diagrams[0]?.id;

        if (!primaryDiagramId) {
          const diagramEntity = this.diagramRepository.create({
            projectId: project.id,
            name: spec.diagramName,
            version: '1.0.0',
            defaultLineStyle: spec.ast.defaultLineStyle || 'segment',
          });
          const savedDiagram = await this.diagramRepository.save(diagramEntity);
          primaryDiagramId = savedDiagram.id;
          await this.diagramService.saveAst(primaryDiagramId, spec.ast, owner.id);
        }

        // Garantizar una sala de colaboración activa para este diagrama
        const existingSession = await this.sessionRepository.findActiveByDiagramId(primaryDiagramId);
        if (!existingSession) {
          const existingCode = await this.sessionRepository.findByRoomCode(spec.roomCode);
          if (!existingCode) {
            const today = getUtcDateKey();
            const sessionEntity = this.sessionRepository.create({
              diagramId: primaryDiagramId,
              projectId: project.id,
              roomCode: spec.roomCode,
              isActive: true,
              hostUserId: owner.id,
              hostUserName: owner.fullName,
              sessionNumber: 1,
              activeDateKeys: [today],
              lastActiveDay: today,
              resumeSummary: `Proyecto demo "${spec.name}" listo para co-diseño colaborativo multiusuario.`,
            });
            await this.sessionRepository.save(sessionEntity);
          }
        }

        if (isNewProject) {
          this.logger.log(
            `🤝 Proyecto colaborativo seed creado: "${spec.name}" | Sala: ${spec.roomCode} | Diagrama: ${primaryDiagramId}`,
          );
        }
      }

      if (seededProjects > 0) {
        this.logger.log(`✅ Seed colaborativo completo (${seededProjects} proyectos listos para pruebas multiusuario).`);
      }
    } catch (error: any) {
      this.logger.warn(`No se pudo inicializar el seed colaborativo demo: ${error?.message || error}`);
    }
  }
}

