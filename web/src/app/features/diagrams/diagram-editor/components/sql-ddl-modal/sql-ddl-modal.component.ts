import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroCircleStack,
  heroXMark,
  heroClipboardDocument,
  heroCheck,
  heroArrowDownTray,
} from '@ng-icons/heroicons/outline';
import hljs from 'highlight.js/lib/core';
import sql from 'highlight.js/lib/languages/sql';
import { UmlClassNode, UmlConnection } from '../../../../../core/models/diagram.model';
import { SqlDdlGeneratorService } from '../../../../../core/services/sql-ddl-generator.service';
import { TranslatePipe } from '../../../../../core/i18n';

hljs.registerLanguage('sql', sql);

@Component({
  standalone: true,
  selector: 'app-sql-ddl-modal',
  imports: [CommonModule, FormsModule, NgIconComponent, TranslatePipe],
  providers: [
    provideIcons({
      heroCircleStack,
      heroXMark,
      heroClipboardDocument,
      heroCheck,
      heroArrowDownTray,
    }),
  ],
  templateUrl: './sql-ddl-modal.component.html',
})
export class SqlDdlModalComponent {
  private readonly ddlGenerator = inject(SqlDdlGeneratorService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly isOpen = input<boolean>(false);
  readonly diagramName = input<string>('Diagrama UML');
  readonly nodes = input<UmlClassNode[]>([]);
  readonly connections = input<UmlConnection[]>([]);

  readonly closeModal = output<void>();

  readonly includeDropStatements = signal<boolean>(false);
  readonly includeForeignKeyIndexes = signal<boolean>(true);
  readonly includeTransactionWrapper = signal<boolean>(false);
  readonly isCopied = signal<boolean>(false);

  readonly sqlCode = computed<string>(() =>
    this.ddlGenerator.generatePostgreSqlDdl(this.nodes(), this.connections(), {
      diagramName: this.diagramName(),
      includeDropStatements: this.includeDropStatements(),
      includeForeignKeyIndexes: this.includeForeignKeyIndexes(),
      includeTransactionWrapper: this.includeTransactionWrapper(),
    }),
  );

  readonly lineNumbers = computed<number[]>(() => {
    const count = this.sqlCode().split('\n').length;
    return Array.from({ length: count }, (_, i) => i + 1);
  });

  readonly highlightedSql = computed<SafeHtml>(() => {
    const raw = this.sqlCode();
    try {
      const result = hljs.highlight(raw, { language: 'sql', ignoreIllegals: true });
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

  copySql(): void {
    navigator.clipboard.writeText(this.sqlCode()).then(() => {
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 2000);
    });
  }

  downloadSql(): void {
    const rawName = this.diagramName() || 'schema';
    const cleanName = rawName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_');

    const blob = new Blob([this.sqlCode()], { type: 'application/sql;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanName || 'schema'}_postgresql.sql`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 500);
  }
}

