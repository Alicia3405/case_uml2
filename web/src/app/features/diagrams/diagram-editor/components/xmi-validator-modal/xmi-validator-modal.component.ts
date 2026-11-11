import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroCodeBracket,
  heroXMark,
  heroCheckCircle,
  heroExclamationTriangle,
  heroXCircle,
  heroClipboardDocument,
  heroCheck,
  heroArrowDownTray,
} from '@ng-icons/heroicons/outline';
import hljs from 'highlight.js/lib/core';
import xml from 'highlight.js/lib/languages/xml';
import {
  UmlClassNode,
  UmlConnection,
  UmlLineStyle,
} from '../../../../../core/models/diagram.model';
import {
  XmiClientSerializer,
  XmiValidationReport,
} from '../../../../../core/services/xmi-client-serializer';
import { TranslatePipe } from '../../../../../core/i18n';

hljs.registerLanguage('xml', xml);

@Component({
  standalone: true,
  selector: 'app-xmi-validator-modal',
  imports: [CommonModule, NgIconComponent, TranslatePipe],
  providers: [
    provideIcons({
      heroCodeBracket,
      heroXMark,
      heroCheckCircle,
      heroExclamationTriangle,
      heroXCircle,
      heroClipboardDocument,
      heroCheck,
      heroArrowDownTray,
    }),
  ],
  templateUrl: './xmi-validator-modal.component.html',
})
export class XmiValidatorModalComponent {
  private readonly serializer = inject(XmiClientSerializer);
  private readonly sanitizer = inject(DomSanitizer);

  readonly isOpen = input<boolean>(false);
  readonly diagramName = input<string>('Diagrama_Principal');
  readonly defaultLineStyle = input<UmlLineStyle>('segment');
  readonly nodes = input<UmlClassNode[]>([]);
  readonly connections = input<UmlConnection[]>([]);

  readonly closeModal = output<void>();

  readonly isCopied = signal<boolean>(false);

  readonly xmiXml = computed<string>(() =>
    this.serializer.serialize(
      this.nodes(),
      this.connections(),
      this.diagramName(),
      this.defaultLineStyle(),
    ),
  );

  readonly report = computed<XmiValidationReport>(() =>
    this.serializer.validateXmi(this.xmiXml()),
  );

  readonly lineNumbers = computed<number[]>(() => {
    const count = this.xmiXml().split('\n').length;
    return Array.from({ length: count }, (_, i) => i + 1);
  });

  readonly highlightedXml = computed<SafeHtml>(() => {
    const raw = this.xmiXml();
    try {
      const result = hljs.highlight(raw, { language: 'xml', ignoreIllegals: true });
      return this.sanitizer.bypassSecurityTrustHtml(result.value);
    } catch {
      return this.sanitizer.bypassSecurityTrustHtml(
        raw
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;'),
      );
    }
  });

  copyXml(): void {
    navigator.clipboard.writeText(this.xmiXml()).then(() => {
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 2000);
    });
  }

  downloadXmi(): void {
    const rawName = this.diagramName() || 'diagrama';
    const cleanName = rawName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_');

    const blob = new Blob([this.xmiXml()], { type: 'application/vnd.sparx.xmi;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanName || 'diagrama'}_ea.xmi`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 500);
  }
}

