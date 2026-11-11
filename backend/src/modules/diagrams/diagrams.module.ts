import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Diagram, DiagramSchema } from './entities/diagram.entity';
import { DiagramSnapshot, DiagramSnapshotSchema } from './entities/diagram-snapshot.entity';
import { DiagramRepository } from './repositories/diagram.repository';
import { DiagramSnapshotRepository } from './repositories/diagram-snapshot.repository';
import { DiagramService } from './services/diagram.service';
import { DiagramController } from './controllers/diagram.controller';
import { ProjectsModule } from '../projects/projects.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Diagram.name, schema: DiagramSchema },
      { name: DiagramSnapshot.name, schema: DiagramSnapshotSchema },
    ]),
    forwardRef(() => ProjectsModule),
    AuthModule,
  ],
  controllers: [DiagramController],
  providers: [
    DiagramService,
    DiagramRepository,
    DiagramSnapshotRepository,
  ],
  exports: [
    DiagramService,
    DiagramRepository,
    DiagramSnapshotRepository,
  ],
})
export class DiagramsModule {}
