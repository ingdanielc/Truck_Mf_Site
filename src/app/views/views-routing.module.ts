import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../auth/auth-guard';
import { MembershipsComponent } from './memberships/memberships.component';
import { RoutinesComponent } from './routines/routines.component';
import { ProductsComponent } from './products/products.component';
import { SalesComponent } from './sales/sales.component';
import { SecurityComponent } from './security/security.component';

const routes: Routes = [
  {
    path: 'access-control',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./access-control/access-control.module').then(
        (m) => m.AccessControlModule
      ),
  },
  {
    path: 'memberships',
    component: MembershipsComponent,
    canActivate: [AuthGuard],
  },
  {
    path: 'partners',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./partners/partners.module').then((m) => m.PartnersModule),
  },
  {
    path: 'products',
    component: ProductsComponent,
    canActivate: [AuthGuard],
  },
  {
    path: 'routines',
    component: RoutinesComponent,
    canActivate: [AuthGuard],
  },
  {
    path: 'sales',
    component: SalesComponent,
    canActivate: [AuthGuard],
  },
  {
    path: 'security',
    component: SecurityComponent,
    canActivate: [AuthGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ViewsRoutingModule {}
