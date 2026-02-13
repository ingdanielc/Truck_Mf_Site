import { Component, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import pkg from 'package.json';
import { GMenuComponent } from './components/g-menu/g-menu.component';
import { GSidebarComponent } from './components/g-sidebar/g-sidebar.component';
import { ToastContainerComponent } from './components/toast-container/toast-container.component';

@Component({
  selector: 'app-site',
  templateUrl: './app.component.html',
  imports: [
    RouterOutlet,
    GMenuComponent,
    GSidebarComponent,
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

  constructor(private readonly router: Router) {}

  ngOnInit(): void {}
}
