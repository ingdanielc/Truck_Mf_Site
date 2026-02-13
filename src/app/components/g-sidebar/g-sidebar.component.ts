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

  isUserMenuOpen: boolean = false;

  constructor(
    private readonly tokenService: TokenService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {}

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
