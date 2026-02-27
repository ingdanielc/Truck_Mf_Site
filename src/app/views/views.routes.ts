import { Routes } from '@angular/router';
import { SecurityComponent } from './security/security.component';
import { RoleGuard } from '../auth/role.guard';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () =>
      import('./home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'security',
    component: SecurityComponent,
    canActivate: [RoleGuard],
    data: { allowedRoles: ['ADMINISTRADOR'] },
  },
  {
    path: 'owners',
    canActivate: [RoleGuard],
    data: { allowedRoles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./owners/owners.component').then((m) => m.OwnersComponent),
  },
  {
    path: 'vehicles',
    loadComponent: () =>
      import('./vehicles/vehicles.component').then((m) => m.VehiclesComponent),
  },
  {
    path: 'expenses',
    loadComponent: () =>
      import('./expenses/expenses.component').then((m) => m.ExpensesComponent),
  },
  {
    path: 'drivers',
    canActivate: [RoleGuard],
    data: { allowedRoles: ['ADMINISTRADOR', 'PROPIETARIO'] },
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
    canActivate: [RoleGuard],
    data: { allowedRoles: ['ADMINISTRADOR', 'PROPIETARIO'] },
    loadComponent: () =>
      import('./owners/owner-detail/owner-detail.component').then(
        (m) => m.OwnerDetailComponent,
      ),
  },
  {
    path: 'drivers/:id',
    canActivate: [RoleGuard],
    data: { allowedRoles: ['ADMINISTRADOR', 'PROPIETARIO', 'CONDUCTOR'] },
    loadComponent: () =>
      import('./drivers/driver-detail/driver-detail.component').then(
        (m) => m.DriverDetailComponent,
      ),
  },
  {
    path: 'admin-detail/:id',
    canActivate: [RoleGuard],
    data: { allowedRoles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./security/admin-detail/admin-detail.component').then(
        (m) => m.AdminDetailComponent,
      ),
  },
];
