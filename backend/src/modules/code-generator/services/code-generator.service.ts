import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DiagramRepository } from '../../diagrams/repositories/diagram.repository';
import { ProjectRepository } from '../../projects/repositories/project.repository';
import { ProjectMemberRepository } from '../../projects/repositories/project-member.repository';
import { ProjectRole } from '../../projects/entities/project-role.enum';
import { SpringTemplateEngineService } from './spring-template-engine.service';
import { FlutterTemplateEngineService } from './flutter-template-engine.service';
import { ZipArchiverService } from './zip-archiver.service';
import { GenerateCodeRequestDto } from '../dtos/generate-code-request.dto';
import {
  CodeGenerationPreviewResponseDto,
  GeneratedFileDto,
} from '../dtos/code-generation-preview-response.dto';
import { renderPostmanCollection } from '../templates/postman-collection.template';

@Injectable()
export class CodeGeneratorService {
  constructor(
    private readonly diagramRepository: DiagramRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly projectMemberRepository: ProjectMemberRepository,
    private readonly springTemplateEngine: SpringTemplateEngineService,
    private readonly flutterTemplateEngine: FlutterTemplateEngineService,
    private readonly zipArchiver: ZipArchiverService,
  ) {}

  private async checkProjectAccess(
    projectId: string,
    userId: string,
  ): Promise<void> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundException('El proyecto asociado no existe');
    }

    const role = await this.projectMemberRepository.findRole(projectId, userId);
    const isOwnerOrCreator =
      role === ProjectRole.OWNER || project.createdBy === userId;

    if (!role && !isOwnerOrCreator) {
      throw new ForbiddenException(
        'No tienes permisos para generar código en este proyecto',
      );
    }
  }

  /**
   * Genera los archivos del proyecto según la plataforma seleccionada (Spring Boot, Flutter, o All).
   */
  private generateFiles(
    dto: GenerateCodeRequestDto,
    nodes: any[],
    connections: any[],
  ): { projectName: string; files: GeneratedFileDto[] } {
    const platform = dto.platform || 'all';

    // 1. Generar contexto y archivos base de Spring Boot
    const { context, files: springFiles } =
      this.springTemplateEngine.generateProjectFiles(dto, nodes, connections);

    if (platform === 'spring-boot') {
      return {
        projectName: context.projectName,
        files: springFiles,
      };
    }

    // 2. Generar archivos de Flutter Clean Architecture
    if (platform === 'flutter') {
      const flutterFiles =
        this.flutterTemplateEngine.generateFlutterProjectFiles(context, '');
      return {
        projectName: `${context.projectName} (Flutter App)`,
        files: flutterFiles,
      };
    }

    // 3. Platform === 'all' (Solución Fullstack Completa)
    // Spring Boot en 'backend/' y Flutter en 'mobile_flutter/'
    const combinedFiles: GeneratedFileDto[] = [];

    for (const f of springFiles) {
      combinedFiles.push({
        ...f,
        path: `backend/${f.path}`,
      });
    }

    const flutterFiles = this.flutterTemplateEngine.generateFlutterProjectFiles(
      context,
      'mobile_flutter',
    );
    combinedFiles.push(...flutterFiles);

    // Colección Postman v2.1 con CRUD completo (Create, Read, Update, Delete)
    combinedFiles.push({
      path: 'postman_collection.json',
      filename: 'postman_collection.json',
      language: 'json',
      layer: 'docs',
      content: renderPostmanCollection(context),
    });

    // README Maestro del Proyecto Fullstack
    const masterReadme = `# 🌟 ${context.projectName} (Fullstack Solution)

Solución de software completa autogenerada a partir de modelo de clases UML:
1. **Backend REST:** Spring Boot 3.4.0 / 3.3.6 + Java 21 + PostgreSQL 16 + Flyway Migrations + Swagger UI (\`backend/\`)
2. **Frontend Móvil:** Flutter con Clean Architecture + BLoC + Dio + GetIt (\`mobile_flutter/\`)

---

## 🚀 1. Iniciar Backend con Docker Compose

\`\`\`bash
cd backend
docker compose up --build
\`\`\`
* **Swagger UI interactivo:** [http://localhost:${context.serverPort || 8080}/swagger-ui.html](http://localhost:${context.serverPort || 8080}/swagger-ui.html)
* **API REST Base:** \`http://localhost:${context.serverPort || 8080}/api/v1\`

---

## 📱 2. Ejecutar la Aplicación Móvil en Flutter

Conecta tu teléfono Android por cable USB y ejecuta:

\`\`\`bash
# 1. Redireccionar puerto USB
adb reverse tcp:${context.serverPort || 8080} tcp:${context.serverPort || 8080}

# 2. Iniciar Flutter App
cd mobile_flutter
flutter pub get
flutter run
\`\`\`
`;

    combinedFiles.push({
      path: 'README.md',
      filename: 'README.md',
      language: 'markdown',
      layer: 'docs',
      content: masterReadme,
    });

    combinedFiles.push(...flutterFiles);

    // Colección Postman v2.1 con CRUD completo (Create, Read, Update, Delete)
    combinedFiles.push({
      path: 'postman_collection.json',
      filename: 'postman_collection.json',
      language: 'json',
      layer: 'docs',
      content: renderPostmanCollection(context),
    });

    // Script individual de inicio de Backend
    combinedFiles.push({
      path: 'backend/iniciar_backend.bat',
      filename: 'iniciar_backend.bat',
      language: 'bat',
      layer: 'config',
      content: `@echo off
title Backend Spring Boot - CASE Studio AI
echo =========================================================================
echo   INICIANDO BACKEND SPRING BOOT + POSTGRESQL (1 CLIC) - CASE STUDIO AI
echo =========================================================================
echo.
echo [1/2] Levantando contenedor Docker con PostgreSQL y Spring Boot...
docker compose up -d
echo Esperando 5 segundos a que los servicios esten listos...
timeout /t 5 /nobreak > nul
echo.
echo [2/2] Abriendo Swagger UI en el navegador...
start http://localhost:${context.serverPort || 8080}/swagger-ui.html
echo.
echo Backend activo en: http://localhost:${context.serverPort || 8080}
echo Documentacion interactiva disponible en Swagger UI.
pause
`,
    });

    // Script individual de inicio de Flutter
    combinedFiles.push({
      path: 'mobile_flutter/iniciar_movil.bat',
      filename: 'iniciar_movil.bat',
      language: 'bat',
      layer: 'config',
      content: `@echo off
title Frontend Movil Flutter - CASE Studio AI
echo =========================================================================
echo   INICIANDO APLICACION FLUTTER (1 CLIC) - CASE STUDIO AI
echo =========================================================================
echo.
echo [1/2] Verificando paquetes y dependencias de Flutter...
call flutter pub get
echo.
echo [2/2] Lanzando aplicacion en navegador Web (Chrome)...
call flutter run -d chrome
pause
`,
    });

    // Script Maestro de Lanzamiento Autonomo de 1 Clic (DEFENSA RAPIDA)
    const masterStartBat = `@echo off
title CASE Studio AI - Solucion Fullstack
echo =========================================================================
echo   CASE STUDIO AI - LANZADOR FULLSTACK AUTONOMO DE 1 CLIC (DEFENSA RAPIDA)
echo =========================================================================
echo.
echo [1/3] Verificando e iniciando Backend Spring Boot y Base de Datos...
docker info >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Docker Desktop detectado activo. Levantando contenedores...
    cd backend
    start "Backend Docker" cmd /c "docker compose up -d && exit"
    cd ..
) else (
    echo [!] Docker Desktop no detectado en ejecucion.
    echo Iniciando Backend Spring Boot localmente con Java y Gradle Wrapper...
    cd backend
    start "Backend Spring Boot" cmd /k "gradlew.bat bootRun"
    cd ..
)

echo.
echo Esperando a que el backend Spring Boot este listo en el puerto ${context.serverPort || 8080}...
:wait_backend
timeout /t 3 /nobreak > nul
powershell -Command "(Test-NetConnection -ComputerName localhost -Port ${context.serverPort || 8080}).TcpTestSucceeded" 2>nul | findstr /i "True" >nul 2>&1
if %errorlevel% neq 0 (
    echo Aguardando inicio del servicio en puerto ${context.serverPort || 8080}...
    goto wait_backend
)
echo [OK] Backend Spring Boot activo y respondiendo exitosamente.
echo.
echo [2/3] Abriendo Documentacion Interactiva Swagger UI...
start http://localhost:${context.serverPort || 8080}/swagger-ui.html
echo.
echo [3/3] Iniciando Aplicacion Movil Flutter en Navegador Chrome...
cd mobile_flutter
call flutter pub get
call flutter run -d chrome
echo.
echo Demostracion completada con exito.
pause
`;

    combinedFiles.push({
      path: 'INICIAR_TODO.bat',
      filename: 'INICIAR_TODO.bat',
      language: 'bat',
      layer: 'config',
      content: masterStartBat,
    });

    return {
      projectName: context.projectName,
      files: combinedFiles,
    };
  }

  /**
   * Genera la vista previa de archivos a partir de un diagrama persistido.
   */
  async previewFromDiagramId(
    diagramId: string,
    dto: GenerateCodeRequestDto,
    userId: string,
  ): Promise<CodeGenerationPreviewResponseDto> {
    const diagram = await this.diagramRepository.findById(diagramId);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    if (diagram.projectId) {
      await this.checkProjectAccess(diagram.projectId, userId);
    }

    const nodes =
      dto.nodes && dto.nodes.length > 0 ? dto.nodes : diagram.nodes || [];
    const connections =
      dto.connections && dto.connections.length > 0
        ? dto.connections
        : diagram.connections || [];

    const effectiveDto: GenerateCodeRequestDto = {
      ...dto,
      projectName: dto.projectName || diagram.name,
      artifactId:
        dto.artifactId ||
        diagram.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    };

    const { projectName, files } = this.generateFiles(
      effectiveDto,
      nodes,
      connections,
    );

    return {
      projectName,
      totalFiles: files.length,
      files,
    };
  }

  /**
   * Genera y empaqueta en un archivo ZIP descargable el proyecto completo a partir del ID del diagrama.
   */
  async downloadZipFromDiagramId(
    diagramId: string,
    dto: GenerateCodeRequestDto,
    userId: string,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const preview = await this.previewFromDiagramId(diagramId, dto, userId);
    const rootDirName = dto.artifactId || 'fullstack-uml-project';
    const zipBuffer = await this.zipArchiver.createZipBuffer(
      preview.files,
      rootDirName,
    );

    return {
      filename: `${rootDirName}.zip`,
      buffer: zipBuffer,
    };
  }
}
