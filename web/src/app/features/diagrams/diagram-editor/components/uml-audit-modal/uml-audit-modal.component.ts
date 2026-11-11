import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroShieldCheck,
  heroXMark,
  heroCheck,
  heroCheckCircle,
  heroExclamationTriangle,
  heroInformationCircle,
  heroWrenchScrewdriver,
  heroSparkles,
} from '@ng-icons/heroicons/outline';
import { UmlClassNode, UmlConnection } from '../../../../../core/models/diagram.model';
import {
  AuditCategory,
  AuditRecommendation,
  AuditReport,
  UmlAuditService,
} from '../../../../../core/services/uml-audit.service';
import { TranslatePipe } from '../../../../../core/i18n';

@Component({
  standalone: true,
  selector: 'app-uml-audit-modal',
  imports: [CommonModule, NgIconComponent, TranslatePipe],
  providers: [
    provideIcons({
      heroShieldCheck,
      heroXMark,
      heroCheck,
      heroCheckCircle,
      heroExclamationTriangle,
      heroInformationCircle,
      heroWrenchScrewdriver,
      heroSparkles,
    }),
  ],
  templateUrl: './uml-audit-modal.component.html',
})
export class UmlAuditModalComponent {
  private readonly auditService = inject(UmlAuditService);

  readonly isOpen = input<boolean>(false);
  readonly nodes = input<UmlClassNode[]>([]);
  readonly connections = input<UmlConnection[]>([]);
  readonly isReadOnly = input<boolean>(false);

  readonly closeModal = output<void>();
  readonly applyFixes = output<{
    nodes: UmlClassNode[];
    connections: UmlConnection[];
    appliedCount: number;
  }>();

  readonly activeCategoryFilter = signal<'ALL' | AuditCategory>('ALL');
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly lastAppliedCount = signal<number | null>(null);

  readonly report = computed<AuditReport>(() =>
    this.auditService.auditDiagram(this.nodes(), this.connections()),
  );

  readonly filteredRecommendations = computed<AuditRecommendation[]>(() => {
    const filter = this.activeCategoryFilter();
    const list = this.report().recommendations;
    if (filter === 'ALL') return list;
    return list.filter((r) => r.category === filter);
  });

  readonly selectedCount = computed<number>(() => {
    const validIds = new Set(this.report().recommendations.map((r) => r.id));
    let count = 0;
    this.selectedIds().forEach((id) => {
      if (validIds.has(id)) count++;
    });
    return count;
  });

  constructor() {
    effect(() => {
      const open = this.isOpen();
      const recs = this.report().recommendations;
      if (open) {
        this.selectedIds.set(new Set(recs.map((r) => r.id)));
      } else {
        this.lastAppliedCount.set(null);
        this.activeCategoryFilter.set('ALL');
      }
    });
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleSelection(id: string): void {
    if (this.isReadOnly()) return;
    this.selectedIds.update((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  selectAll(): void {
    if (this.isReadOnly()) return;
    const ids = this.filteredRecommendations().map((r) => r.id);
    this.selectedIds.update((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }

  deselectAll(): void {
    if (this.isReadOnly()) return;
    const ids = new Set(this.filteredRecommendations().map((r) => r.id));
    this.selectedIds.update((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  onApplySelected(): void {
    if (this.isReadOnly()) return;
    const sel = this.selectedIds();
    if (sel.size === 0) return;

    const result = this.auditService.applyFixes(this.nodes(), this.connections(), sel);
    if (result.appliedCount > 0) {
      this.lastAppliedCount.set(result.appliedCount);
      this.applyFixes.emit(result);
    }
  }

  onApplyAll(): void {
    if (this.isReadOnly()) return;
    const allIds = new Set(this.report().recommendations.map((r) => r.id));
    if (allIds.size === 0) return;

    const result = this.auditService.applyFixes(this.nodes(), this.connections(), allIds);
    if (result.appliedCount > 0) {
      this.lastAppliedCount.set(result.appliedCount);
      this.applyFixes.emit(result);
    }
  }

  getScoreBadgeClass(score: number): string {
    if (score >= 85) return 'bg-emerald-600 text-white border-emerald-400';
    if (score >= 60) return 'bg-amber-600 text-white border-amber-400';
    return 'bg-rose-600 text-white border-rose-400';
  }

  getCategoryCount(category: AuditCategory): number {
    return this.report().recommendations.filter((r) => r.category === category).length;
  }
}

