import { Component, signal, computed, ViewChild, ElementRef, AfterViewChecked, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { UserGuideService } from '../../services/user-guide.service';
import { TranslationService, TranslatePipe } from '../../i18n';
import {
  heroAcademicCap,
  heroBookOpen,
  heroChatBubbleLeftRight,
  heroCommandLine,
  heroDevicePhoneMobile,
  heroLightBulb,
  heroQuestionMarkCircle,
  heroServerStack,
  heroSparkles,
  heroXMark,
  heroChevronDown,
  heroChevronUp,
  heroChevronLeft,
  heroChevronRight,
  heroArrowsPointingOut,
  heroArrowsPointingIn,
  heroArrowPath,
  heroClipboardDocument,
  heroClipboardDocumentCheck,
  heroPlay,
  heroArrowRight,
  heroArrowLeft,
  heroCheck,
  heroPaperAirplane,
} from '@ng-icons/heroicons/outline';

export interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: Date;
  codeSnippet?: string;
  codeLanguage?: string;
  quickActions?: { label: string; query: string }[];
}

export interface TourStep {
  title: string;
  badge: string;
  description: string;
  details: string[];
  code?: string;
  tips: string;
}

@Component({
  selector: 'app-user-guide-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIconComponent, TranslatePipe],
  templateUrl: './user-guide-chatbot.component.html',
  styleUrl: './user-guide-chatbot.component.css',
  providers: [
    provideIcons({
      heroAcademicCap,
      heroBookOpen,
      heroChatBubbleLeftRight,
      heroCommandLine,
      heroDevicePhoneMobile,
      heroLightBulb,
      heroQuestionMarkCircle,
      heroServerStack,
      heroSparkles,
      heroXMark,
      heroChevronDown,
      heroChevronUp,
      heroChevronLeft,
      heroChevronRight,
      heroArrowsPointingOut,
      heroArrowsPointingIn,
      heroArrowPath,
      heroClipboardDocument,
      heroClipboardDocumentCheck,
      heroPlay,
      heroArrowRight,
      heroArrowLeft,
      heroCheck,
      heroPaperAirplane,
    }),
  ],
})
export class UserGuideChatbotComponent implements AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('pillsContainer') private pillsContainer!: ElementRef;

  guideService = inject(UserGuideService);
  translationService = inject(TranslationService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly initialTimestamp = new Date();

  scrollPills(offset: number): void {
    if (this.pillsContainer) {
      this.pillsContainer.nativeElement.scrollBy({
        left: offset,
        behavior: 'smooth',
      });
    }
  }

  onPillsWheel(event: WheelEvent): void {
    if (this.pillsContainer && event.deltaY !== 0) {
      event.preventDefault();
      this.pillsContainer.nativeElement.scrollLeft += event.deltaY;
    }
  }

  // Estado del widget
  get isOpen() {
    return this.guideService.isOpen;
  }
  isExpanded = signal<boolean>(false);
  isTyping = signal<boolean>(false);
  copiedCodeId = signal<string | null>(null);

  // Modo Tour Interactivo
  isTourActive = signal<boolean>(false);
  currentTourStepIndex = signal<number>(0);

  // Input del usuario
  userInput = signal<string>('');

  // Mensajes de la conversación (preguntas del usuario, respuestas del bot y pasos del tour)
  conversationMessages = signal<ChatMessage[]>([]);

  // Mensaje de bienvenida reactivo que se adapta instantáneamente al cambiar el idioma
  readonly welcomeMessage = computed<ChatMessage>(() => {
    const isEn = this.translationService.currentLang() === 'en';
    return {
      id: 'welcome-1',
      sender: 'bot',
      text: isEn
        ? 'Hello! 👋 I am your **Interactive Assistant and User Guide for UML Architect & Code Generator**.\n\nI have replaced static user manuals to help you step by step in real time. Feel free to ask any questions about using the platform, modeling diagrams, generating code, or running your projects.'
        : '¡Hola! 👋 Soy tu **Asistente y Guía Interactivo de UML Architect & Code Generator**.\n\nHe reemplazado los manuales de usuario estáticos para ayudarte paso a paso en tiempo real. Puedes preguntarme cualquier duda sobre cómo usar la plataforma, modelar diagramas, generar código o ejecutar tus proyectos.',
      timestamp: this.initialTimestamp,
      quickActions: isEn
        ? [
            { label: '🚀 Start Step-by-Step Tour', query: 'start tour' },
            { label: '🐳 Project Run Commands', query: 'run commands' },
            { label: '⚡ What does the platform generate?', query: 'generated architecture' },
          ]
        : [
            { label: '🚀 Iniciar Tour Guiado Paso a Paso', query: 'iniciar tour' },
            { label: '🐳 Comandos para Correr el Proyecto', query: 'comandos de ejecucion' },
            { label: '⚡ ¿Qué genera la plataforma?', query: 'arquitectura generada' },
          ],
    };
  });

  // Lista de todos los mensajes visibles en el chat
  readonly messages = computed<ChatMessage[]>(() => {
    return [this.welcomeMessage(), ...this.conversationMessages()];
  });

  // Pasos del Tour Guiado en Español
  readonly tourStepsEs: TourStep[] = [
    {
      title: '1. Crear y Configurar tu Proyecto',
      badge: 'Paso 1 de 7',
      description: 'El punto de partida es definir tu proyecto de software en el Dashboard.',
      details: [
        'Ve a la pantalla principal de "Proyectos" y haz clic en "+ Nuevo Proyecto".',
        'Ingresa el nombre del sistema (ej: "Sistema de Ventas").',
        'Define el paquete base Java (ej: "com.uagrm.studio").',
        'Selecciona la versión de Java (Java 21 LTS recomendada) y Spring Boot (3.4.0).',
        '¡Listo! Tu proyecto creará un diagrama principal listo para modelar.',
      ],
      tips: '💡 El paquete base configurado aquí determinará la estructura de carpetas de tu backend en Spring Boot.',
    },
    {
      title: '2. Modelar Clases y Atributos UML',
      badge: 'Paso 2 de 7',
      description: 'Construye tu modelo entidad-relación de forma visual e intuitiva.',
      details: [
        'Abre el Toolbox lateral izquierdo y haz clic en "+ Clase" o haz doble clic en el lienzo.',
        'Haz clic en la clase para abrir el panel de edición.',
        'Agrega atributos indicando visibilidad (+ público, - privado, # protegido).',
        'Selecciona el tipo de dato: String, Long/Integer, UUID, Double, Boolean, LocalDate, LocalDateTime.',
        'Marca los modificadores necesarios: PK (Clave Primaria), AutoIncrement, Nullable o Unique.',
        'Agrega métodos con tipos de retorno y parámetros tipados si tu lógica lo requiere.',
      ],
      tips: '💡 Si defines un atributo como PK de tipo Long, el generador configurará automáticamente una secuencia numérica autoincrementable (BIGSERIAL).',
    },
    {
      title: '3. Conectar Relaciones y Multiplicidades',
      badge: 'Paso 3 de 7',
      description: 'Define la integridad referencial y las asociaciones de tu base de datos.',
      details: [
        'En el Toolbox lateral izquierdo, selecciona el tipo de relación: Asociación, Agregación, Composición, Herencia o Realización.',
        'Haz clic primero en la clase origen y luego en la clase destino.',
        'Configura las multiplicidades en los extremos (1..1, 1..*, 0..*).',
        'Por ejemplo, para "Venta" y "Cliente": una Venta tiene 1 Cliente (1..1) y un Cliente tiene muchas Ventas (1..* o 0..*).',
        'El generador creará automáticamente las anotaciones JPA (@ManyToOne, @OneToMany) y las claves foráneas en Flyway.',
      ],
      tips: '💡 Para cambiar entre el modo de puntero/selección y el modo de conexión, presiona la tecla Escape o el icono de cursor en el Toolbox.',
    },
    {
      title: '4. Colaboración en Tiempo Real',
      badge: 'Paso 4 de 7',
      description: 'Trabaja concurrentemente con tu equipo sin pisar cambios ajenos.',
      details: [
        'En la tarjeta del proyecto en el Dashboard, haz clic en "Miembros".',
        'Invita a tus compañeros mediante su correo electrónico y asígnales rol: OWNER, EDITOR o VIEWER.',
        'Al entrar al diagrama verán los cursores de cada usuario con su color en vivo.',
        'Sistema de Bloqueo Exclusivo (NodeLock): Cuando un usuario edita una clase, esta se bloquea temporalmente para los demás, evitando conflictos.',
        'Usa el chat integrado en vivo de la sala para coordinar el trabajo en equipo.',
      ],
      tips: '💡 Los usuarios con rol VIEWER pueden inspeccionar el diagrama y generar código, pero no pueden mutar el modelo.',
    },
    {
      title: '5. Copilot de IA & Visión Multimodal',
      badge: 'Paso 5 de 7',
      description: 'Modifica diagramas en caliente usando Inteligencia Artificial.',
      details: [
        'Abre el panel derecho de "Copilot IA" en el editor.',
        'Modo Texto: Escribe instrucciones como "Crea una entidad Producto con precio, stock y categoría" o "Conecta Producto con DetalleVenta en relación 1 a N".',
        'Modo Visión / Cámara: Sube un boceto dibujado a mano en papel o usa tu cámara web.',
        'La IA analizará el boceto y construirá las clases y conexiones directamente sobre el lienzo.',
      ],
      tips: '💡 Puedes pedirle a la IA tanto crear clases nuevas como refactorizar entidades existentes.',
    },
    {
      title: '6. Generar Código Fullstack (Spring Boot & Flutter)',
      badge: 'Paso 6 de 7',
      description: 'Transforma tu diagrama visual en software de producción listo para ejecutar.',
      details: [
        'En la barra superior del editor, haz clic en "Generador".',
        'Alterna entre las pestañas "Spring Boot" y "Flutter" para previsualizar el código fuente en tiempo real.',
        'Backend generado: Spring Boot 3 con Arquitectura en Capas (Entities JPA, DTOs, Mappers, Repositorios, Servicios, Controladores REST, JWT Auth, Scripts de migración Flyway y Docker Compose).',
        'Móvil generado: Flutter con Clean Architecture (BLoC, DataSources, Repositorios, Entidades, Pantallas CRUD completas, Autenticación JWT y Asistente IA Local).',
        'Haz clic en "Descargar ZIP" para obtener el proyecto empaquetado.',
      ],
      tips: '💡 El backend incluye soporte nativo para PostgreSQL en Docker y autenticación con contraseñas encriptadas con BCrypt.',
    },
    {
      title: '7. Puesta en Marcha en tu Máquina',
      badge: 'Paso 7 de 7',
      description: 'Ejecuta el backend y la app móvil descargados en 3 simples pasos.',
      details: [
        '1. Descomprime el ZIP y abre una terminal en la carpeta /backend.',
        '2. Inicia la base de datos PostgreSQL con Docker Compose.',
        '3. Ejecuta el backend Spring Boot con Gradle.',
        '4. En otra terminal en /mobile_flutter, ejecuta la app en tu móvil o emulador.',
        'Credenciales de Administrador por defecto: admin@studio.com / admin123.',
      ],
      code: `# 1. Levantar base de datos PostgreSQL
docker compose -f docker-compose.local.yml up -d db

# 2. Ejecutar backend Spring Boot
gradle bootRun

# 3. En otra terminal, ejecutar App Móvil Flutter
cd ../mobile_flutter
flutter run`,
      tips: '💡 Si quieres reiniciar la base de datos desde cero, usa: docker compose -f docker-compose.local.yml down -v',
    },
  ];

  // Pasos del Tour Guiado en Inglés
  readonly tourStepsEn: TourStep[] = [
    {
      title: '1. Create & Configure your Project',
      badge: 'Step 1 of 7',
      description: 'The starting point is defining your software project in the Dashboard.',
      details: [
        'Go to the main "Projects" screen and click "+ New Project".',
        'Enter the system name (e.g. "Sales System").',
        'Define the base Java package (e.g. "com.uagrm.studio").',
        'Select the Java version (Java 21 LTS recommended) and Spring Boot (3.4.0).',
        'Done! Your project will create a main diagram ready for modeling.',
      ],
      tips: '💡 The base package configured here determines the folder structure of your Spring Boot backend.',
    },
    {
      title: '2. Model UML Classes and Attributes',
      badge: 'Step 2 of 7',
      description: 'Build your entity-relationship model visually and intuitively.',
      details: [
        'Open the left Toolbox and click "+ Class" or double-click anywhere on the canvas.',
        'Click on the class to open the properties panel.',
        'Add attributes specifying visibility (+ public, - private, # protected).',
        'Select data types: String, Long/Integer, UUID, Double, Boolean, LocalDate, LocalDateTime.',
        'Check required modifiers: PK (Primary Key), AutoIncrement, Nullable, or Unique.',
        'Add methods with typed return values and parameters if your business logic requires it.',
      ],
      tips: '💡 Defining a Long PK will automatically configure an autoincrementing numeric sequence (BIGSERIAL).',
    },
    {
      title: '3. Connect Relationships & Multiplicities',
      badge: 'Step 3 of 7',
      description: 'Define database associations and referential integrity.',
      details: [
        'In the left Toolbox, select the relationship type: Association, Aggregation, Composition, Generalization, or Realization.',
        'Click first on the source class, then click on the target class.',
        'Configure multiplicities at both ends (1..1, 1..*, 0..*).',
        'For example, for "Sale" and "Customer": a Sale has 1 Customer (1..1) and a Customer has many Sales (1..* or 0..*).',
        'The generator will automatically generate JPA annotations (@ManyToOne, @OneToMany) and foreign keys in Flyway.',
      ],
      tips: '💡 To toggle between selection mode and connection mode, press Escape or click the cursor icon in the Toolbox.',
    },
    {
      title: '4. Real-time Team Collaboration',
      badge: 'Step 4 of 7',
      description: 'Work concurrently with your team without overwriting changes.',
      details: [
        'On the project card in the Dashboard, click "Members".',
        'Invite teammates via email and assign roles: OWNER, EDITOR, or VIEWER.',
        'Upon entering the diagram, you will see real-time colored cursors for every active user.',
        'Exclusive Lock System (NodeLock): When a user edits a class, it is temporarily locked for others to prevent conflicts.',
        'Use the built-in room chat to coordinate development and modeling in real time.',
      ],
      tips: '💡 Users with VIEWER role can inspect the canvas and generate code, but cannot modify the model.',
    },
    {
      title: '5. AI Copilot & Multimodal Vision',
      badge: 'Step 5 of 7',
      description: 'Mutate diagrams on the fly using Artificial Intelligence.',
      details: [
        'Open the "AI Copilot" panel on the right side of the editor.',
        'Text Mode: Type instructions like "Create a Product entity with price, stock and category" or "Connect Product with SaleItem in 1-to-N relation".',
        'Vision / Camera Mode: Upload a hand-drawn sketch on paper or capture with your webcam.',
        'The AI analyzes the sketch and renders the classes and relationships directly on the canvas.',
      ],
      tips: '💡 You can instruct the AI to both create new classes and refactor existing entities.',
    },
    {
      title: '6. Fullstack Code Generator (Spring Boot & Flutter)',
      badge: 'Step 6 of 7',
      description: 'Transform your visual diagram into production-ready software in seconds.',
      details: [
        'In the editor\'s top bar, click "Generator".',
        'Toggle between "Spring Boot" and "Flutter" tabs to preview source code in real time.',
        'Generated Backend: Spring Boot 3 with Layered Architecture (JPA Entities, DTOs, Mappers, Repositories, Services, REST Controllers, JWT Auth, Flyway migrations, and Docker Compose).',
        'Generated Mobile: Flutter with Clean Architecture (BLoC, DataSources, Repositories, Entities, full CRUD screens, JWT Auth, and Local AI Assistant).',
        'Click "Download ZIP" to download the packaged project.',
      ],
      tips: '💡 The backend includes native PostgreSQL in Docker and BCrypt password encryption.',
    },
    {
      title: '7. Running on your Machine',
      badge: 'Step 7 of 7',
      description: 'Run the downloaded backend and mobile app in 3 simple steps.',
      details: [
        '1. Extract the ZIP file and open a terminal in the /backend folder.',
        '2. Start PostgreSQL database with Docker Compose.',
        '3. Run Spring Boot backend with Gradle.',
        '4. In another terminal inside /mobile_flutter, run the app on your mobile device or emulator.',
        'Default Admin credentials: admin@studio.com / admin123.',
      ],
      code: `# 1. Start PostgreSQL in Docker
docker compose -f docker-compose.local.yml up -d db

# 2. Run Spring Boot backend
gradle bootRun

# 3. In another terminal, run Flutter Mobile App
cd ../mobile_flutter
flutter run`,
      tips: '💡 To restart the database from scratch, use: docker compose -f docker-compose.local.yml down -v',
    },
  ];

  // Pasos del Tour activos según el idioma
  readonly currentTourSteps = computed<TourStep[]>(() => {
    return this.translationService.currentLang() === 'en' ? this.tourStepsEn : this.tourStepsEs;
  });

  // Píldoras de sugerencias rápidas en Español
  readonly quickPillsEs = [
    { label: '🚀 Guía Rápida (Paso a Paso)', query: 'iniciar tour' },
    { label: '🐳 ¿Cómo correr con Docker y Gradle?', query: 'comandos de ejecucion' },
    { label: '⚡ ¿Cómo generar Spring Boot y Flutter?', query: 'como generar codigo' },
    { label: '🎨 ¿Cómo crear clases y relaciones?', query: 'como modelar clases y relaciones' },
    { label: '📱 ¿Cómo funciona la IA Local en el móvil?', query: 'ia en flutter y qwen' },
    { label: '👥 ¿Cómo colaborar en equipo?', query: 'colaboracion en tiempo real' },
    { label: '🔄 ¿Cómo importar/exportar a Enterprise Architect?', query: 'enterprise architect xmi' },
  ];

  // Píldoras de sugerencias rápidas en Inglés
  readonly quickPillsEn = [
    { label: '🚀 Quick Guide (Step by Step)', query: 'start tour' },
    { label: '🐳 How to run with Docker & Gradle?', query: 'run commands' },
    { label: '⚡ How to generate Spring Boot & Flutter?', query: 'how to generate code' },
    { label: '🎨 How to create classes & relations?', query: 'how to model classes' },
    { label: '📱 How does Local AI work on mobile?', query: 'mobile ai and qwen' },
    { label: '👥 How to collaborate in teams?', query: 'realtime collaboration' },
    { label: '🔄 How to import/export Enterprise Architect?', query: 'enterprise architect xmi' },
  ];

  // Píldoras activas según el idioma
  readonly quickPills = computed(() => {
    return this.translationService.currentLang() === 'en' ? this.quickPillsEn : this.quickPillsEs;
  });

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop =
          this.messagesContainer.nativeElement.scrollHeight;
      }
    } catch (_) {}
  }

  toggleOpen(): void {
    this.guideService.toggleGuide();
  }

  toggleExpand(): void {
    this.isExpanded.update((v) => !v);
  }

  resetChat(): void {
    this.isTourActive.set(false);
    this.currentTourStepIndex.set(0);
    this.conversationMessages.set([]);
  }

  copyCode(code: string, id: string): void {
    navigator.clipboard.writeText(code);
    this.copiedCodeId.set(id);
    setTimeout(() => {
      this.copiedCodeId.set(null);
    }, 2000);
  }

  formatMarkdown(rawText: string, sender: 'bot' | 'user' = 'bot'): SafeHtml {
    if (!rawText) return '';
    if (sender === 'user') {
      const escaped = rawText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>');
      return this.sanitizer.bypassSecurityTrustHtml(escaped);
    }

    let html = rawText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 1. Headers ### H3
    html = html.replace(
      /^###\s+(.+)$/gm,
      '<h4 class="font-bold text-sm text-slate-900 dark:text-slate-100 mt-2.5 mb-1.5 flex items-center gap-1.5 pb-0.5 border-b border-slate-200/60 dark:border-slate-700/50">$1</h4>'
    );

    // 2. Headers ## H2
    html = html.replace(
      /^##\s+(.+)$/gm,
      '<h3 class="font-bold text-base text-slate-900 dark:text-slate-100 mt-3 mb-2">$1</h3>'
    );

    // 3. Negrita **texto**
    html = html.replace(
      /\*\*([^*]+)\*\*/g,
      '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>'
    );

    // 4. Código en línea `codigo`
    html = html.replace(
      /`([^`]+)`/g,
      '<code class="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-[#1E2548] text-indigo-700 dark:text-indigo-300 font-mono text-[11px] border border-slate-300/80 dark:border-[#2D3762]">$1</code>'
    );

    // 5. Cajas de Tips / Alertas con icono
    html = html.replace(
      /^💡\s+(.+)$/gm,
      '<div class="p-2.5 my-2.5 bg-amber-50 dark:bg-amber-950/30 border-l-3 border-amber-500 rounded-r text-amber-900 dark:text-amber-200 text-[11px] leading-relaxed flex items-start gap-2 shadow-2xs"><span class="shrink-0 text-sm">💡</span><div class="flex-1">$1</div></div>'
    );
    html = html.replace(
      /^🎉\s+(.+)$/gm,
      '<div class="p-2.5 my-2.5 bg-emerald-50 dark:bg-emerald-950/30 border-l-3 border-emerald-500 rounded-r text-emerald-900 dark:text-emerald-200 text-[11px] leading-relaxed flex items-start gap-2 shadow-2xs"><span class="shrink-0 text-sm">🎉</span><div class="flex-1">$1</div></div>'
    );

    // 6. Viñetas con sub-niveles: "  - texto"
    html = html.replace(
      /^\s{2,}[-•*]\s+(.+)$/gm,
      '<div class="flex items-start gap-2 my-1 text-slate-600 dark:text-slate-300 pl-4 text-[11px]"><span class="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-500 mt-1.5 shrink-0"></span><span class="flex-1">$1</span></div>'
    );

    // 7. Viñetas principales: "• texto" o "- texto"
    html = html.replace(
      /^[•\-*]\s+(.+)$/gm,
      '<div class="flex items-start gap-2 my-1 text-slate-700 dark:text-slate-200 pl-0.5 text-xs"><span class="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 mt-1.5 shrink-0"></span><span class="flex-1">$1</span></div>'
    );

    // 8. Párrafos y saltos de línea dobles
    html = html.replace(/\n\n/g, '<div class="h-2"></div>');

    // 9. Saltos de línea simples (que no sean después o antes de tags de bloque)
    html = html.replace(/(?<!(<\/h[234]>|<\/div>))\n(?!(<h[234]>|<div))/g, '<br/>');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  // ==================== LÓGICA DEL TOUR GUIADO ====================

  startTour(): void {
    this.isTourActive.set(true);
    this.currentTourStepIndex.set(0);
    this.sendTourStepMessage(0);
  }

  nextTourStep(): void {
    const nextIdx = this.currentTourStepIndex() + 1;
    if (nextIdx < this.currentTourSteps().length) {
      this.currentTourStepIndex.set(nextIdx);
      this.sendTourStepMessage(nextIdx);
    } else {
      this.finishTour();
    }
  }

  prevTourStep(): void {
    const prevIdx = this.currentTourStepIndex() - 1;
    if (prevIdx >= 0) {
      this.currentTourStepIndex.set(prevIdx);
      this.sendTourStepMessage(prevIdx);
    }
  }

  goToTourStep(index: number): void {
    if (index >= 0 && index < this.currentTourSteps().length) {
      this.currentTourStepIndex.set(index);
      this.sendTourStepMessage(index);
    }
  }

  finishTour(): void {
    this.isTourActive.set(false);
    const isEn = this.translationService.currentLang() === 'en';
    this.addBotMessage(
      isEn
        ? '🎉 **Congratulations! You have completed the UML Architect Interactive Tour.**\n\nYou now know the entire workflow: from creating your project to modeling on the canvas, generating Fullstack code, and running the backend and mobile app.\n\nDo you have any specific questions? Type them in the chat and I will be happy to help!'
        : '🎉 **¡Felicidades! Has completado el Tour Interactivo de UML Architect.**\n\nYa conoces todo el flujo: desde crear tu proyecto hasta modelar en el lienzo, generar código Fullstack y poner en marcha el backend y la app móvil.\n\n¿Tienes alguna duda específica? Escríbela en el chat y con gusto te respondo.',
      undefined,
      undefined,
      isEn
        ? [
            { label: '🐳 View Docker & Gradle commands', query: 'run commands' },
            { label: '📱 View Qwen2.5 Local AI integration', query: 'mobile ai and qwen' },
            { label: '🔄 Restart Tour', query: 'start tour' },
          ]
        : [
            { label: '🐳 Ver comandos Docker & Gradle', query: 'comandos de ejecucion' },
            { label: '📱 Ver integración con IA local Qwen2.5', query: 'ia en flutter y qwen' },
            { label: '🔄 Reiniciar Tour', query: 'iniciar tour' },
          ],
    );
  }

  private sendTourStepMessage(index: number): void {
    const step = this.currentTourSteps()[index];
    const detailsFormatted = step.details.map((d) => `• ${d}`).join('\n');
    const text = `### 📘 ${step.title} (${step.badge})\n\n${step.description}\n\n${detailsFormatted}\n\n${step.tips}`;

    this.addBotMessage(text, step.code, 'bash');
  }

  // ==================== PROCESAMIENTO CONVERSACIONAL ====================

  sendMessage(textToSend?: string): void {
    const query = (textToSend ?? this.userInput()).trim();
    if (!query) return;

    // Agregar mensaje del usuario a conversationMessages
    this.conversationMessages.update((msgs) => [
      ...msgs,
      {
        id: 'user-' + Date.now(),
        sender: 'user',
        text: query,
        timestamp: new Date(),
      },
    ]);

    if (!textToSend) {
      this.userInput.set('');
    }

    // Simular escritura interactiva del bot
    this.isTyping.set(true);
    setTimeout(() => {
      this.resolveUserQuery(query);
      this.isTyping.set(false);
    }, 450);
  }

  private addBotMessage(
    text: string,
    codeSnippet?: string,
    codeLanguage?: string,
    quickActions?: { label: string; query: string }[],
  ): void {
    this.conversationMessages.update((msgs) => [
      ...msgs,
      {
        id: 'bot-' + Date.now(),
        sender: 'bot',
        text,
        timestamp: new Date(),
        codeSnippet,
        codeLanguage,
        quickActions,
      },
    ]);
  }

  private resolveUserQuery(rawInput: string): void {
    const text = rawInput.toLowerCase().trim();
    const isEn = this.translationService.currentLang() === 'en';

    // 1. Iniciar o navegar en el tour
    if (
      text.includes('iniciar tour') ||
      text.includes('comenzar tour') ||
      text.includes('start tour') ||
      text.includes('tour') ||
      text.includes('empezar') ||
      text.includes('begin') ||
      text.includes('tutorial') ||
      text.includes('paso a paso') ||
      text.includes('step by step')
    ) {
      this.startTour();
      return;
    }

    // 2. Comandos de Ejecución (Docker, Gradle, PostgreSQL, Flutter)
    if (
      text.includes('docker') ||
      text.includes('gradle') ||
      text.includes('bootrun') ||
      text.includes('comando') ||
      text.includes('command') ||
      text.includes('ejecut') ||
      text.includes('correr') ||
      text.includes('run') ||
      text.includes('compil') ||
      text.includes('build') ||
      text.includes('levantar') ||
      text.includes('arrancar') ||
      text.includes('start')
    ) {
      this.addBotMessage(
        isEn
          ? '### 🚀 Commands to Run the Downloaded Project\n\nTo start the generated project on your local machine, run these steps in your terminal:\n\n**1. Start PostgreSQL Database:**\nInside `/backend`, run Docker Compose in the background.\n\n**2. Build & Run Spring Boot Backend:**\nExecute Gradle. Flyway will automatically apply database migrations and seed the default admin account (`admin@studio.com` / `admin123`).\n\n**3. Run Flutter Mobile App:**\nIn another terminal, navigate to `/mobile_flutter` and run the app on your mobile device or emulator.'
          : '### 🚀 Comandos para Ejecutar el Proyecto Descargado\n\nPara poner en marcha el proyecto generado en tu máquina local, sigue estos sencillos pasos desde tu terminal:\n\n**1. Iniciar la Base de Datos PostgreSQL:**\nDentro de la carpeta `/backend`, ejecuta Docker Compose en segundo plano.\n\n**2. Compilar y Ejecutar el Backend (Spring Boot 3):**\nEjecuta Gradle. Flyway aplicará automáticamente las migraciones y creará el usuario administrador por defecto (`admin@studio.com` / `admin123`).\n\n**3. Ejecutar la App Móvil (Flutter):**\nEn otra terminal, entra a `/mobile_flutter` y corre la aplicación en tu dispositivo o emulador.',
        `# === STEP 1: Start PostgreSQL in Docker (port 5431/5432) ===
cd backend
docker compose -f docker-compose.local.yml up -d db

# === STEP 2: Start Spring Boot 3 Server ===
gradle bootRun

# === STEP 3 (Optional): Run Flutter Mobile App ===
cd ../mobile_flutter
flutter run`,
        'bash',
        isEn
          ? [
              { label: '🔑 Default credentials?', query: 'default credentials' },
              { label: '📱 How to use Qwen2.5 AI?', query: 'mobile ai and qwen' },
              { label: '⚡ How to generate code?', query: 'how to generate code' },
            ]
          : [
              { label: '🔑 ¿Cuáles son las credenciales por defecto?', query: 'credenciales por defecto' },
              { label: '📱 ¿Cómo usar la IA local Qwen2.5?', query: 'ia en flutter y qwen' },
              { label: '⚡ ¿Cómo generar el código?', query: 'como generar codigo' },
            ],
      );
      return;
    }

    // 3. Credenciales y Autenticación
    if (
      text.includes('credencial') ||
      text.includes('credential') ||
      text.includes('admin') ||
      text.includes('usuario') ||
      text.includes('user') ||
      text.includes('password') ||
      text.includes('contraseña') ||
      text.includes('clave') ||
      text.includes('login') ||
      text.includes('auth')
    ) {
      this.addBotMessage(
        isEn
          ? '### 🔑 Default Access Credentials\n\nThe system automatically seeds an Administrator user in the database (with BCrypt encrypted password):\n\n• **Email:** `admin@studio.com`\n• **Password:** `admin123`\n• **Role:** `ADMIN`\n\n**How does authentication work?**\n• The backend exposes `/api/auth/login` and `/api/auth/register` endpoints protected with **JWT Tokens (Bearer)**.\n• The Flutter mobile app securely stores tokens and profile details locally (`TokenStorageService`) and displays the connected user on the **My Profile** screen.'
          : '### 🔑 Credenciales de Acceso por Defecto\n\nEl sistema inicializa automáticamente un usuario con rol de Administrador en la base de datos (con contraseña encriptada en BCrypt):\n\n• **Correo electrónico:** `admin@studio.com`\n• **Contraseña:** `admin123`\n• **Rol:** `ADMIN`\n\n**¿Cómo funciona la autenticación?**\n• El backend expone endpoints `/api/auth/login` y `/api/auth/register` protegidos con **JWT Token (Bearer)**.\n• La app móvil Flutter almacena de forma segura el token y los datos del perfil en local (`TokenStorageService`) y muestra el usuario conectado en la pantalla de **Mi Perfil**.',
        undefined,
        undefined,
        isEn
          ? [
              { label: '🐳 View backend run commands', query: 'run commands' },
              { label: '📱 View mobile app features', query: 'mobile ai and qwen' },
            ]
          : [
              { label: '🐳 Ver comandos para correr el backend', query: 'comandos de ejecucion' },
              { label: '📱 Ver funciones de la app móvil', query: 'ia en flutter y qwen' },
            ],
      );
      return;
    }

    // 4. Generación de Código
    if (
      text.includes('generar') ||
      text.includes('generate') ||
      text.includes('generator') ||
      text.includes('codigo') ||
      text.includes('código') ||
      text.includes('code') ||
      text.includes('spring') ||
      text.includes('descargar') ||
      text.includes('download') ||
      text.includes('zip') ||
      text.includes('export')
    ) {
      this.addBotMessage(
        isEn
          ? '### ⚡ Automated Fullstack Code Generator\n\nUML Architect compiles your visual diagram into clean, production-ready code:\n\n**1. Backend (Spring Boot 3 + PostgreSQL):**\n• Typed **REST Controllers** with OpenAPI/Swagger and Request/Response DTOs.\n• Decoupled **Services & Business Logic** with Mappers.\n• **Spring Data JPA Repositories** and Entities with relational mappings.\n• **Flyway Migrations (SQL)** supporting native UUID (`pgcrypto`) and numeric autoincrement sequences (`BIGSERIAL`).\n• **JWT Security** with BCrypt and authorization filters.\n• Pre-configured **Docker Compose** files.\n\n**2. Mobile Frontend (Flutter):**\n• **Clean Architecture** layered structure (Data, Domain, Presentation).\n• Reactive **BLoC State Management**.\n• Complete **CRUD Screens** with validation and interactive cards.\n• **Local AI Assistant** with on-device **Qwen 2.5 GGUF** download via llama.cpp and native semantic engine.\n\n**How to download?**\nIn the editor top bar, click the **"Generator"** button and press **"Download ZIP"**.'
          : '### ⚡ Generador de Código Fullstack Automatizado\n\nUML Architect compila tu diagrama visual en código limpio listo para producción:\n\n**1. Backend (Spring Boot 3 + PostgreSQL):**\n• **Controladores REST** tipados con Swagger/OpenAPI y DTOs de petición y respuesta.\n• **Servicios y Lógica de Negocio** desacoplada con Mappers.\n• **Repositorios Spring Data JPA** y Entidades con relaciones tipadas.\n• **Migraciones Flyway (SQL)** con soporte de UUID nativo (`pgcrypto`) y secuencias numéricas (`BIGSERIAL`).\n• **Seguridad JWT** con BCrypt y filtros de autorización.\n• **Docker Compose** preconfigurado.\n\n**2. Frontend Móvil (Flutter):**\n• **Clean Architecture** estructurada en Capas (Data, Domain, Presentation).\n• **Gestión de Estado BLoC** reactiva.\n• **Pantallas CRUD completas** con validaciones y tarjetas interactivas.\n• **Asistente IA Local** con descarga on-device de **Qwen 2.5 GGUF** vía llama.cpp y motor semántico nativo.\n\n**¿Cómo descargarlo?**\nEn la barra superior del editor, haz clic en el botón **"Generador"** y presiona **"Descargar ZIP"**.',
        undefined,
        undefined,
        isEn
          ? [
              { label: '🐳 How to execute the downloaded ZIP?', query: 'run commands' },
              { label: '🎨 How to create classes on canvas?', query: 'how to model classes' },
            ]
          : [
              { label: '🐳 ¿Cómo ejecuto el ZIP descargado?', query: 'comandos de ejecucion' },
              { label: '🎨 ¿Cómo creo clases en el lienzo?', query: 'como modelar clases y relaciones' },
            ],
      );
      return;
    }

    // 5. Inteligencia Artificial en el Móvil y Qwen 2.5
    if (
      text.includes('pocketpal') ||
      text.includes('flutter') ||
      text.includes('movil') ||
      text.includes('móvil') ||
      text.includes('mobile') ||
      text.includes('ia local') ||
      text.includes('local ai') ||
      text.includes('gemma') ||
      text.includes('qwen') ||
      text.includes('voz') ||
      text.includes('voice') ||
      text.includes('microfono') ||
      text.includes('microphone') ||
      text.includes('audio') ||
      text.includes('speech')
    ) {
      this.addBotMessage(
        isEn
          ? '### 📱 Autonomous On-Device Local AI in the Mobile App\n\nThe Flutter mobile application includes an intelligent assistant that runs **100% locally on your smartphone without requiring external apps like PocketPal**:\n\n**1. On-Device Qwen 2.5 GGUF Inference:**\n• Inside the Flutter app, tap the AI chat screen.\n• Tap **"Download / Load Qwen"** to fetch the lightweight, quantized **Qwen 2.5 model (`qwen2.5-0.5b-instruct-q4_k_m.gguf`)** directly from Hugging Face onto device storage.\n• In-memory inference is executed locally using **llama.cpp / fllama**, providing fast conversational responses with zero data leaving your phone.\n\n**2. Autonomous On-Device Semantic Engine:**\n• If the model is not yet loaded or you want zero RAM overhead, the app automatically switches to its native regex and semantic processor.\n• It executes full CRUD operations directly against the backend REST API:\n  - *"register a user named Ana, email ana@gmail.com, password 123"*\n  - *"update customer 2 changing phone to 77889900"*\n  - *"delete purchase with id 5"*\n  - *"list all sales"*\n\n**3. Voice Dictation (Speech-to-Text):**\n• Tap the microphone button to dictate commands in natural language.'
          : '### 📱 Inteligencia Artificial Local On-Device en la App Móvil\n\nLa app móvil Flutter incluye un asistente inteligente que se ejecuta **100% en local en tu teléfono, sin necesidad de apps externas como PocketPal**:\n\n**1. Inferencia On-Device con Qwen 2.5 GGUF:**\n• Dentro de la app Flutter, ingresa a la pantalla del Asistente IA.\n• Pulsa **"Cargar Qwen"** o **"Descargar"**: la app descargará automáticamente el modelo cuantizado **Qwen 2.5 (`qwen2.5-0.5b-instruct-q4_k_m.gguf`)** directamente desde Hugging Face al almacenamiento del teléfono.\n• La inferencia se ejecuta en el dispositivo mediante **llama.cpp / fllama**, respondiendo en lenguaje natural de forma privada sin conexión a servidores externos.\n\n**2. Motor Semántico On-Device Autónomo:**\n• Si el modelo no está cargado o prefieres ahorrar batería/RAM, la app activa automáticamente el motor semántico nativo.\n• Entiende órdenes en lenguaje natural para ejecutar todo el ciclo CRUD en la API REST:\n  - *"regístrame un usuario con nombre Ana, email ana@gmail.com, password 123"*\n  - *"actualiza el cliente 2 cambiando el teléfono a 77889900"*\n  - *"elimina la compra con id 5"*\n  - *"lista las ventas"*\n\n**3. Dictado por Voz:**\n• Pulsa el botón del micrófono y habla en español para enviar tus comandos sin teclear.',
        undefined,
        undefined,
        isEn
          ? [
              { label: '🐳 View backend run commands', query: 'run commands' },
              { label: '🔑 View admin credentials', query: 'default credentials' },
            ]
          : [
              { label: '🐳 Ver comandos para correr el backend', query: 'comandos de ejecucion' },
              { label: '🔑 Ver credenciales de administrador', query: 'credenciales por defecto' },
            ],
      );
      return;
    }

    // 6. Modelado UML: Clases, Atributos y Métodos
    if (
      text.includes('clase') ||
      text.includes('class') ||
      text.includes('atributo') ||
      text.includes('attribute') ||
      text.includes('metodo') ||
      text.includes('método') ||
      text.includes('method') ||
      text.includes('pk') ||
      text.includes('clave primaria') ||
      text.includes('primary key') ||
      text.includes('tipo') ||
      text.includes('type') ||
      text.includes('dato') ||
      text.includes('data')
    ) {
      this.addBotMessage(
        isEn
          ? '### 🎨 Modeling UML Classes & Attributes\n\n**How to add a class?**\n• Click the `+ Class` button on the left Toolbox or double-click anywhere on the empty canvas.\n\n**Supported data types:**\n• `String`: Text, names, emails, descriptions (`VARCHAR(255)` / `TEXT`).\n• `Long` / `Integer`: Whole numbers, counts, numeric identifiers (`BIGINT` / `INTEGER`).\n• `UUID`: Universally unique identifiers (`UUID` with native generation in PostgreSQL).\n• `Double` / `BigDecimal`: Amounts, prices, decimals.\n• `Boolean`: Logical flags (`true` / `false`).\n• `LocalDate` / `LocalDateTime`: Dates and timestamps (`DATE` / `TIMESTAMP`).\n\n**Modifiers:**\n• **PK:** Marks the Primary Key.\n• **AutoIncrement:** Enables automatic database sequences (`BIGSERIAL`).\n• **Unique:** Ensures non-duplicate values (e.g. emails, invoice numbers).\n• **Nullable:** Allows null values.'
          : '### 🎨 Modelado de Clases y Atributos UML\n\n**¿Cómo agregar una clase?**\n• Haz clic en el botón `+ Clase` del Toolbox lateral izquierdo o haz doble clic en cualquier área vacía del lienzo.\n\n**Tipos de datos soportados por el generador:**\n• `String`: Textos, nombres, correos, descripciones (`VARCHAR(255)` / `TEXT`).\n• `Long` / `Integer`: Números enteros, cantidades, identificadores numéricos (`BIGINT` / `INTEGER`).\n• `UUID`: Identificadores únicos universales (`UUID` con generación nativa en PostgreSQL).\n• `Double` / `BigDecimal`: Montos, precios, subtotales, totales con decimales.\n• `Boolean`: Banderas lógicas (`true` / `false`).\n• `LocalDate` / `LocalDateTime`: Fechas y marcas de tiempo (`DATE` / `TIMESTAMP`).\n\n**Modificadores:**\n• **PK:** Define la clave primaria.\n• **AutoIncrement:** Habilita secuencias automáticas en base de datos (`BIGSERIAL`).\n• **Unique:** Asegura que no existan valores duplicados (ej: emails, números de factura, NIT).\n• **Nullable:** Permite que el campo acepte nulos.',
        undefined,
        undefined,
        isEn
          ? [
              { label: '🔗 How to connect relationships?', query: 'how to connect relations' },
              { label: '⚡ Generate Spring Boot code', query: 'how to generate code' },
            ]
          : [
              { label: '🔗 ¿Cómo conecto relaciones entre clases?', query: 'como conectar relaciones' },
              { label: '⚡ Generar código Spring Boot', query: 'como generar codigo' },
            ],
      );
      return;
    }

    // 7. Relaciones y Multiplicidades
    if (
      text.includes('relacion') ||
      text.includes('relación') ||
      text.includes('relation') ||
      text.includes('relationship') ||
      text.includes('conectar') ||
      text.includes('connect') ||
      text.includes('multiplicidad') ||
      text.includes('multiplicity') ||
      text.includes('asociacion') ||
      text.includes('asociación') ||
      text.includes('association') ||
      text.includes('composicion') ||
      text.includes('composición') ||
      text.includes('composition') ||
      text.includes('agregacion') ||
      text.includes('agregación') ||
      text.includes('aggregation') ||
      text.includes('herencia') ||
      text.includes('inheritance') ||
      text.includes('generalization') ||
      text.includes('foreign key') ||
      text.includes('fk')
    ) {
      this.addBotMessage(
        isEn
          ? '### 🔗 Connecting Relationships & Multiplicities\n\n**Steps to connect two classes:**\n1. In the left Toolbox, click on the relationship type (Association, Aggregation, Composition, Generalization, or Realization).\n2. The cursor activates connection mode.\n3. Click on the **Source Class** (e.g. `Sale`).\n4. Click on the **Target Class** (e.g. `Customer`).\n5. The interactive link is rendered on the canvas.\n\n**Semantic Relationship Types:**\n• **Simple Association:** Standard connection between entities.\n• **Aggregation (Hollow diamond):** "Whole-part" relationship where parts can exist independently.\n• **Composition (Solid diamond):** Strong lifecycle ownership (e.g. `Sale` and `SaleItem`).\n• **Generalization / Inheritance (Hollow triangle arrow):** Defines subclasses and superclasses.\n\n**Multiplicities:**\n• Assign `1..1`, `0..1`, `1..*` or `*` to each end. The generator maps this to `@ManyToOne`, `@OneToMany` or `@OneToOne` in Spring Boot and creates foreign keys in Flyway.'
          : '### 🔗 Conexión de Relaciones y Multiplicidades\n\n**Pasos para conectar dos clases:**\n1. En el Toolbox lateral izquierdo, haz clic sobre el tipo de relación que deseas crear (Asociación, Agregación, Composición, Herencia o Realización).\n2. El cursor se activará en modo de conexión.\n3. Haz clic en la **Clase Origen** (ej: `Venta`).\n4. Haz clic en la **Clase Destino** (ej: `Cliente`).\n5. Se creará el enlace visual en el lienzo.\n\n**Tipos de Relaciones Semánticas:**\n• **Asociación Simple:** Conexión estándar entre dos entidades.\n• **Agregación (Rombo hueco):** Relación "todo-parte" donde las partes pueden existir independientemente.\n• **Composición (Rombo relleno):** Relación fuerte de pertenencia de ciclo de vida (ej: `Venta` y `DetalleVenta`).\n• **Herencia / Generalización (Flecha triangular hueca):** Define subclases y superclases.\n\n**Multiplicidades:**\n• Puedes asignar `1..1`, `0..1`, `1..*` o `*` en cada extremo. El generador traducirá esto a `@ManyToOne`, `@OneToMany` o `@OneToOne` en Spring Boot y las claves foráneas correspondientes en PostgreSQL.',
        undefined,
        undefined,
        isEn
          ? [
              { label: '🎨 How to model classes & attributes?', query: 'how to model classes' },
              { label: '⚡ How to generate code?', query: 'how to generate code' },
            ]
          : [
              { label: '🎨 ¿Cómo crear atributos y clases?', query: 'como modelar clases y atributos' },
              { label: '⚡ ¿Cómo generar código?', query: 'como generar codigo' },
            ],
      );
      return;
    }

    // 8. Colaboración en Vivo
    if (
      text.includes('colabora') ||
      text.includes('collaborat') ||
      text.includes('equipo') ||
      text.includes('team') ||
      text.includes('miembro') ||
      text.includes('member') ||
      text.includes('invitar') ||
      text.includes('invite') ||
      text.includes('tiempo real') ||
      text.includes('real time') ||
      text.includes('realtime') ||
      text.includes('bloqueo') ||
      text.includes('lock') ||
      text.includes('nodelock') ||
      text.includes('socket')
    ) {
      this.addBotMessage(
        isEn
          ? '### 👥 Real-Time Multi-User Collaboration\n\nUML Architect enables multiple developers to work on the same diagram simultaneously using **WebSockets (Socket.io)**:\n\n**1. Invite Members:**\n• In the Projects Dashboard, click the **"Members"** button on the project card.\n• Enter your teammate\'s email and assign a role:\n  - **OWNER:** Full administrative control.\n  - **EDITOR:** Can create, edit, and delete classes and relations in real time.\n  - **VIEWER:** Read-only access (can inspect diagram and generate code).\n\n**2. Remote Cursors:**\n• See your teammates\' live colored cursors moving across the canvas with their name.\n\n**3. NodeLock Concurrency Protection:**\n• When a user opens a class to edit, the system locks that entity for others, preventing conflicting overwrites.'
          : '### 👥 Colaboración Multiusuario en Tiempo Real\n\nUML Architect permite que múltiples desarrolladores trabajen en el mismo diagrama simultáneamente mediante **WebSockets (Socket.io)**:\n\n**1. Invitar Miembros:**\n• En el Dashboard de Proyectos, haz clic en el botón **"Miembros"** de la tarjeta del proyecto.\n• Ingresa el correo de tu colega y asígnale un rol:\n  - **OWNER:** Propietario del proyecto con control total.\n  - **EDITOR:** Puede crear, modificar y eliminar clases y relaciones en tiempo real.\n  - **VIEWER:** Solo lectura (puede explorar el lienzo y generar código).\n\n**2. Cursores Remotos:**\n• Verás los cursores de tus compañeros moviéndose por el lienzo en tiempo real con su nombre y color.\n\n**3. Bloqueo de Nodos (NodeLock):**\n• Cuando alguien abre para editar una clase, el sistema bloquea temporalmente esa entidad para los demás evitando sobreescrituras accidentales.',
        undefined,
        undefined,
        isEn
          ? [
              { label: '🚀 Start Guided Tour', query: 'start tour' },
              { label: '⚡ Generate project code', query: 'how to generate code' },
            ]
          : [
              { label: '🚀 Iniciar Tour Guiado', query: 'iniciar tour' },
              { label: '⚡ Generar código del diagrama', query: 'como generar codigo' },
            ],
      );
      return;
    }

    // 9. Enterprise Architect XMI
    if (
      text.includes('xmi') ||
      text.includes('enterprise architect') ||
      text.includes('ea') ||
      text.includes('importar') ||
      text.includes('import') ||
      text.includes('exportar') ||
      text.includes('export')
    ) {
      this.addBotMessage(
        isEn
          ? '### 🔄 Enterprise Architect Interoperability (XMI 2.1)\n\nThe system offers complete bidirectional compatibility with **Enterprise Architect**:\n\n**1. Export to Enterprise Architect:**\n• In the top bar, click **"Export"** and select **"Enterprise Architect (.xmi)"**.\n• Generates a standard XMI 2.1 file containing diagrams, classes, attributes, visibilities, and relationships compatible with Sparx Systems Enterprise Architect.\n\n**2. Import from Enterprise Architect:**\n• In the top bar, click **"Import XMI"** and upload your `.xmi` file.\n• The parser converts XMI entities into interactive canvas nodes and connectors.\n\n**3. Version History:**\n• Save diagram snapshots and restore previous versions at any time.'
          : '### 🔄 Interoperabilidad con Enterprise Architect (XMI 2.1)\n\nEl sistema cuenta con compatibilidad bidireccional completa con **Enterprise Architect**:\n\n**1. Exportar a Enterprise Architect:**\n• En la barra superior, haz clic en **"Exportar"** y selecciona **"Enterprise Architect (.xmi)"**.\n• Genera un archivo estándar XMI 2.1 con diagramas, clases, atributos, visibilidades y relaciones reconocibles por Sparx Systems Enterprise Architect.\n\n**2. Importar desde Enterprise Architect:**\n• En la barra superior, selecciona **"Importar XMI"** y sube tu archivo `.xmi`.\n• El conversor transformará automáticamente los elementos XMI en nodos y conexiones interactivas en el lienzo web.\n\n**3. Historial de Versiones:**\n• Puedes guardar snapshots del diagrama y restaurar versiones anteriores en cualquier momento.',
        undefined,
        undefined,
        isEn
          ? [
              { label: '⚡ Generate Spring Boot code', query: 'how to generate code' },
              { label: '🚀 View Guided Tour', query: 'start tour' },
            ]
          : [
              { label: '⚡ Generar código Spring Boot', query: 'como generar codigo' },
              { label: '🚀 Ver Tour Guiado', query: 'iniciar tour' },
            ],
      );
      return;
    }

    // 10. Copilot de IA en el Lienzo Web
    if (
      text.includes('copilot') ||
      text.includes('asistente') ||
      text.includes('assistant') ||
      text.includes('gemini') ||
      text.includes('camara') ||
      text.includes('cámara') ||
      text.includes('camera') ||
      text.includes('foto') ||
      text.includes('photo') ||
      text.includes('boceto') ||
      text.includes('sketch')
    ) {
      this.addBotMessage(
        isEn
          ? '### 🤖 AI Copilot on the Canvas\n\nIn the editor, click the **"AI Copilot"** button:\n\n• **Natural Language Prompts:**\n  Instruct the AI in plain English or Spanish. For example:\n  *"Create a billing module with Customer, Invoice and InvoiceItem with their relationships"*\n\n• **Multimodal Visual Input (Camera / Sketch):**\n  Have a diagram drawn on a whiteboard or paper? Upload a picture or turn on your webcam. The AI parses the shapes and text and renders the classes and relations directly on your canvas.'
          : '### 🤖 Copilot de Inteligencia Artificial en el Lienzo\n\nEn la esquina superior derecha del editor, haz clic en el botón flotante **"Copilot IA"**:\n\n• **Comandos en Lenguaje Natural:**\n  Escribe en español lo que deseas en el diagrama. Ejemplo:\n  *"Crea un módulo de compras con Proveedor, Compra y DetalleCompra con sus relaciones"*\n\n• **Entrada Visual Multimodal (Cámara o Foto):**\n  ¿Tienes un diagrama dibujado en una pizarra o en una hoja de papel? Sube la foto o activa tu cámara web. La IA interpretará los rectángulos, textos y flechas y colocará las clases y relaciones directamente en el lienzo.',
        undefined,
        undefined,
        isEn
          ? [
              { label: '🎨 How to edit classes manually?', query: 'how to model classes' },
              { label: '⚡ Generate project code', query: 'how to generate code' },
            ]
          : [
              { label: '🎨 ¿Cómo editar clases manualmente?', query: 'como modelar clases y atributos' },
              { label: '⚡ Generar código del diagrama', query: 'como generar codigo' },
            ],
      );
      return;
    }

    // 11. Respuesta por Defecto (Fallback Inteligente con Recomendaciones)
    this.addBotMessage(
      isEn
        ? `I understand your query regarding: "${rawInput}".\n\nHere are the primary topics from the **Interactive Manual** to assist you right away. Select any quick option below:`
        : `Entiendo tu consulta sobre: "${rawInput}".\n\nAquí tienes los temas principales del **Manual Interactivo** para ayudarte de inmediato. Selecciona cualquiera de las opciones rápidas:`,
      undefined,
      undefined,
      isEn
        ? [
            { label: '🚀 Start Step-by-Step Tour', query: 'start tour' },
            { label: '🐳 Docker & Gradle Run Commands', query: 'run commands' },
            { label: '⚡ Generate Spring Boot & Flutter', query: 'how to generate code' },
            { label: '📱 Mobile App & Qwen2.5 Local AI', query: 'mobile ai and qwen' },
            { label: '🎨 Create UML Classes & Relations', query: 'how to model classes' },
          ]
        : [
            { label: '🚀 Iniciar Tour Guiado Paso a Paso', query: 'iniciar tour' },
            { label: '🐳 Comandos para Correr Docker y Gradle', query: 'comandos de ejecucion' },
            { label: '⚡ Generar Código Spring Boot y Flutter', query: 'como generar codigo' },
            { label: '📱 App Móvil e IA Local Qwen2.5', query: 'ia en flutter y qwen' },
            { label: '🎨 Crear Clases y Relaciones UML', query: 'como modelar clases y relaciones' },
          ],
    );
  }
}
