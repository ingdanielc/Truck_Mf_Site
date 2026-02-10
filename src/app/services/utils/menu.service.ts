import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { MenuItem } from '../../models/model-menu-item';

@Injectable({
  providedIn: 'root',
})
export class MenuService {
  private readonly activeRoute = new BehaviorSubject<string>('');

  menuItems: MenuItem[] = [
    new MenuItem('/site/partners', 'fa-solid fa-user-group', 'Socios'),
    new MenuItem(
      '/site/memberships',
      'fa-solid fa-clipboard-check',
      'Membresías'
    ),
    new MenuItem(
      '/site/access-control',
      'fa-solid fa-unlock-keyhole',
      'Control de Acceso'
    ),
    new MenuItem('/site/routines', 'fa-solid fa-child-reaching', 'Rutinas'),
    new MenuItem('/site/products', 'fa-brands fa-product-hunt', 'Productos'),
    new MenuItem('/site/sales', 'fa-solid fa-sack-dollar', 'Ventas'),
    new MenuItem(
      '/site/notifications',
      'fa-solid fa-comments',
      'Notificaciones'
    ),
  ];

  menuItemsAccount: MenuItem[] = [
    new MenuItem('/site/security', 'fa-solid fa-id-card-clip', 'Seguridad'),
    new MenuItem('/auth', 'fa-solid fa-right-from-bracket', 'Salir'),
  ];

  constructor(private readonly router: Router) {
    this.router.events
      .pipe(filter((event: any) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        const modifiedUrl = event.urlAfterRedirects.replace('/gym', '');
        this.activeRoute.next(modifiedUrl);
      });
  }

  getActiveRoute() {
    return this.activeRoute.asObservable();
  }
}
