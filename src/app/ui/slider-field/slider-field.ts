import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

/** Range input with large step buttons, so it stays usable with a thumb on a phone. */
@Component({
  selector: 'app-slider-field',
  templateUrl: './slider-field.html',
  styleUrl: './slider-field.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SliderField {
  readonly label = input.required<string>();
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  readonly decimals = input(0);
  readonly suffix = input('');
  readonly value = model.required<number>();

  protected readonly display = computed(
    () => `${this.value().toFixed(this.decimals())}${this.suffix()}`,
  );

  protected readonly atMin = computed(() => this.value() <= this.min());
  protected readonly atMax = computed(() => this.value() >= this.max());

  protected onInput(event: Event): void {
    this.commit(Number((event.target as HTMLInputElement).value));
  }

  protected nudge(direction: number): void {
    this.commit(this.value() + direction * this.step());
  }

  private commit(next: number): void {
    const clamped = Math.min(this.max(), Math.max(this.min(), next));
    // Stepping by fractional amounts otherwise accumulates float drift.
    this.value.set(Number(clamped.toFixed(this.decimals())));
  }
}
