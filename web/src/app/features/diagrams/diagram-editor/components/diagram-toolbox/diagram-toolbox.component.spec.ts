import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { DiagramToolboxComponent } from './diagram-toolbox.component';

describe('DiagramToolboxComponent', () => {
  let component: DiagramToolboxComponent;
  let injector: EnvironmentInjector;

  beforeEach(() => {
    injector = createEnvironmentInjector([], null as any);
    runInInjectionContext(injector, () => {
      component = new DiagramToolboxComponent();
    });
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
    expect(component.isRelationshipsOpen()).toBe(true);
    expect(component.isLineStylesOpen()).toBe(true);
  });

  it('should emit setPointerMode when onSelectPointer is called', () => {
    let emitted = false;
    component.setPointerMode.subscribe(() => {
      emitted = true;
    });

    component.onSelectPointer();
    expect(emitted).toBe(true);
  });

  it('should emit selectRelationType when onSelectRelation is called', () => {
    let selected: string | null = null;
    component.selectRelationType.subscribe((val) => {
      selected = val;
    });

    component.onSelectRelation('generalization');
    expect(selected).toBe('generalization');
  });

  it('should emit setDefaultLineStyle when onSetLineStyle is called', () => {
    let style: string | null = null;
    component.setDefaultLineStyle.subscribe((val) => {
      style = val;
    });

    component.onSetLineStyle('bezier');
    expect(style).toBe('bezier');
  });

  it('should emit closeToolbox when closeToolbox is triggered', () => {
    let closed = false;
    component.closeToolbox.subscribe(() => {
      closed = true;
    });

    component.closeToolbox.emit();
    expect(closed).toBe(true);
  });
});
