import { Routes } from '@angular/router';
import { SecurityComponent } from './security/security.component';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () =>
      import('./home/home.component').then((m) => m.HomeComponent),
  },
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
  {
    path: 'drivers',
    loadComponent: () =>
      import('./drivers/drivers.component').then((m) => m.DriversComponent),
  },
  {
    path: 'trips',
    loadComponent: () =>
      import('./trips/trips.component').then((m) => m.TripsComponent),
  },
  {
    path: 'trips/:id',
    loadComponent: () =>
      import('./trips/trip-detail/trip-detail.component').then(
        (m) => m.TripDetailComponent,
      ),
  },
  {
    path: 'owners/:id',
    loadComponent: () =>
      import('./owners/owner-detail/owner-detail.component').then(
        (m) => m.OwnerDetailComponent,
      ),
  },
  {
    path: 'drivers/:id',
    loadComponent: () =>
      import('./drivers/driver-detail/driver-detail.component').then(
        (m) => m.DriverDetailComponent,
      ),
  },
];
