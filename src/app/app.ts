import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '[class.desktop-restricted]': '!isLocalhost' },
})
export class App {
  protected readonly title = signal('to100');
  protected readonly isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(
    window.location.hostname,
  );
}
