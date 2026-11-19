import { Routes } from '@angular/router';
import { ExamplePageComponent } from '../components/ExamplePageComponent';

/**
 * Angular-Routen für das Example-Modul.
 * Werden von der Host-Anwendung direkt in den Router integriert.
 */
export const routes: Routes = [
  {
    path: '',
    component: ExamplePageComponent,
    data: {
      title: 'Beispiel-Modul',
    },
  },
  {
    path: 'test',
    component: ExamplePageComponent,
    data: {
      title: 'Beispiel-Modul',
    },
  },
];
