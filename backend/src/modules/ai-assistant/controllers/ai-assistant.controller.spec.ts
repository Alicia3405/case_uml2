import { Test, TestingModule } from '@nestjs/testing';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from '../services/ai-assistant.service';

describe('AiAssistantController', () => {
  let controller: AiAssistantController;
  let service: jest.Mocked<AiAssistantService>;

  beforeEach(async () => {
    const mockService = {
      processTextPrompt: jest.fn(),
      processVisionDiagram: jest.fn(),
      getAvailableModels: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiAssistantController],
      providers: [{ provide: AiAssistantService, useValue: mockService }],
    }).compile();

    controller = module.get<AiAssistantController>(AiAssistantController);
    service = module.get(AiAssistantService);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('GET /models debe delegar a getAvailableModels', async () => {
    const mockModelsResponse = {
      defaultModel: 'qwen2.5:3b',
      defaultProvider: 'ollama' as const,
      isOllamaAvailable: true,
      models: [
        {
          id: 'qwen2.5:3b',
          name: 'Qwen 2.5 (3B)',
          provider: 'ollama' as const,
          isLocal: true,
        },
      ],
    };

    service.getAvailableModels.mockResolvedValue(mockModelsResponse);

    const result = await controller.getModels();
    expect(result).toEqual(mockModelsResponse);
    expect(service.getAvailableModels).toHaveBeenCalled();
  });

  it('POST /prompt debe delegar a processTextPrompt', async () => {
    const dto = {
      prompt: 'Crea tabla Pago',
      diagramId: 'd-1',
    };
    const mockResponse = {
      success: true,
      action: 'diagram_mutated',
      message: 'Tabla Pago creada',
      nodes: [],
      connections: [],
      changesSummary: 'Pago creado',
    };

    service.processTextPrompt.mockResolvedValue(mockResponse);

    const result = await controller.processPrompt(dto);
    expect(result).toEqual(mockResponse);
    expect(service.processTextPrompt).toHaveBeenCalledWith(dto);
  });

  it('POST /vision-diagram debe delegar a processVisionDiagram', async () => {
    const dto = {
      imageBase64: 'base64str',
      mimeType: 'image/png',
      diagramId: 'd-1',
    };
    const mockResponse = {
      success: true,
      action: 'vision_extract',
      message: 'Digitalización completada',
      nodes: [],
      connections: [],
      changesSummary: 'Clases extraídas',
    };

    service.processVisionDiagram.mockResolvedValue(mockResponse);

    const result = await controller.processVisionDiagram(dto);
    expect(result).toEqual(mockResponse);
    expect(service.processVisionDiagram).toHaveBeenCalledWith(dto);
  });
});
