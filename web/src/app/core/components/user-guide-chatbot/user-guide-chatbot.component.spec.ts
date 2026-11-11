import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { describe, it, expect, beforeEach } from 'vitest';
import { UserGuideChatbotComponent } from './user-guide-chatbot.component';

describe('UserGuideChatbotComponent', () => {
  let events$: Subject<any>;
  let currentUrl: string;

  beforeEach(async () => {
    events$ = new Subject();
    currentUrl = '/projects';

    await TestBed.configureTestingModule({
      imports: [UserGuideChatbotComponent],
      providers: [
        {
          provide: Router,
          useValue: {
            get url() {
              return currentUrl;
            },
            events: events$.asObservable(),
          },
        },
      ],
    }).compileComponents();
  });

  it('debe ocultar el botón flotante en /diagram pero mostrarlo en /projects', () => {
    const fixture = TestBed.createComponent(UserGuideChatbotComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.isDiagramRoute()).toBe(false);
    expect(fixture.nativeElement.querySelector('button[title]')).not.toBeNull();

    currentUrl = '/diagram';
    events$.next(new NavigationEnd(1, '/diagram', '/diagram'));
    fixture.detectChanges();
    expect(fixture.componentInstance.isDiagramRoute()).toBe(true);
    expect(fixture.nativeElement.querySelector('button[title]')).toBeNull();

    currentUrl = '/diagrams/abc-123';
    events$.next(new NavigationEnd(2, '/diagrams/abc-123', '/diagrams/abc-123'));
    fixture.detectChanges();
    expect(fixture.componentInstance.isDiagramRoute()).toBe(true);
    expect(fixture.nativeElement.querySelector('button[title]')).toBeNull();

    currentUrl = '/projects';
    events$.next(new NavigationEnd(3, '/projects', '/projects'));
    fixture.detectChanges();
    expect(fixture.componentInstance.isDiagramRoute()).toBe(false);
    expect(fixture.nativeElement.querySelector('button[title]')).not.toBeNull();
  });

  it('debe ocultar el botón flotante en /diagram?projectId=123 y abrir el modal al invocar guideService.openGuide()', () => {
    currentUrl = '/diagram?projectId=123';
    const fixture = TestBed.createComponent(UserGuideChatbotComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.isDiagramRoute()).toBe(true);
    expect(fixture.nativeElement.querySelector('button[title]')).toBeNull();

    fixture.componentInstance.guideService.openGuide();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('UML Studio');

    fixture.componentInstance.guideService.closeGuide();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[title]')).toBeNull();
  });
});
