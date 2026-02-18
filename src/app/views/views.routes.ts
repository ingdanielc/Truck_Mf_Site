import { Routes } from '@angular/router';
import { SecurityComponent } from './security/security.component';

export const routes: Routes = [
  { path: 'security', component: SecurityComponent },
  {
    path: 'owners',
    loadComponent: () =>
      import('./owners/owners.component').then((m) => m.OwnersComponent),
  },
  {
    path: 'vehicles',
    loadComponent: () =>
      import('./vehicles/vehicles.component').then((m) => m.VehiclesComponent),
  },
];
