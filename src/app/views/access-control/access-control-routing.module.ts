import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from 'src/app/auth/auth-guard';
import { ListAccessControlComponent } from './list-access-control/list-access-control.component';
import { AccessControlComponent } from './access-control/access-control.component';

const routes: Routes = [
  {
    path: '',
    component: AccessControlComponent,
    canActivate: [AuthGuard],
  },
  {
    path: 'list-access-control',
    component: ListAccessControlComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AccessControlRoutingModule {}
