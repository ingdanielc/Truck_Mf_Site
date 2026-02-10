import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GMenuComponent } from './g-menu.component';
import { SidebarModule } from 'primeng/sidebar';
import { MenubarModule } from 'primeng/menubar';
import { BadgeModule } from 'primeng/badge';
import { AvatarModule } from 'primeng/avatar';
import { SharedModule } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { MenubarComponent } from './menubar/menubar.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { ButtonModule } from 'primeng/button';
import { OverlayPanelModule } from 'primeng/overlaypanel';

export * from './g-menu.component';
export * from './menubar/menubar.component';
export * from './sidebar/sidebar.component';

@NgModule({
  declarations: [GMenuComponent, MenubarComponent, SidebarComponent],
  imports: [
    CommonModule,
    SidebarModule,
    MenubarModule,
    BadgeModule,
    AvatarModule,
    MenuModule,
    ButtonModule,
    OverlayPanelModule,
  ],
  exports: [GMenuComponent, MenubarComponent, SidebarComponent, SharedModule],
})
export class GMenuModule {}
