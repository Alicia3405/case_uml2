import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { UserRepository } from '../repositories/user.repository';

export interface DemoUserSeedSpec {
  fullName: string;
  email: string;
  password: string;
  roleSummary: string;
}

export const DEMO_SEED_PASSWORD = 'Pass1234!';

export const DEMO_SEED_USERS: DemoUserSeedSpec[] = [
  {
    fullName: 'Cesar Quispe Delgado',
    email: 'cesar@uagrm.edu.bo',
    password: DEMO_SEED_PASSWORD,
    roleSummary: 'OWNER (E-Commerce) / EDITOR+ZIP (Clínica)',
  },
  {
    fullName: 'Ana Gómez Rojas',
    email: 'ana@uagrm.edu.bo',
    password: DEMO_SEED_PASSWORD,
    roleSummary: 'EDITOR+ZIP (E-Commerce) / OWNER (Clínica)',
  },
  {
    fullName: 'Luis Mendoza Torres',
    email: 'luis@uagrm.edu.bo',
    password: DEMO_SEED_PASSWORD,
    roleSummary: 'EDITOR sin ZIP (E-Commerce) / EDITOR+ZIP (Clínica)',
  },
  {
    fullName: 'Sofía Vargas Paredes',
    email: 'sofia@uagrm.edu.bo',
    password: DEMO_SEED_PASSWORD,
    roleSummary: 'VIEWER solo lectura (ambos proyectos)',
  },
];

@Injectable()
export class AuthSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthSeedService.name);
  private seedInFlight: Promise<User[]> | null = null;

  constructor(private readonly userRepository: UserRepository) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureDemoUsersSeeded();
  }

  /**
   * Inicializa de forma idempotente los 4 usuarios de prueba colaborativos
   * y comparte la promesa en curso para evitar condiciones de carrera al arrancar.
   */
  async ensureDemoUsersSeeded(): Promise<User[]> {
    if (this.seedInFlight) {
      return this.seedInFlight;
    }

    this.seedInFlight = this.seedDemoUsersInternal().finally(() => {
      this.seedInFlight = null;
    });

    return this.seedInFlight;
  }

  private async seedDemoUsersInternal(): Promise<User[]> {
    const users: User[] = [];
    let createdCount = 0;

    try {
      for (const spec of DEMO_SEED_USERS) {
        const existing = await this.userRepository.findByEmail(spec.email);
        if (existing) {
          users.push(existing);
          continue;
        }

        const passwordHash = await bcrypt.hash(spec.password, 10);
        const created = await this.userRepository.createAndSave({
          fullName: spec.fullName,
          email: spec.email,
          passwordHash,
          isActive: true,
        });
        users.push(created);
        createdCount++;
      }

      if (createdCount > 0) {
        this.logger.log('─────────────────────────────────────────────────────────────');
        this.logger.log(`👥 ${createdCount} usuario(s) demo colaborativos inicializados (Pass: ${DEMO_SEED_PASSWORD}):`);
        for (const spec of DEMO_SEED_USERS) {
          this.logger.log(`   • ${spec.email.padEnd(20)} | ${spec.fullName.padEnd(22)} | ${spec.roleSummary}`);
        }
        this.logger.log('─────────────────────────────────────────────────────────────');
      }
    } catch (error: any) {
      this.logger.warn(`No se pudo inicializar usuarios de prueba automáticos: ${error?.message || error}`);
    }

    return users;
  }
}
