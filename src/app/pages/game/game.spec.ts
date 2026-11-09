import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Game } from './game';

describe('Game', () => {
  let component: Game;
  let fixture: ComponentFixture<Game>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Game],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Game);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render a canvas and the dev panel controls', () => {
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('canvas.game__canvas')).toBeTruthy();
    expect(host.querySelectorAll('.dev input[type="range"]').length).toBeGreaterThanOrEqual(4);
  });
});
