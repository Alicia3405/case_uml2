import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || 'default_jwt_secret_key_change_me_in_production',
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
}));
