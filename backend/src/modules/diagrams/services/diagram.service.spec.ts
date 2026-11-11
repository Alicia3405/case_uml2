import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DiagramService } from './diagram.service';
import { DiagramRepository } from '../repositories/diagram.repository';
import { UmlNodeRepository } from '../repositories/uml-node.repository';
import { UmlAttributeRepository } from '../repositories/uml-attribute.repository';
import { UmlMethodRepository } from '../repositories/uml-method.repository';
import { UmlConnectionRepository } from '../repositories/uml-connection.repository';
import { ProjectRepository } from '../../projects/repositories/project.repository';
import { ProjectMemberRepository } from '../../projects/repositories/project-member.repository';
import { ProjectRole } from '../../projects/entities/project-role.enum';
import { Diagram } from '../entities/diagram.entity';
import { Project } from '../../projects/entities/project.entity';

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SaveDiagramAstDto } from '../dtos/save-diagram-ast.dto';

describe('DiagramService', () => {
  let service: DiagramService;
  let diagramRepo: jest.Mocked<Partial<DiagramRepository>>;
  let nodeRepo: jest.Mocked<Partial<UmlNodeRepository>>;
  let attributeRepo: jest.Mocked<Partial<UmlAttributeRepository>>;
  let methodRepo: jest.Mocked<Partial<UmlMethodRepository>>;
  let connectionRepo: jest.Mocked<Partial<UmlConnectionRepository>>;
  let projectRepo: jest.Mocked<Partial<ProjectRepository>>;
  let memberRepo: jest.Mocked<Partial<ProjectMemberRepository>>;
  let dataSource: any;

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
    createdAt: new Date(),
    updatedAt: new Date(),
    project: mockProject,
    nodes: [
      {
        id: 'node_1',
        diagramId: mockDiagramId,
        name: 'Usuario',
        positionX: 100,
        positionY: 200,
        width: 220,
        height: 150,
        isAnchor: false,
        assocMainConnId: null,
        diagram: {} as any,
        attributes: [
          {
            id: 'attr_1',
            nodeId: 'node_1',
            name: 'id',
            type: 'UUID',
            orderIndex: 0,
            node: {} as any,
          },
        ],
        methods: [
          {
            id: 'meth_1',
            nodeId: 'node_1',
            name: 'getId',
            parameters: '',
            returnType: 'UUID',
            orderIndex: 0,
            node: {} as any,
          },
        ],
        outgoingConnections: [],
        incomingConnections: [],
      },
    ],
    connections: [],
    collaborationSessions: [],
  };

  beforeEach(async () => {
    diagramRepo = {
      create: jest.fn().mockImplementation((data) => ({ ...data, id: mockDiagramId } as Diagram)),
      save: jest.fn().mockResolvedValue(mockDiagram),
      findAllByProjectId: jest.fn(),
      findById: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    nodeRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      findByDiagramId: jest.fn(),
      deleteByDiagramId: jest.fn(),
    };

    attributeRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findByNodeId: jest.fn(),
      deleteByNodeIds: jest.fn(),
    };

    methodRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findByNodeId: jest.fn(),
      deleteByNodeIds: jest.fn(),
    };

    connectionRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findByDiagramId: jest.fn(),
      deleteByDiagramId: jest.fn(),
    };

    projectRepo = {
      findById: jest.fn(),
    };

    memberRepo = {
      findRole: jest.fn(),
    };

    const mockQueryBuilder = {
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };

    const mockManager = {
      delete: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((entity, data) => data),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation((cb: any) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiagramService,
        { provide: DiagramRepository, useValue: diagramRepo },
        { provide: UmlNodeRepository, useValue: nodeRepo },
        { provide: UmlAttributeRepository, useValue: attributeRepo },
        { provide: UmlMethodRepository, useValue: methodRepo },
        { provide: UmlConnectionRepository, useValue: connectionRepo },
        { provide: ProjectRepository, useValue: projectRepo },
        { provide: ProjectMemberRepository, useValue: memberRepo },
        { provide: DataSource, useValue: dataSource },
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
    it('debe persistir el AST del diagrama con nodos y conexiones', async () => {
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
              attributes: [{ name: 'id', type: 'UUID' }],
              methods: [],
            },
          ],
          connections: [],
        },
        mockUserId,
      );

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result.id).toBe(mockDiagramId);
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

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result.id).toBe(mockDiagramId);
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
  });
});
