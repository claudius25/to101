import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

const SKIP_INTRO_KEY = 'triples.skipIntro';
const SKIP_INTRO_THRESHOLD = 5;
const RUN_KEY = 'triples.activeRun.v1';

@Component({
  selector: 'app-triples-page',
  host: { '(window:message)': 'handleGameMessage($event)' },
  template: `
    <iframe
      #gameFrame
      [src]="gameUrl"
      (load)="restoreGame()"
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

  protected restoreGame(): void {
    let snapshot: string | null = null;
    try {
      snapshot = sessionStorage.getItem(RUN_KEY);
    } catch {
      // Storage may be disabled for this tab.
    }
    this.gameFrame()?.nativeElement.contentWindow?.postMessage(
      { type: 'triples:restore-run', snapshot }, '*',
    );
  }

  protected handleGameMessage(event: MessageEvent): void {
    if (event.source !== this.gameFrame()?.nativeElement.contentWindow) return;
    try {
      if (event.data === 'triples:skip-intro') {
        const count = Math.min(this.introSkipCount() + 1, SKIP_INTRO_THRESHOLD);
        localStorage.setItem(SKIP_INTRO_KEY, String(count));
      } else if (event.data?.type === 'triples:save-run' &&
                 typeof event.data.snapshot === 'string' && event.data.snapshot.length < 16_384) {
        sessionStorage.setItem(RUN_KEY, event.data.snapshot);
      }
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
