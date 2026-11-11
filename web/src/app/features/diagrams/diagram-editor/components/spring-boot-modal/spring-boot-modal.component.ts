import {
  Component,
  input,
  output,
  signal,
  inject,
  computed,
  effect,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroBolt,
  heroCodeBracket,
  heroCube,
  heroDocumentText,
  heroFolder,
  heroServer,
  heroCommandLine,
  heroArrowDownTray,
  heroClipboardDocument,
  heroCheck,
  heroXMark,
  heroArrowPath,
  heroCpuChip,
  heroSparkles,
  heroCircleStack,
  heroAdjustmentsHorizontal,
  heroDevicePhoneMobile,
  heroExclamationTriangle,
} from '@ng-icons/heroicons/outline';
import {
  CodeGeneratorService,
  GeneratedFile,
  GenerateCodeRequest,
} from '../../../../../core/services/code-generator.service';
import { UmlClassNode, UmlConnection } from '../../../../../core/models/diagram.model';
import { TranslatePipe } from '../../../../../core/i18n';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import hljs from 'highlight.js/lib/core';
import java from 'highlight.js/lib/languages/java';
import dart from 'highlight.js/lib/languages/dart';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import properties from 'highlight.js/lib/languages/properties';

hljs.registerLanguage('java', java);
hljs.registerLanguage('dart', dart);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('properties', properties);

