import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { MongoMemoryServer } from 'mongodb-memory-server';

jest.setTimeout(60000);

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let mongod: MongoMemoryServer;
  const previousUri = process.env.MONGODB_URI;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 30000 },
    });
    process.env.MONGODB_URI = mongod.getUri();
    process.env.MONGODB_DB_NAME = 'case_studio_ai_app_e2e';

    const { AppModule } = await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    if (previousUri !== undefined) {
      process.env.MONGODB_URI = previousUri;
    } else {
      delete process.env.MONGODB_URI;
    }
  });
});
