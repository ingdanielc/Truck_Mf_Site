import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { EmptyRouteComponent } from './empty-route/empty-route.component';
import { APP_BASE_HREF } from '@angular/common';
import { AuthGuard } from './auth/auth-guard';

const routes: Routes = [
  {
    path: 'site',
    loadChildren: () =>
      import('./views/views.module').then((m) => m.ViewsModule),
    canActivate: [AuthGuard],
  },
  { path: '**', component: EmptyRouteComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: false })],
  exports: [RouterModule],
  providers: [{ provide: APP_BASE_HREF, useValue: '/truck' }],
})
export class AppRoutingModule {}
