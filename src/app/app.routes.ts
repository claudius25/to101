import { Routes } from '@angular/router';

export const routes: Routes = [
  // The game opens itself: the device waits face-down until it is tapped, so there is
  // no separate launcher screen in front of it.
  { path: '', redirectTo: 'game', pathMatch: 'full' },
  {
    path: 'game',
    loadComponent: () => import('./pages/game/game').then((m) => m.Game),
  },
  { path: '**', redirectTo: '' },
];
