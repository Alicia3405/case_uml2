import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRepository } from '../repositories/user.repository';

@Injectable()
export class AuthSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthSeedService.name);

  constructor(private readonly userRepository: UserRepository) {}

  async onApplicationBootstrap() {
    await this.seedDefaultUser();
  }

  private async seedDefaultUser() {
    try {
      const testEmail = 'cesar@uagrm.edu.bo';
      const existing = await this.userRepository.findByEmail(testEmail);

      if (!existing) {
        const passwordHash = await bcrypt.hash('Pass1234!', 10);
        await this.userRepository.createAndSave({
          fullName: 'Cesar Quispe Delgado',
          email: testEmail,
          passwordHash,
          isActive: true,
        });

        this.logger.log('───────────────────────────────────────────────────');
        this.logger.log('👤 Usuario de prueba inicializado exitosamente:');
        this.logger.log(`📧 Email:    ${testEmail}`);
        this.logger.log('🔑 Password: Pass1234!');
        this.logger.log('───────────────────────────────────────────────────');
      }
    } catch (error: any) {
      this.logger.warn(`No se pudo inicializar usuario de prueba automático: ${error?.message || error}`);
    }
  }
}
