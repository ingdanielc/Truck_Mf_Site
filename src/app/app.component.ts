import { Component, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import pkg from 'package.json';

@Component({
  selector: 'app-site',
  templateUrl: './app.component.html',
  imports: [RouterOutlet],
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
