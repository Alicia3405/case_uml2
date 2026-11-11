import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { CollaborationSession } from './entities/collaboration-session.entity';
import { SessionParticipant } from './entities/session-participant.entity';
import { ProjectRepository } from './repositories/project.repository';
import { ProjectMemberRepository } from './repositories/project-member.repository';
import { SessionRepository } from './repositories/session.repository';
import { SessionParticipantRepository } from './repositories/session-participant.repository';
import { ProjectService } from './services/project.service';
import { ProjectMemberService } from './services/project-member.service';
import { YjsSyncService } from './services/yjs-sync.service';
import { CollaborationGateway } from './gateways/collaboration.gateway';
import { ProjectController } from './controllers/project.controller';
import { ProjectMemberController } from './controllers/project-member.controller';
import { CollaborationController } from './controllers/collaboration.controller';
import { AuthModule } from '../auth/auth.module';
import { DiagramsModule } from '../diagrams/diagrams.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      ProjectMember,
      CollaborationSession,
      SessionParticipant,
    ]),
    forwardRef(() => DiagramsModule),
    AuthModule,
  ],
  controllers: [
    ProjectController,
    ProjectMemberController,
    CollaborationController,
  ],
  providers: [
    ProjectService,
    ProjectMemberService,
    ProjectRepository,
    ProjectMemberRepository,
    SessionRepository,
    SessionParticipantRepository,
    YjsSyncService,
    CollaborationGateway,
  ],
  exports: [
    ProjectService,
    ProjectMemberService,
    ProjectRepository,
    ProjectMemberRepository,
    SessionRepository,
    SessionParticipantRepository,
    YjsSyncService,
    CollaborationGateway,
  ],
})
export class ProjectsModule {}