@Component({
  standalone: true,
  selector: 'app-spring-boot-modal',
  imports: [CommonModule, FormsModule, NgIconComponent, TranslatePipe],
  providers: [
    provideIcons({
      heroBolt,
      heroCodeBracket,
      heroCube,
      heroDocumentText,
      heroFolder,
      heroServer,
      heroCommandLine,
      heroArrowDownTray,
      heroClipboardDocument,
      heroCheck,
      heroXMark,
      heroArrowPath,
      heroCpuChip,
      heroSparkles,
      heroCircleStack,
      heroAdjustmentsHorizontal,
      heroDevicePhoneMobile,
      heroExclamationTriangle,
    }),
  ],
  templateUrl: './spring-boot-modal.component.html',
})
export class SpringBootModalComponent implements OnInit {
  private readonly codegenService = inject(CodeGeneratorService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly isOpen = input<boolean>(false);
  readonly diagramId = input<string | null>(null);
  readonly diagramName = input<string>('Diagrama UML');
  readonly nodes = input<UmlClassNode[]>([]);
  readonly connections = input<UmlConnection[]>([]);

  readonly closeModal = output<void>();

  // Selección de Plataforma
  selectedPlatform = signal<'all' | 'spring-boot' | 'flutter'>('all');

  // Configuración del Proyecto
  packageName = signal<string>('com.uagrm.studio');
  artifactId = signal<string>('sistema-app');
  projectName = signal<string>('Sistema App Fullstack');
  javaVersion = signal<string>('21');
  databaseName = signal<string>('uml_studio_db');
  databaseUser = signal<string>('postgres');
  databasePassword = signal<string>('postgres');
  serverPort = signal<number>(8080);
  databasePort = signal<number>(5432);

  // Pestaña activa del explorador
  activeCategory = signal<string>('all');
  selectedFile = signal<GeneratedFile | null>(null);
  isCopied = signal<boolean>(false);
  isGenerating = signal<boolean>(false);
  isDownloading = signal<boolean>(false);

  // Archivos generados
  files = signal<GeneratedFile[]>([]);

  readonly filteredFiles = computed(() => {
    const cat = this.activeCategory();
    const all = this.files();
    if (cat === 'all') return all;
    if (cat === 'flutter') {
      return all.filter((f) => f.path.includes('mobile_flutter') || f.path.startsWith('lib/') || f.language === 'dart');
    }
    if (cat === 'spring-boot') {
      return all.filter((f) => f.path.includes('backend') || f.path.startsWith('src/') || f.language === 'java');
    }
    return all.filter((f) => f.layer === cat);
  });

  readonly totalClasses = computed(() => {
    return this.nodes().filter((n) => !n.isAnchor).length;
  });

  readonly totalRelations = computed(() => {
    return this.connections().length;
  });

  readonly highlightedCode = computed<SafeHtml>(() => {
    const file = this.selectedFile();
    if (!file || !file.content) return '';

    const rawCode = file.content;
    const lang = this.detectLanguage(file);

    try {
      if (lang && hljs.getLanguage(lang)) {
        const result = hljs.highlight(rawCode, { language: lang, ignoreIllegals: true });
        return this.sanitizer.bypassSecurityTrustHtml(result.value);
      }
      return this.sanitizer.bypassSecurityTrustHtml(this.escapeHtml(rawCode));
    } catch {
      return this.sanitizer.bypassSecurityTrustHtml(this.escapeHtml(rawCode));
    }
  });

  readonly lineNumbers = computed<number[]>(() => {
    const file = this.selectedFile();
    if (!file || !file.content) return [];
    const count = file.content.split('\n').length;
    return Array.from({ length: count }, (_, i) => i + 1);
  });

  readonly detectedLanguage = computed<string>(() => {
    const file = this.selectedFile();
    if (!file) return '';
    return this.detectLanguage(file);
  });

  private detectLanguage(file: GeneratedFile): string {
    if (file.language) {
      const l = file.language.toLowerCase();
      if (l === 'dart') return 'dart';
      if (l === 'java') return 'java';
      if (l === 'sql') return 'sql';
      if (l === 'yaml' || l === 'yml') return 'yaml';
      if (l === 'json') return 'json';
      if (l === 'xml') return 'xml';
      if (l === 'docker' || l === 'dockerfile') return 'dockerfile';
    }
    const name = (file.filename || file.path).toLowerCase();
    if (name.endsWith('.java')) return 'java';
    if (name.endsWith('.dart')) return 'dart';
    if (name.endsWith('.sql')) return 'sql';
    if (name.endsWith('.yml') || name.endsWith('.yaml')) return 'yaml';
    if (name.endsWith('.json')) return 'json';
    if (name.endsWith('.xml')) return 'xml';
    if (name.endsWith('.properties')) return 'properties';
    if (name.includes('dockerfile')) return 'dockerfile';
    return 'plaintext';
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  constructor() {
    effect(() => {
      const open = this.isOpen();
      const diagId = this.diagramId();
      const name = this.diagramName();

      if (open) {
        if (name) {
          const clean = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          this.artifactId.set(clean || 'sistema-app');
          this.projectName.set(name);
        }
        if (diagId) {
          this.generatePreview();
        }
      }
    });
  }

  ngOnInit(): void {
    if (this.diagramName()) {
      const clean = this.diagramName().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      this.artifactId.set(clean || 'sistema-app');
      this.projectName.set(this.diagramName());
    }
  }

  setPlatform(plat: 'all' | 'spring-boot' | 'flutter'): void {
    this.selectedPlatform.set(plat);
    this.generatePreview();
  }

  generatePreview(): void {
    const diagId = this.diagramId();
    if (!diagId) {
      this.files.set([]);
      this.selectedFile.set(null);
      this.isGenerating.set(false);
      return;
    }

    this.isGenerating.set(true);

    const payload: GenerateCodeRequest = {
      diagramId: diagId,
      platform: this.selectedPlatform(),
      packageName: this.packageName(),
      artifactId: this.artifactId(),
      projectName: this.projectName(),
      javaVersion: this.javaVersion(),
      databaseName: this.databaseName(),
      databaseUser: this.databaseUser(),
      databasePassword: this.databasePassword(),
      serverPort: this.serverPort(),
      databasePort: this.databasePort(),
      nodes: this.nodes(),
      connections: this.connections(),
    };

    this.codegenService.previewFromDiagramId(diagId, payload).subscribe({
      next: (res) => {
        this.files.set(res.files || []);
        if (res.files && res.files.length > 0) {
          const firstEntity = res.files.find((f) => f.layer === 'entity') || res.files[0];
          this.selectedFile.set(firstEntity);
        }
        this.isGenerating.set(false);
      },
      error: () => {
        this.isGenerating.set(false);
      },
    });
  }

  selectFile(file: GeneratedFile): void {
    this.selectedFile.set(file);
    this.isCopied.set(false);
  }

  copyCode(): void {
    const file = this.selectedFile();
    if (!file) return;

    navigator.clipboard.writeText(file.content).then(() => {
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 2000);
    });
  }

  downloadZip(): void {
    const diagId = this.diagramId();
    if (!diagId) {
      alert('Debes guardar el diagrama antes de descargar el proyecto.');
      return;
    }

    this.isDownloading.set(true);

    const payload: GenerateCodeRequest = {
      diagramId: diagId,
      platform: this.selectedPlatform(),
      packageName: this.packageName(),
      artifactId: this.artifactId(),
      projectName: this.projectName(),
      javaVersion: this.javaVersion(),
      databaseName: this.databaseName(),
      databaseUser: this.databaseUser(),
      databasePassword: this.databasePassword(),
      serverPort: this.serverPort(),
      databasePort: this.databasePort(),
      nodes: this.nodes(),
      connections: this.connections(),
    };

    this.codegenService.downloadZipFromDiagramId(diagId, payload).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.artifactId()}-${this.selectedPlatform()}.zip`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.isDownloading.set(false);
      },
      error: (err) => {
        console.error('Error al descargar ZIP:', err);
        this.isDownloading.set(false);
        const errMsg = err?.error?.message || err?.message || 'Error al descargar el archivo ZIP.';
        alert(`Error al descargar el archivo ZIP: ${errMsg}`);
      },
    });
  }

  getLayerBadge(file: GeneratedFile): { label: string; class: string } {
    if (file.language === 'dart') {
      if (file.path.includes('/bloc/')) {
        return { label: 'Flutter BLoC', class: 'bg-cyan-100 text-cyan-800 border-cyan-300' };
      }
      if (file.path.includes('/pages/') || file.path.includes('/widgets/')) {
        return { label: 'Flutter UI', class: 'bg-sky-100 text-sky-800 border-sky-300' };
      }
      if (file.path.includes('/usecases/')) {
        return { label: 'UseCase', class: 'bg-indigo-100 text-indigo-800 border-indigo-300' };
      }
      if (file.path.includes('/entities/')) {
        return { label: 'Dart Entity', class: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      }
      if (file.path.includes('/datasources/')) {
        return { label: 'Remote DataSource (Dio)', class: 'bg-amber-100 text-amber-800 border-amber-300' };
      }
      return { label: 'Flutter Dart', class: 'bg-blue-100 text-blue-800 border-blue-300' };
    }

    switch (file.layer) {
      case 'entity':
        return { label: 'Entidad JPA', class: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      case 'repository':
        return { label: 'Repositorio', class: 'bg-blue-100 text-blue-800 border-blue-300' };
      case 'dto':
        return { label: 'DTO', class: 'bg-purple-100 text-purple-800 border-purple-300' };
      case 'service':
        return { label: 'Servicio', class: 'bg-indigo-100 text-indigo-800 border-indigo-300' };
      case 'controller':
        return { label: 'REST Controller', class: 'bg-rose-100 text-rose-800 border-rose-300' };
      case 'migration':
        return { label: 'Flyway SQL', class: 'bg-amber-100 text-amber-800 border-amber-300' };
      case 'docker':
        return { label: 'Docker Compose', class: 'bg-sky-100 text-sky-800 border-sky-300' };
      case 'config':
        return { label: 'Configuración', class: 'bg-slate-100 text-slate-800 border-slate-300' };
      case 'docs':
        return { label: 'Documentación', class: 'bg-teal-100 text-teal-800 border-teal-300' };
      default:
        return { label: file.layer, class: 'bg-slate-100 text-slate-700 border-slate-300' };
    }
  }
}
