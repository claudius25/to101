import { Routes } from '@angular/router';

export const routes: Routes = [
  // The game opens itself: the device waits face-down until it is tapped, so there is
  // no separate launcher screen in front of it.
  { path: '', redirectTo: 'game', pathMatch: 'full' },
  {
    path: 'game',
    loadComponent: () => import('./pages/game/game').then((m) => m.Game),
  },
  {
    path: 'character-stage',
    loadComponent: () => import('./pages/character-stage').then((m) => m.CharacterStage),
  },
  {
    path: 'slide-and-match',
    title: 'Slide & Match: Triples',
    data: { standaloneGame: true },
    loadComponent: () => import('./pages/triples/triples-page').then((m) => m.TriplesPage),
  },
  { path: '**', redirectTo: '' },
];
