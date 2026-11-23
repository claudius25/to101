import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '[class.desktop-restricted]': '!isLocalhost',
    '[class.standalone-game]': 'standaloneGame()',
  },
})
export class App {
  private readonly router = inject(Router);
  protected readonly standaloneGame = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.routerState.snapshot.root.firstChild?.data['standaloneGame'] === true),
    ),
    { initialValue: false },
  );
  protected readonly title = signal('to100');
  protected readonly isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(
    window.location.hostname,
  );
}
