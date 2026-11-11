import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { DiagramService } from './diagram.service';
import { DiagramRepository } from '../repositories/diagram.repository';
import { DiagramSnapshotRepository } from '../repositories/diagram-snapshot.repository';
import { ProjectRepository } from '../../projects/repositories/project.repository';
import { ProjectMemberRepository } from '../../projects/repositories/project-member.repository';
import { UserRepository } from '../../auth/repositories/user.repository';
import { AuthorEventRepository } from '../../projects/repositories/author-event.repository';
import { SessionRepository } from '../../projects/repositories/session.repository';
import { ProjectRole } from '../../projects/entities/project-role.enum';
import { Diagram } from '../entities/diagram.entity';
import { Project } from '../../projects/entities/project.entity';

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SaveDiagramAstDto } from '../dtos/save-diagram-ast.dto';

describe('DiagramService', () => {
  let service: DiagramService;
  let diagramRepo: jest.Mocked<Partial<DiagramRepository>>;
  let snapshotRepo: jest.Mocked<Partial<DiagramSnapshotRepository>>;
  let projectRepo: jest.Mocked<Partial<ProjectRepository>>;
  let memberRepo: jest.Mocked<Partial<ProjectMemberRepository>>;
  let userRepo: jest.Mocked<Partial<UserRepository>>;
  let authorEventRepo: jest.Mocked<Partial<AuthorEventRepository>>;
  let sessionRepo: jest.Mocked<Partial<SessionRepository>>;

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockProjectId = '22222222-2222-2222-2222-222222222222';
  const mockDiagramId = '33333333-3333-3333-3333-333333333333';

  const mockProject: Project = {
    id: mockProjectId,
    name: 'Test Project',
    description: null,
    basePackage: 'com.example.app',
    javaVersion: 21,
    springBootVersion: '3.3.0',
    createdBy: mockUserId,
    createdAt: new Date(),
    creator: {} as any,
    members: [],
    diagrams: [],
  };

  const mockDiagram: Diagram = {
    id: mockDiagramId,
    projectId: mockProjectId,
    name: 'Main Class Diagram',
    version: '1.0.0',
    defaultLineStyle: 'segment',
    yjsBinaryState: null,
    revisionCount: 1,
    lastModifiedByUserId: mockUserId,
    lastModifiedByName: 'Cesar Quispe Delgado',
    lastModifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    project: mockProject,
    nodes: [
      {
        id: 'node_1',
        diagramId: mockDiagramId,
        name: 'Usuario',
        elementType: 'CLASS',
        stereotype: null,
        noteContent: null,
        positionX: 100,
        positionY: 200,
        width: 220,
        height: 150,
        isAnchor: false,
        assocMainConnId: null,
        attributes: [
          {
            name: 'id',
            type: 'UUID',
            visibility: '-',
            isPrimaryKey: true,
            isNullable: false,
            orderIndex: 0,
          },
        ],
        methods: [
          {
            name: 'getId',
            parameters: '',
            returnType: 'UUID',
            visibility: '+',
            orderIndex: 0,
          },
        ],
      },
    ],
    connections: [],
    aiAnnotations: [],
  };

  beforeEach(async () => {
    diagramRepo = {
      create: jest.fn().mockImplementation((data) => ({ ...data, id: mockDiagramId } as Diagram)),
      save: jest.fn().mockResolvedValue(mockDiagram),
      findAllByProjectId: jest.fn(),
      findById: jest.fn(),
      saveAstAtomic: jest.fn().mockImplementation(async (_id, payload) => ({
        ...mockDiagram,
        nodes: payload.nodes,
        connections: payload.connections,
        defaultLineStyle: payload.defaultLineStyle || mockDiagram.defaultLineStyle,
        lastModifiedByUserId: payload.lastModifiedByUserId,
        lastModifiedByName: payload.lastModifiedByName,
        lastModifiedAt: payload.lastModifiedAt,
        revisionCount: (mockDiagram.revisionCount || 0) + 1,
      })),
      updateAiAnnotations: jest.fn().mockImplementation(async (_id, annotations) => ({
        ...mockDiagram,
        aiAnnotations: annotations,
      })),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    snapshotRepo = {
      createAndSave: jest.fn().mockImplementation(async (data) => ({ ...data, id: 'snap-1' } as any)),
      findByDiagramId: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      deleteByDiagramIds: jest.fn().mockResolvedValue(undefined),
    };

    projectRepo = {
      findById: jest.fn(),
    };

    memberRepo = {
      findRole: jest.fn(),
    };

    userRepo = {
      findById: jest.fn().mockResolvedValue({
        id: mockUserId,
        fullName: 'Cesar Quispe Delgado',
        email: 'cesar@uagrm.edu.bo',
      } as any),
    };

    authorEventRepo = {
      createAndSave: jest.fn().mockResolvedValue({ id: 'ev-1' } as any),
    };

    sessionRepo = {
      findActiveByDiagramId: jest.fn().mockResolvedValue({
        id: 'sess-1',
        diagramId: mockDiagramId,
        roomCode: 'ECOM-2026',
        sessionNumber: 1,
      } as any),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiagramService,
        { provide: DiagramRepository, useValue: diagramRepo },
        { provide: DiagramSnapshotRepository, useValue: snapshotRepo },
        { provide: ProjectRepository, useValue: projectRepo },
        { provide: ProjectMemberRepository, useValue: memberRepo },
        { provide: UserRepository, useValue: userRepo },
        { provide: AuthorEventRepository, useValue: authorEventRepo },
        { provide: SessionRepository, useValue: sessionRepo },
      ],
    }).compile();

    service = module.get<DiagramService>(DiagramService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('debe crear un nuevo diagrama si el usuario tiene rol OWNER/EDITOR', async () => {
      projectRepo.findById!.mockResolvedValue(mockProject);
      memberRepo.findRole!.mockResolvedValue(ProjectRole.OWNER);
      diagramRepo.findById!.mockResolvedValue(mockDiagram);

      const result = await service.create(
        {
          projectId: mockProjectId,
          name: 'Main Class Diagram',
          version: '1.0.0',
        },
        mockUserId,
      );

      expect(diagramRepo.create).toHaveBeenCalled();
      expect(diagramRepo.save).toHaveBeenCalled();
      expect(result.id).toBe(mockDiagramId);
      expect(result.nodes).toHaveLength(1);
    });

    it('debe lanzar ForbiddenException si el usuario es VIEWER al crear', async () => {
      projectRepo.findById!.mockResolvedValue(mockProject);
      memberRepo.findRole!.mockResolvedValue(ProjectRole.VIEWER);

      await expect(
        service.create(
          {
            projectId: mockProjectId,
            name: 'New Diagram',
          },
          'viewer-user-id',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('debe retornar el diagrama completo con su AST', async () => {
      diagramRepo.findById!.mockResolvedValue(mockDiagram);
      projectRepo.findById!.mockResolvedValue(mockProject);
      memberRepo.findRole!.mockResolvedValue(ProjectRole.VIEWER);

      const result = await service.findOne(mockDiagramId, mockUserId);

      expect(result.id).toBe(mockDiagramId);
      expect(result.name).toBe('Main Class Diagram');
      expect(result.nodes[0].name).toBe('Usuario');
    });

    it('debe lanzar NotFoundException si no existe el diagrama', async () => {
      diagramRepo.findById!.mockResolvedValue(null);

      await expect(service.findOne('invalid-id', mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('saveAst', () => {
    it('debe persistir el AST del diagrama en MongoDB y registrar evento de autoría cuando hay diff', async () => {
      diagramRepo.findById!.mockResolvedValue(mockDiagram);
      projectRepo.findById!.mockResolvedValue(mockProject);
      memberRepo.findRole!.mockResolvedValue(ProjectRole.EDITOR);

      const result = await service.saveAst(
        mockDiagramId,
        {
          defaultLineStyle: 'segment',
          nodes: [
            {
              id: 'node_1',
              name: 'Usuario',
              positionX: 100,
              positionY: 200,
              attributes: [{ name: 'id', type: 'UUID', isPrimaryKey: true }],
              methods: [],
            },
            {
              id: 'node_2',
              name: 'Factura',
              positionX: 400,
              positionY: 200,
              attributes: [{ name: 'id', type: 'UUID', isPrimaryKey: true }],
              methods: [],
            },
          ],
          connections: [],
        },
        mockUserId,
      );

      expect(diagramRepo.saveAstAtomic).toHaveBeenCalled();
      expect(authorEventRepo.createAndSave).toHaveBeenCalledWith(
        expect.objectContaining({
          diagramId: mockDiagramId,
          userId: mockUserId,
          userName: 'Cesar Quispe Delgado',
          affectedClasses: expect.arrayContaining(['Factura']),
        }),
      );
      expect(result.id).toBe(mockDiagramId);
      expect(result.nodes).toHaveLength(2);
    });

    it('debe persistir el AST que contiene nodos ancla con nombre vacío (isAnchor: true)', async () => {
      diagramRepo.findById!.mockResolvedValue(mockDiagram);
      projectRepo.findById!.mockResolvedValue(mockProject);
      memberRepo.findRole!.mockResolvedValue(ProjectRole.EDITOR);

      const result = await service.saveAst(
        mockDiagramId,
        {
          defaultLineStyle: 'straight',
          nodes: [
            {
              id: 'anchor_1',
              name: '',
              positionX: 250,
              positionY: 200,
              width: 0,
              height: 0,
              isAnchor: true,
              attributes: [],
              methods: [],
            },
            {
              id: 'node_assoc',
              name: 'Tabla_7_Tabla_8',
              positionX: 250,
              positionY: 350,
              width: 220,
              isAnchor: false,
              attributes: [{ name: 'id', type: 'UUID' }],
              methods: [],
            },
          ],
          connections: [],
        },
        mockUserId,
      );

      expect(diagramRepo.saveAstAtomic).toHaveBeenCalled();
      expect(result.id).toBe(mockDiagramId);
    });

    it('debe crear anotaciones IA y checkpoints snapshot correctamente', async () => {
      diagramRepo.findById!.mockResolvedValue(mockDiagram);
      projectRepo.findById!.mockResolvedValue(mockProject);
      memberRepo.findRole!.mockResolvedValue(ProjectRole.EDITOR);

      const annotated = await service.addAiAnnotation(mockDiagramId, {
        title: 'Índice sugerido',
        message: 'Agrega atributo email único a Usuario.',
        severity: 'idea',
        authorName: 'Copilot IA',
        targetNodeId: 'node_1',
        targetClassName: 'Usuario',
      });
      expect(annotated.aiAnnotations).toHaveLength(1);

      const snap = await service.createSnapshot(mockDiagramId, mockUserId, 'Cierre Día 1');
      expect(snapshotRepo.createAndSave).toHaveBeenCalledWith(
        expect.objectContaining({
          diagramId: mockDiagramId,
          label: 'Cierre Día 1',
          sessionNumber: 1,
        }),
      );
      expect(snap.id).toBe('snap-1');
    });

    it('debe validar exitosamente SaveDiagramAstDto cuando un nodo ancla tiene nombre vacío', async () => {
      const payload = {
        defaultLineStyle: 'segment',
        nodes: [
          {
            id: 'anchor_1789591684321',
            name: '',
            positionX: 300,
            positionY: 200,
            width: 0,
            height: 0,
            isAnchor: true,
            attributes: [],
            methods: [],
          },
          {
            id: 'node_normal',
            name: 'Tabla_7',
            positionX: 100,
            positionY: 100,
            width: 220,
            isAnchor: false,
            attributes: [],
            methods: [],
          },
        ],
        connections: [],
      };

      const dto = plainToInstance(SaveDiagramAstDto, payload);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('debe fallar la validación si un nodo normal (isAnchor: false) tiene nombre vacío', async () => {
      const payload = {
        defaultLineStyle: 'segment',
        nodes: [
          {
            id: 'node_invalid',
            name: '',
            positionX: 100,
            positionY: 100,
            width: 220,
            isAnchor: false,
            attributes: [],
            methods: [],
          },
        ],
        connections: [],
      };

      const dto = plainToInstance(SaveDiagramAstDto, payload);
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(JSON.stringify(errors)).toContain('name should not be empty');
    });

    it('debe validar y mapear elementType, visibility, isPrimaryKey e isNullable en atributos y métodos', async () => {
      const payload = {
        defaultLineStyle: 'segment',
        nodes: [
          {
            id: 'node_iface',
            name: 'Pagable',
            elementType: 'INTERFACE',
            stereotype: 'interface',
            positionX: 50,
            positionY: 50,
            attributes: [],
            methods: [
              { name: 'pagar', parameters: 'monto: BigDecimal', returnType: 'Boolean', visibility: '+', orderIndex: 0 },
            ],
          },
          {
            id: 'node_note',
            name: '',
            elementType: 'NOTE',
            noteContent: 'Regla fiscal vigente 2026',
            positionX: 300,
            positionY: 50,
            attributes: [],
            methods: [],
          },
          {
            id: 'node_cls',
            name: 'Factura',
            elementType: 'CLASS',
            positionX: 50,
            positionY: 250,
            attributes: [
              { name: 'codigo', type: 'String', visibility: '-', isPrimaryKey: true, isNullable: false, orderIndex: 0 },
            ],
            methods: [],
          },
        ],
        connections: [],
      };

      const dto = plainToInstance(SaveDiagramAstDto, payload);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
