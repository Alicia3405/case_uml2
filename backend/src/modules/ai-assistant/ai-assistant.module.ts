import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProjectsModule } from '../projects/projects.module';
import { VertexAiService } from './services/vertex-ai.service';
import { OllamaAiService } from './services/ollama-ai.service';
import { AiAssistantService } from './services/ai-assistant.service';
import { AiAssistantController } from './controllers/ai-assistant.controller';

@Module({
  imports: [
    ConfigModule,
    ProjectsModule,
  ],
  controllers: [AiAssistantController],
  providers: [
    VertexAiService,
    OllamaAiService,
    AiAssistantService,
  ],
  exports: [
    AiAssistantService,
    VertexAiService,
    OllamaAiService,
  ],
})
export class AiAssistantModule {}
