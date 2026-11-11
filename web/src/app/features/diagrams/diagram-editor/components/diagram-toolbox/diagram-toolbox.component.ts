import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroBars3,
  heroChevronLeft,
  heroChevronDown,
  heroChevronRight,
  heroCursorArrowRays,
  heroCheck,
  heroMagnifyingGlassPlus,
  heroMagnifyingGlassMinus,
  heroArrowsPointingOut,
  heroPlus,
} from '@ng-icons/heroicons/outline';
import {
  UmlRelationshipType,
  UmlLineStyle,
  UmlRelationTypeItem,
  UmlLineStyleItem,
  UML_RELATION_TYPES,
  UML_LINE_STYLES,
} from '../../../../../core/models/diagram.model';
import { TranslatePipe } from '../../../../../core/i18n';

@Component({
  selector: 'app-diagram-toolbox',
  standalone: true,
  imports: [CommonModule, NgIconComponent, TranslatePipe],
  providers: [
    provideIcons({
      heroBars3,
      heroChevronLeft,
      heroChevronDown,
      heroChevronRight,
      heroCursorArrowRays,
      heroCheck,
      heroMagnifyingGlassPlus,
      heroMagnifyingGlassMinus,
      heroArrowsPointingOut,
      heroPlus,
    }),
  ],
  templateUrl: './diagram-toolbox.component.html',
})
export class DiagramToolboxComponent {
  // Inputs
  readonly isOpen = input<boolean>(true);
  readonly selectedRelationType = input<UmlRelationshipType | null>(null);
  readonly defaultLineStyle = input<UmlLineStyle>('segment');
  readonly isReadOnly = input<boolean>(false);
  readonly relationTypes = input<UmlRelationTypeItem[]>(UML_RELATION_TYPES);
  readonly lineStyles = input<UmlLineStyleItem[]>(UML_LINE_STYLES);

  // Estados de acordeón internos
  readonly isRelationshipsOpen = signal<boolean>(true);
  readonly isLineStylesOpen = signal<boolean>(true);

  // Eventos de salida hacia DiagramEditorComponent
  readonly closeToolbox = output<void>();
  readonly setPointerMode = output<void>();
  readonly selectRelationType = output<UmlRelationshipType>();
  readonly setDefaultLineStyle = output<UmlLineStyle>();
  readonly zoomIn = output<void>();
  readonly zoomOut = output<void>();
  readonly resetView = output<void>();
  readonly fitView = output<void>();
  readonly addClass = output<void>();

  onSelectPointer(): void {
    this.setPointerMode.emit();
  }

  onSelectRelation(type: UmlRelationshipType): void {
    this.selectRelationType.emit(type);
  }

  onSetLineStyle(style: UmlLineStyle): void {
    this.setDefaultLineStyle.emit(style);
  }
}
