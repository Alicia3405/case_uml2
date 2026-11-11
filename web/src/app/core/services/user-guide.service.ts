import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class UserGuideService {
  readonly isOpen = signal<boolean>(false);
  readonly initialPrompt = signal<string | null>(null);

  openGuide(prompt?: string): void {
    if (prompt) {
      this.initialPrompt.set(prompt);
    }
    this.isOpen.set(true);
  }

  closeGuide(): void {
    this.isOpen.set(false);
  }

  toggleGuide(): void {
    this.isOpen.update((v) => !v);
  }
}
