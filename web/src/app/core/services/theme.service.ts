import { Injectable, signal, computed, effect } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly STORAGE_KEY = 'uml_studio_theme';

  readonly currentTheme = signal<ThemeMode>(this.getInitialTheme());
  readonly isDarkMode = computed(() => this.currentTheme() === 'dark');

  constructor() {
    // Escucha cambios reactivos y sincroniza la clase 'dark' en el elemento <html>
    effect(() => {
      const theme = this.currentTheme();
      this.applyTheme(theme);
    });
  }

  toggleTheme(): void {
    const nextTheme: ThemeMode = this.currentTheme() === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
  }

  setTheme(theme: ThemeMode): void {
    this.currentTheme.set(theme);
    try {
      localStorage.setItem(this.STORAGE_KEY, theme);
    } catch {
      // Ignorar en caso de restricciones de storage
    }
  }

  private applyTheme(theme: ThemeMode): void {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
  }

  private getInitialTheme(): ThemeMode {
    if (typeof window === 'undefined') return 'light';

    try {
      const saved = localStorage.getItem(this.STORAGE_KEY) as ThemeMode | null;
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }

      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch {
      // En caso de fallo en SSR o localStorage deshabilitado
    }

    return 'light';
  }
}
