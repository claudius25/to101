import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SliderField } from './slider-field';

describe('SliderField', () => {
  let component: SliderField;
  let fixture: ComponentFixture<SliderField>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SliderField]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SliderField);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('label', 'Azimuth');
    fixture.componentRef.setInput('min', -180);
    fixture.componentRef.setInput('max', 180);
    fixture.componentRef.setInput('suffix', '°');
    fixture.componentRef.setInput('value', 0);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should step the value with the + and - buttons', () => {
    const [minus, plus] = fixture.nativeElement.querySelectorAll('.field__step');

    plus.click();
    fixture.detectChanges();
    expect(component.value()).toBe(1);

    minus.click();
    minus.click();
    fixture.detectChanges();
    expect(component.value()).toBe(-1);
  });

  it('should clamp to the configured bounds', () => {
    const [minus, plus] = fixture.nativeElement.querySelectorAll('.field__step');

    fixture.componentRef.setInput('value', 180);
    fixture.detectChanges();
    expect(plus.disabled).toBeTrue();
    plus.click();
    expect(component.value()).toBe(180);

    fixture.componentRef.setInput('value', -180);
    fixture.detectChanges();
    expect(minus.disabled).toBeTrue();
    minus.click();
    expect(component.value()).toBe(-180);
  });

  it('should round fractional steps to the configured precision', () => {
    fixture.componentRef.setInput('min', 1);
    fixture.componentRef.setInput('max', 2);
    fixture.componentRef.setInput('step', 0.01);
    fixture.componentRef.setInput('decimals', 2);
    fixture.componentRef.setInput('value', 1.1);
    fixture.detectChanges();

    const plus = fixture.nativeElement.querySelectorAll('.field__step')[1];
    plus.click();
    expect(component.value()).toBe(1.11);
  });
});
