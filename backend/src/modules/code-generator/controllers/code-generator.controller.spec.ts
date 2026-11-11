import { Test, TestingModule } from '@nestjs/testing';
import { CodeGeneratorController } from './code-generator.controller';
import { CodeGeneratorService } from '../services/code-generator.service';
import { S3StorageService } from '../services/s3-storage.service';
import { User } from '../../auth/entities/user.entity';

describe('CodeGeneratorController', () => {
  let controller: CodeGeneratorController;
  let service: jest.Mocked<Partial<CodeGeneratorService>>;
  let s3Service: jest.Mocked<Partial<S3StorageService>>;

  const mockUser: User = {
    id: 'user-111',
    fullName: 'Cesar Quispe Delgado',
    email: 'cesar@casestudio.edu.bo',
    passwordHash: 'hash',
    isActive: true,
    createdAt: new Date(),
    projectsCreated: [],
    projectMemberships: [],
    diagramVersions: [],
    aiLogs: [],
    sessionParticipations: [],
  };

  beforeEach(async () => {
    service = {
      previewFromDiagramId: jest.fn().mockResolvedValue({
        projectName: 'Tienda Online',
        totalFiles: 15,
        files: [],
      }),
      downloadZipFromDiagramId: jest.fn().mockResolvedValue({
        filename: 'tienda-online.zip',
        buffer: Buffer.from('mock-zip-content'),
      }),
    };

    s3Service = {
      uploadArtifact: jest.fn().mockResolvedValue({ key: 'artifacts/123.zip', url: 'https://s3.example.com/123.zip' }),
      generatePresignedDownloadUrl: jest.fn().mockResolvedValue('https://s3.example.com/123.zip?presigned=true'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CodeGeneratorController],
      providers: [
        { provide: CodeGeneratorService, useValue: service },
        { provide: S3StorageService, useValue: s3Service },
      ],
    }).compile();

    controller = module.get<CodeGeneratorController>(CodeGeneratorController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe generar la vista previa de archivos a partir del ID del diagrama', async () => {
    const res = await controller.previewFromDiagramId('diagram-123', {}, mockUser);
    expect(service.previewFromDiagramId).toHaveBeenCalledWith('diagram-123', {}, 'user-111');
    expect(res.projectName).toBe('Tienda Online');
  });

  it('debe compilar y descargar el proyecto ZIP a partir del ID del diagrama', async () => {
    const mockRes = {
      set: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.downloadZipFromDiagramId('diagram-123', {}, mockUser, mockRes);
    expect(service.downloadZipFromDiagramId).toHaveBeenCalledWith('diagram-123', {}, 'user-111');
    expect(mockRes.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="tienda-online.zip"',
      }),
    );
    expect(mockRes.send).toHaveBeenCalledWith(Buffer.from('mock-zip-content'));
  });
});
