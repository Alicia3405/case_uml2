import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { heroSun, heroMoon } from '@ng-icons/heroicons/outline';
import { ThemeService, ThemeMode } from '../../services/theme.service';
import { TranslatePipe } from '../../i18n';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule, NgIconComponent, TranslatePipe],
  viewProviders: [provideIcons({ heroSun, heroMoon })],
  template: `
    @if (variant() === 'dark') {
      <!-- Variante para barras oscuras (ej. Topbar) -->
      <div class="inline-flex items-center rounded border border-slate-600/80 bg-slate-900/90 p-0.5 text-[11px] font-mono shadow-inner select-none">
        <button
          type="button"
          (click)="setTheme('light')"
          [attr.aria-pressed]="!isDarkMode()"
          [title]="'theme.light' | translate"
          [class.bg-slate-700]="!isDarkMode()"
          [class.text-amber-300]="!isDarkMode()"
          [class.shadow-xs]="!isDarkMode()"
          [class.text-slate-400]="isDarkMode()"
          class="px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer hover:text-white font-semibold">
          <ng-icon name="heroSun" class="text-xs"></ng-icon>
        </button>
        <button
          type="button"
          (click)="setTheme('dark')"
          [attr.aria-pressed]="isDarkMode()"
          [title]="'theme.dark' | translate"
          [class.bg-slate-700]="isDarkMode()"
          [class.text-indigo-300]="isDarkMode()"
          [class.shadow-xs]="isDarkMode()"
          [class.text-slate-400]="!isDarkMode()"
          class="px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer hover:text-white font-semibold">
          <ng-icon name="heroMoon" class="text-xs"></ng-icon>
        </button>
      </div>
    } @else {
      <!-- Variante que se adapta dinámicamente según light / dark en páginas y modales -->
      <div class="inline-flex items-center rounded border border-[#6B5A52]/40 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 p-0.5 text-[11px] font-mono shadow-xs select-none">
        <button
          type="button"
          (click)="setTheme('light')"
          [attr.aria-pressed]="!isDarkMode()"
          [title]="'theme.light' | translate"
          [class.bg-[#6B5A52]]="!isDarkMode()"
          [class.text-white]="!isDarkMode()"
          [class.shadow-xs]="!isDarkMode()"
          [class.text-[#6B5A52]]="isDarkMode()"
          [class.dark:text-slate-400]="isDarkMode()"
          class="px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer hover:bg-[#6B5A52]/10 dark:hover:bg-slate-700 font-semibold">
          <ng-icon name="heroSun" class="text-xs"></ng-icon>
        </button>
        <button
          type="button"
          (click)="setTheme('dark')"
          [attr.aria-pressed]="isDarkMode()"
          [title]="'theme.dark' | translate"
          [class.bg-slate-900]="isDarkMode()"
          [class.dark:bg-slate-700]="isDarkMode()"
          [class.text-indigo-300]="isDarkMode()"
          [class.shadow-xs]="isDarkMode()"
          [class.text-[#6B5A52]]="!isDarkMode()"
          class="px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer hover:bg-[#6B5A52]/10 dark:hover:bg-slate-700 font-semibold">
          <ng-icon name="heroMoon" class="text-xs"></ng-icon>
        </button>
      </div>
    }
  `,
})
export class ThemeToggleComponent {
  readonly themeService = inject(ThemeService);

  readonly variant = input<'dark' | 'light' | 'auto'>('auto');
  readonly isDarkMode = this.themeService.isDarkMode;

  setTheme(theme: ThemeMode): void {
    this.themeService.setTheme(theme);
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}
