import { Component } from '@angular/core';

@Component({
  selector: 'app-triples-page',
  template: `
    <iframe
      src="mini-games/triples/index.html"
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
export class TriplesPage {}
