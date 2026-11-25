import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

const SKIP_INTRO_KEY = 'triples.skipIntro';
const SKIP_INTRO_THRESHOLD = 5;

@Component({
  selector: 'app-triples-page',
  host: { '(window:message)': 'rememberIntroSkip($event)' },
  template: `
    <iframe
      #gameFrame
      [src]="gameUrl"
      title="Slide &amp; Match: Triples"
      sandbox="allow-scripts"
    ></iframe>
  `,
  styles: `
    :host,
    iframe {
      display: block;
      width: 100%;
      height: 100%;
    }

    iframe {
      border: 0;
    }
  `,
})
export class TriplesPage {
  private readonly gameFrame = viewChild<ElementRef<HTMLIFrameElement>>('gameFrame');
  protected readonly gameUrl = inject(DomSanitizer).bypassSecurityTrustResourceUrl(
    this.introSkipCount() >= SKIP_INTRO_THRESHOLD
      ? 'mini-games/triples/index.html?skipIntro=1'
      : 'mini-games/triples/index.html',
  );

  protected rememberIntroSkip(event: MessageEvent): void {
    if (event.source !== this.gameFrame()?.nativeElement.contentWindow ||
        event.data !== 'triples:skip-intro') return;

    try {
      const count = Math.min(this.introSkipCount() + 1, SKIP_INTRO_THRESHOLD);
      localStorage.setItem(SKIP_INTRO_KEY, String(count));
    } catch {
      // The game still opens when browser storage is unavailable.
    }
  }

  private introSkipCount(): number {
    try {
      return Number(localStorage.getItem(SKIP_INTRO_KEY)) || 0;
    } catch {
      return 0;
    }
  }
}
