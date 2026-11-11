import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProjectsModule } from '../projects/projects.module';
import { DiagramsModule } from '../diagrams/diagrams.module';
import { VertexAiService } from './services/vertex-ai.service';
import { OllamaAiService } from './services/ollama-ai.service';
import { AiAssistantService } from './services/ai-assistant.service';
import { AiAssistantController } from './controllers/ai-assistant.controller';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => ProjectsModule),
    forwardRef(() => DiagramsModule),
  ],
  controllers: [AiAssistantController],
  providers: [
    VertexAiService,
    OllamaAiService,
    AiAssistantService,
    {
      provide: 'AI_ASSISTANT_SERVICE',
      useExisting: AiAssistantService,
    },
  ],
  exports: [
    AiAssistantService,
    'AI_ASSISTANT_SERVICE',
    VertexAiService,
    OllamaAiService,
  ],
})
export class AiAssistantModule {}
