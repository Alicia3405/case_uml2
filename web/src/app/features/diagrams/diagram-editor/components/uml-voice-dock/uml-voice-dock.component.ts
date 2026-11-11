import { Component, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroMicrophone,
  heroStop,
  heroSpeakerWave,
  heroSpeakerXMark,
  heroChevronUp,
  heroChevronDown,
  heroCommandLine,
  heroPaperAirplane,
  heroLockClosed,
} from '@ng-icons/heroicons/outline';
import { VoiceCommandService } from '../../../../../core/services/voice-command.service';
import { TranslatePipe } from '../../../../../core/i18n';

@Component({
  selector: 'app-uml-voice-dock',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIconComponent, TranslatePipe],
  providers: [
    provideIcons({
      heroMicrophone,
      heroStop,
      heroSpeakerWave,
      heroSpeakerXMark,
      heroChevronUp,
      heroChevronDown,
      heroCommandLine,
      heroPaperAirplane,
      heroLockClosed,
    }),
  ],
  templateUrl: './uml-voice-dock.component.html',
})
export class UmlVoiceDockComponent {
  readonly voiceService = inject(VoiceCommandService);

  readonly isReadOnly = input<boolean>(false);
  readonly isExpanded = signal<boolean>(false);
  readonly manualCommand = signal<string>('');

  readonly quickChips: { label: string; command: string; needsWrite?: boolean }[] = [
    { label: '+ Clase Cliente', command: 'crea clase Cliente con id UUID pk, nombre String', needsWrite: true },
    { label: '+ Atributo precio', command: 'agrega atributo precio decimal no nulo a Producto', needsWrite: true },
    { label: '+ Método calcular', command: 'agrega metodo calcularTotal que retorna BigDecimal a Factura', needsWrite: true },
    { label: 'Herencia', command: 'Estudiante hereda de Persona', needsWrite: true },
    { label: 'Composición 1..*', command: 'crea composicion entre Pedido y DetallePedido uno a muchos', needsWrite: true },
    { label: 'Auditar 3FN', command: 'auditar normalizacion', needsWrite: false },
    { label: 'Ver SQL', command: 'genera sql', needsWrite: false },
    { label: 'Deshacer', command: 'deshacer', needsWrite: true },
  ];

  toggleExpanded(): void {
    this.isExpanded.update((v) => !v);
  }

  onToggleMic(): void {
    if (this.isReadOnly()) return;
    this.voiceService.toggleListening();
    if (!this.isExpanded() && this.voiceService.isListening()) {
      this.isExpanded.set(true);
    }
  }

  onSubmitManualCommand(): void {
    const cmd = this.manualCommand().trim();
    if (!cmd) return;
    this.voiceService.processTranscript(cmd, 1);
    this.manualCommand.set('');
  }

  onQuickChipClick(chip: { label: string; command: string; needsWrite?: boolean }): void {
    if (chip.needsWrite && this.isReadOnly()) return;
    this.voiceService.processTranscript(chip.command, 1);
  }
}

