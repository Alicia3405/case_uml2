import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UserGuideChatbotComponent } from './core/components/user-guide-chatbot/user-guide-chatbot.component';

@Component({
  imports: [RouterOutlet, UserGuideChatbotComponent],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('frontend');
}
