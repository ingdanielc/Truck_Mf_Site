import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { User } from '../../views/security/interfaces/user.interface';

@Component({
  selector: 'g-card-user',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-card-user.component.html',
  styleUrls: ['./g-card-user.component.scss'],
})
export class GCardUserComponent {
  @Input() user!: User;
}
