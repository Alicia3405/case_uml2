import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../services/translation.service';
import { SupportedLanguage } from '../../models/language.type';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (theme() === 'dark') {
      <div class="inline-flex items-center rounded border border-slate-600/80 bg-slate-900/90 p-0.5 text-[11px] font-mono shadow-inner select-none">
        <button
          type="button"
          (click)="setLang('es')"
          [attr.aria-pressed]="currentLang() === 'es'"
          title="Cambiar idioma a Español"
          [class.bg-slate-700]="currentLang() === 'es'"
          [class.text-white]="currentLang() === 'es'"
          [class.shadow-xs]="currentLang() === 'es'"
          [class.text-slate-400]="currentLang() !== 'es'"
          class="px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer hover:text-white font-semibold">
          <span>🇪🇸</span>
          <span>ES</span>
        </button>
        <button
          type="button"
          (click)="setLang('en')"
          [attr.aria-pressed]="currentLang() === 'en'"
          title="Switch language to English"
          [class.bg-slate-700]="currentLang() === 'en'"
          [class.text-white]="currentLang() === 'en'"
          [class.shadow-xs]="currentLang() === 'en'"
          [class.text-slate-400]="currentLang() !== 'en'"
          class="px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer hover:text-white font-semibold">
          <span>🇺🇸</span>
          <span>EN</span>
        </button>
      </div>
    } @else {
      <div class="inline-flex items-center rounded border border-[#6B5A52]/40 dark:border-slate-700 bg-white/80 dark:bg-slate-800/90 p-0.5 text-[11px] font-mono shadow-xs select-none">
        <button
          type="button"
          (click)="setLang('es')"
          [attr.aria-pressed]="currentLang() === 'es'"
          title="Cambiar idioma a Español"
          [class.bg-[#6B5A52]]="currentLang() === 'es'"
          [class.dark:bg-slate-700]="currentLang() === 'es'"
          [class.text-white]="currentLang() === 'es'"
          [class.shadow-xs]="currentLang() === 'es'"
          [class.text-[#6B5A52]]="currentLang() !== 'es'"
          [class.dark:text-slate-300]="currentLang() !== 'es'"
          class="px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer hover:bg-[#6B5A52]/10 dark:hover:bg-slate-700/50 font-semibold">
          <span>🇪🇸</span>
          <span>ES</span>
        </button>
        <button
          type="button"
          (click)="setLang('en')"
          [attr.aria-pressed]="currentLang() === 'en'"
          title="Switch language to English"
          [class.bg-[#6B5A52]]="currentLang() === 'en'"
          [class.dark:bg-slate-700]="currentLang() === 'en'"
          [class.text-white]="currentLang() === 'en'"
          [class.shadow-xs]="currentLang() === 'en'"
          [class.text-[#6B5A52]]="currentLang() !== 'en'"
          [class.dark:text-slate-300]="currentLang() !== 'en'"
          class="px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer hover:bg-[#6B5A52]/10 dark:hover:bg-slate-700/50 font-semibold">
          <span>🇺🇸</span>
          <span>EN</span>
        </button>
      </div>
    }
  `,
})
export class LanguageSelectorComponent {
  private readonly translationService = inject(TranslationService);

  readonly theme = input<'dark' | 'light'>('light');
  readonly currentLang = this.translationService.currentLang;

  setLang(lang: SupportedLanguage): void {
    this.translationService.setLanguage(lang);
  }
}
