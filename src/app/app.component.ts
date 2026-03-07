import { Component, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import pkg from 'package.json';
import { GMenuComponent } from './components/g-menu/g-menu.component';
import { GSidebarComponent } from './components/g-sidebar/g-sidebar.component';
import { GFooterComponent } from './components/g-footer/g-footer.component';
import { ToastContainerComponent } from './components/toast-container/toast-container.component';
import { NotificationsService } from './services/notifications.service';
import { SecurityService } from './services/security/security.service';
import { Subscription, interval, filter } from 'rxjs';

@Component({
  selector: 'app-site',
  templateUrl: './app.component.html',
  imports: [
    RouterOutlet,
    GMenuComponent,
    GSidebarComponent,
    GFooterComponent,
    ToastContainerComponent,
  ],
  standalone: true,
})
export class AppComponent implements OnInit {
  title: string = 'CashTruck';
  version = pkg.version;
  isLogoMenuBar: boolean = true;
  tituloMenuBarText: string = 'CashTruck';
  moduleCode: number = 1;
  activeRoute: string = '';
  showFooter: boolean = false;

  private pollSubscription?: Subscription;
  private userSubscription?: Subscription;

  constructor(
    private readonly router: Router,
    private readonly notificationsService: NotificationsService,
    private readonly securityService: SecurityService,
  ) {}

  ngOnInit(): void {
    this.setupNotificationPolling();
  }

  ngOnDestroy(): void {
    this.pollSubscription?.unsubscribe();
    this.userSubscription?.unsubscribe();
  }

  private setupNotificationPolling(): void {
    // 1. Al Iniciar Sesión: Cargar cuando el usuario esté disponible
    this.userSubscription = this.securityService.userData$
      .pipe(filter((user) => !!user))
      .subscribe(() => {
        this.notificationsService.refreshNotifications();
      });

    // 2. Cada 5-10 minutos: Polling (5 minutos = 300,000 ms)
    this.pollSubscription = interval(300000)
      .pipe(filter(() => !!this.securityService.getUserData()))
      .subscribe(() => {
        this.notificationsService.refreshNotifications();
      });
  }
}
