import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'src/app/models/model-menu-item';
import { MenuService } from 'src/app/services/utils/menu.service';

import { TokenService } from 'src/app/services/utils/token.service';

@Component({
  selector: 'sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent implements OnInit {
  isExpanded: boolean = false;
  activeRoute: string = '';

  menuItems: MenuItem[] = [];
  menuItemsAccount: MenuItem[] = [];

  @Input() version: string = '';
  @Input() moduleCode: number = 1;
  @Output() showSidebar: EventEmitter<any> = new EventEmitter<any>();

  constructor(
    private readonly menuService: MenuService,
    private readonly router: Router,
    private readonly tokenService: TokenService
  ) {}

  ngOnInit() {
    if (this.moduleCode == 1) {
      this.menuItems = this.menuService.menuItems;
      this.menuItemsAccount = this.menuService.menuItemsAccount;
    }

    this.menuService.getActiveRoute().subscribe((route) => {
      this.activeRoute = route;
    });
  }

  toggleSidebar() {
    this.isExpanded = !this.isExpanded;
  }

  isActive(route: string): boolean {
    return (
      this.activeRoute.indexOf(route) > 0 || this.activeRoute.includes(route)
    );
  }

  logout(label: string) {
    if (label == 'Salir') {
      this.tokenService.clearToken();
      this.router.navigate(['/auth']);
    }
  }

  navigateAndClose(route: string, label: string) {
    this.logout(label);
    this.router.navigate([route]).then(() => {
      this.showSidebar.emit(false);
    });
  }
}
