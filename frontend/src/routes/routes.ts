import { Routes } from '@angular/router';
import { Type } from '@angular/core';
import { ExamplePageComponent } from '../components/ExamplePageComponent';

/**
 * Angular-Routen für das Example-Modul.
 * Werden von der Host-Anwendung direkt in den Router integriert.
 */
export const routes: Routes = [
  {
    path: 'example',
    component: ExamplePageComponent,
    data: {
      title: 'Beispiel-Modul',
    },
  },
  {
    path: 'example/details',
    loadComponent: () => import('../components/ExamplePageComponent').then(m => m.ExamplePageComponent as Type<unknown>),
    data: {
      title: 'Beispiel-Details',
    },
  },
];
