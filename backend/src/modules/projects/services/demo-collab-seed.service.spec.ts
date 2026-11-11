import { Test, TestingModule } from '@nestjs/testing';
import { DemoCollabSeedService, DEMO_COLLAB_PROJECTS } from './demo-collab-seed.service';
import { AuthSeedService, DEMO_SEED_USERS } from '../../auth/services/auth-seed.service';
import { User } from '../../auth/entities/user.entity';
import { ProjectRepository } from '../repositories/project.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { SessionRepository } from '../repositories/session.repository';
import { DiagramRepository } from '../../diagrams/repositories/diagram.repository';
import { DiagramService } from '../../diagrams/services/diagram.service';
import { ProjectRole } from '../entities/project-role.enum';

describe('DemoCollabSeedService', () => {
  let service: DemoCollabSeedService;
  let authSeedService: jest.Mocked<Partial<AuthSeedService>>;
  let projectRepository: jest.Mocked<Partial<ProjectRepository>>;
  let projectMemberRepository: jest.Mocked<Partial<ProjectMemberRepository>>;
  let diagramRepository: jest.Mocked<Partial<DiagramRepository>>;
  let diagramService: jest.Mocked<Partial<DiagramService>>;
  let sessionRepository: jest.Mocked<Partial<SessionRepository>>;

  const mockUsers: User[] = DEMO_SEED_USERS.map((spec, idx) => ({
    id: `00000000-0000-0000-0000-00000000000${idx + 1}`,
    fullName: spec.fullName,
    email: spec.email,
    passwordHash: 'hashed',
    isActive: true,
    createdAt: new Date(),
    projectsCreated: [],
    projectMemberships: [],
    diagramVersions: [],
    aiLogs: [],
    sessionParticipations: [],
  }));

  beforeEach(async () => {
    let projectSeq = 0;
    let diagramSeq = 0;

    authSeedService = {
      ensureDemoUsersSeeded: jest.fn().mockResolvedValue(mockUsers),
    };

    projectRepository = {
      findAllForUser: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation((proj) => {
        projectSeq++;
        return Promise.resolve({
          ...proj,
          id: `10000000-0000-0000-0000-00000000000${projectSeq}`,
        });
      }),
    };

    projectMemberRepository = {
      findByProjectIdAndUserId: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation((member) => Promise.resolve(member)),
    };

    diagramRepository = {
      findAllByProjectId: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation((diagram) => {
        diagramSeq++;
        return Promise.resolve({
          ...diagram,
          id: `20000000-0000-0000-0000-00000000000${diagramSeq}`,
        });
      }),
    };

    diagramService = {
      saveAst: jest.fn().mockResolvedValue({} as any),
    };

    sessionRepository = {
      findActiveByDiagramId: jest.fn().mockResolvedValue(null),
      findByRoomCode: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation((sess) => Promise.resolve(sess)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemoCollabSeedService,
        { provide: AuthSeedService, useValue: authSeedService },
        { provide: ProjectRepository, useValue: projectRepository },
        { provide: ProjectMemberRepository, useValue: projectMemberRepository },
        { provide: DiagramRepository, useValue: diagramRepository },
        { provide: DiagramService, useValue: diagramService },
        { provide: SessionRepository, useValue: sessionRepository },
      ],
    }).compile();

    service = module.get<DemoCollabSeedService>(DemoCollabSeedService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('debe crear los 2 proyectos colaborativos con los 4 usuarios, AST inicial y salas WebSocket', async () => {
    await service.seedIfNeeded();

    expect(authSeedService.ensureDemoUsersSeeded).toHaveBeenCalledTimes(1);
    expect(projectRepository.save).toHaveBeenCalledTimes(DEMO_COLLAB_PROJECTS.length);

    // 4 miembros por cada uno de los 2 proyectos = 8 asignaciones
    expect(projectMemberRepository.save).toHaveBeenCalledTimes(8);

    // Verificar roles diferenciados en Ecommerce: Luis como EDITOR sin ZIP, Sofía como VIEWER
    const savedMembers = (projectMemberRepository.save as jest.Mock).mock.calls.map((c) => c[0]);
    const luisUser = mockUsers.find((u) => u.email === 'luis@uagrm.edu.bo')!;
    const sofiaUser = mockUsers.find((u) => u.email === 'sofia@uagrm.edu.bo')!;

    expect(
      savedMembers.some(
        (m) =>
          m.userId === luisUser.id &&
          m.role === ProjectRole.EDITOR &&
          m.canDownloadCode === false,
      ),
    ).toBe(true);
    expect(
      savedMembers.some(
        (m) =>
          m.userId === sofiaUser.id &&
          m.role === ProjectRole.VIEWER &&
          m.canDownloadCode === false,
      ),
    ).toBe(true);

    expect(diagramService.saveAst).toHaveBeenCalledTimes(2);
    expect(sessionRepository.save).toHaveBeenCalledTimes(2);
    const savedRooms = (sessionRepository.save as jest.Mock).mock.calls.map((c) => c[0].roomCode);
    expect(savedRooms).toEqual(['ECOM-2026', 'CLIN-2026']);
  });

  it('debe ser idempotente y no duplicar ni sobrescribir proyectos, diagramas ni sesiones existentes', async () => {
    const cesar = mockUsers.find((u) => u.email === 'cesar@uagrm.edu.bo')!;
    const ana = mockUsers.find((u) => u.email === 'ana@uagrm.edu.bo')!;

    projectRepository.findAllForUser = jest.fn().mockImplementation(async (uid) => {
      if (uid === cesar.id) {
        return [{ id: 'proj-ecom', name: 'Ecommerce Colaborativo Demo', createdBy: cesar.id }] as any;
      }
      if (uid === ana.id) {
        return [{ id: 'proj-clin', name: 'Sistema Clinica Universitaria', createdBy: ana.id }] as any;
      }
      return [];
    });

    projectMemberRepository.findByProjectIdAndUserId = jest.fn().mockResolvedValue({ id: 'mem' } as any);
    diagramRepository.findAllByProjectId = jest.fn().mockResolvedValue([{ id: 'diag-existing' } as any]);
    sessionRepository.findActiveByDiagramId = jest.fn().mockResolvedValue({ id: 'sess-existing' } as any);

    await service.seedIfNeeded();

    expect(projectRepository.save).not.toHaveBeenCalled();
    expect(projectMemberRepository.save).not.toHaveBeenCalled();
    expect(diagramService.saveAst).not.toHaveBeenCalled();
    expect(sessionRepository.save).not.toHaveBeenCalled();
  });
});

