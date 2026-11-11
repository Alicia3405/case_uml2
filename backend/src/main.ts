import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { getAllowedCorsOrigins } from './config/cors.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Aumentar límite de payload para soportar imágenes en Base64 de alta resolución
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Prefijo global para la API
  app.setGlobalPrefix('api');

  // Habilitar CORS para el frontend (Angular en local y producción)
  const allowedOrigins = getAllowedCorsOrigins();
  logger.log(`🌐 Orígenes CORS habilitados: ${allowedOrigins.join(', ')}`);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Pipes de validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Filtros e interceptores globales
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Guard global JWT (con soporte para decorador @Public())
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector));

  // Configuración de Swagger / OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('UML/ER Collaborative Studio API')
    .setDescription(
      'API Backend para modelado visual de diagramas UML 2.5, interoperabilidad XMI y generación de código Spring Boot',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('auth', 'Autenticación JWT y gestión de usuarios')
    .addTag('projects', 'Gestión de proyectos y miembros del equipo')
    .addTag('diagrams', 'Gestión del modelo AST de clases UML y conexiones')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Servidor ejecutándose en: http://localhost:${port}/api`);
  logger.log(`📚 Documentación Swagger disponible en: http://localhost:${port}/api/docs`);
}
bootstrap();
