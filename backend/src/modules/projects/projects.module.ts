import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Project, ProjectSchema } from './entities/project.entity';
import { ProjectMember, ProjectMemberSchema } from './entities/project-member.entity';
import {
  CollaborationSession,
  CollaborationSessionSchema,
} from './entities/collaboration-session.entity';
import {
  SessionParticipant,
  SessionParticipantSchema,
} from './entities/session-participant.entity';
import { RoomMessage, RoomMessageSchema } from './entities/room-message.entity';
import { AuthorEvent, AuthorEventSchema } from './entities/author-event.entity';
import {
  NotificationRecord,
  NotificationRecordSchema,
} from './entities/notification-record.entity';
import { ProjectRepository } from './repositories/project.repository';
import { ProjectMemberRepository } from './repositories/project-member.repository';
import { SessionRepository } from './repositories/session.repository';
import { SessionParticipantRepository } from './repositories/session-participant.repository';
import { RoomMessageRepository } from './repositories/room-message.repository';
import { AuthorEventRepository } from './repositories/author-event.repository';
import { NotificationRecordRepository } from './repositories/notification-record.repository';
import { ProjectService } from './services/project.service';
import { ProjectMemberService } from './services/project-member.service';
import { YjsSyncService } from './services/yjs-sync.service';
import { DemoCollabSeedService } from './services/demo-collab-seed.service';
import { CollaborationGateway } from './gateways/collaboration.gateway';
import { ProjectController } from './controllers/project.controller';
import { ProjectMemberController } from './controllers/project-member.controller';
import { CollaborationController } from './controllers/collaboration.controller';
import { CollaborationHistoryController } from './controllers/collaboration-history.controller';
import { AuthModule } from '../auth/auth.module';
import { DiagramsModule } from '../diagrams/diagrams.module';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: ProjectMember.name, schema: ProjectMemberSchema },
      { name: CollaborationSession.name, schema: CollaborationSessionSchema },
      { name: SessionParticipant.name, schema: SessionParticipantSchema },
      { name: RoomMessage.name, schema: RoomMessageSchema },
      { name: AuthorEvent.name, schema: AuthorEventSchema },
      { name: NotificationRecord.name, schema: NotificationRecordSchema },
    ]),
    forwardRef(() => DiagramsModule),
    forwardRef(() => AiAssistantModule),
    AuthModule,
  ],
  controllers: [
    ProjectController,
    ProjectMemberController,
    CollaborationController,
    CollaborationHistoryController,
  ],
  providers: [
    ProjectService,
    ProjectMemberService,
    ProjectRepository,
    ProjectMemberRepository,
    SessionRepository,
    SessionParticipantRepository,
    RoomMessageRepository,
    AuthorEventRepository,
    NotificationRecordRepository,
    YjsSyncService,
    DemoCollabSeedService,
    CollaborationGateway,
  ],
  exports: [
    ProjectService,
    ProjectMemberService,
    ProjectRepository,
    ProjectMemberRepository,
    SessionRepository,
    SessionParticipantRepository,
    RoomMessageRepository,
    AuthorEventRepository,
    NotificationRecordRepository,
    YjsSyncService,
    DemoCollabSeedService,
    CollaborationGateway,
  ],
})
export class ProjectsModule {}
