import { Routes } from '@angular/router';
import { EmptyRouteComponent } from './empty-route/empty-route.component';
import { AuthGuard } from './auth/auth-guard';

export const routes: Routes = [
  {
    path: 'site',
    loadChildren: () => import('./views/views.routes').then((m) => m.routes),
    canActivate: [AuthGuard],
  },
  { path: '**', component: EmptyRouteComponent },
];
