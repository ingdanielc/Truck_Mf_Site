import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import pkg from 'package.json';

@Component({
  selector: 'app-site',
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  title: string = 'Strem Force';
  version = pkg.version;
  isLogoMenuBar: boolean = true;
  tituloMenuBarText: string = 'Xtrem Force';
  moduleCode: number = 1;
  activeRoute: string = '';
  showFooter: boolean = false;

  constructor(private readonly router: Router) {}

  ngOnInit(): void {}
}
