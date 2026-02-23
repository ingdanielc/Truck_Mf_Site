import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { User } from '../../views/security/interfaces/user.interface';

@Component({
  selector: 'g-user-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-user-card.component.html',
  styleUrls: ['./g-user-card.component.scss'],
})
export class GUserCardComponent {
  @Input() user!: User;
  @Output() edit = new EventEmitter<User>();
  @Output() changePassword = new EventEmitter<User>();

  isMenuOpen = false;

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.isMenuOpen = !this.isMenuOpen;
  }

  onEditClick(): void {
    this.isMenuOpen = false;
    this.edit.emit(this.user);
  }

  onChangePasswordClick(): void {
    this.isMenuOpen = false;
    this.changePassword.emit(this.user);
  }
}
