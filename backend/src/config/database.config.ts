import * as os from 'os';
import { registerAs } from '@nestjs/config';
import { MongooseModuleFactoryOptions } from '@nestjs/mongoose';

export default registerAs(
  'database',
  (): MongooseModuleFactoryOptions => {
    const uri =
      process.env.MONGODB_URI ||
      process.env.MONGO_URI ||
      'mongodb://127.0.0.1:27017/case_studio_ai';

    const dbName = process.env.MONGODB_DB_NAME || 'case_studio_ai';

    return {
      uri,
      dbName,
      serverSelectionTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT_MS || '10000', 10),
      socketTimeoutMS: 45000,
      maxPoolSize: 20,
      autoIndex: process.env.NODE_ENV !== 'production' || process.env.MONGODB_AUTO_INDEX === 'true',
      // En Jest VM sin --experimental-vm-modules, mongodb@7 falla al hacer `await import('os')` para clientMetadata.
      ...(process.env.JEST_WORKER_ID
        ? {
            runtimeAdapters: {
              os: {
                platform: () => os.platform(),
                arch: () => os.arch(),
                release: () => os.release(),
                type: () => os.type(),
              } as any,
            },
          }
        : {}),
    };
  },
);
