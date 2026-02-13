import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TokenService } from '../../services/token.service';
import { Router } from '@angular/router';

@Component({
  selector: 'g-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-sidebar.component.html',
  styleUrls: ['./g-sidebar.component.scss'],
})
export class GSidebarComponent implements OnInit {
  @Input() userName: string = 'Daniel Solis';
  @Input() userRole: string = 'Administrador';
  @Input() notificationsCount: number = 5;
  @Output() toggleMenu = new EventEmitter<void>();
  currentTheme: 'light' | 'dark' = 'dark';
  isUserMenuOpen: boolean = false;

  constructor(
    private readonly tokenService: TokenService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
    if (savedTheme) {
      this.currentTheme = savedTheme;
    } else {
      const prefersDark = globalThis.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;
      this.currentTheme = prefersDark ? 'dark' : 'light';
    }
    this.applyTheme();
  }

  toggleTheme() {
    this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', this.currentTheme);
    this.applyTheme();
  }

  private applyTheme() {
    document.documentElement.setAttribute('data-bs-theme', this.currentTheme);
  }

  toggleUserMenu() {
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  goToProfile() {
    console.log('Navegando al perfil...');
    this.isUserMenuOpen = false;
  }

  logout() {
    this.tokenService.clearToken();
    this.router.navigateByUrl('/auth');
    this.isUserMenuOpen = false;
  }
}
