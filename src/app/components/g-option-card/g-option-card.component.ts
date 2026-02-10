import { Component, Input } from '@angular/core';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'g-option-card',
  templateUrl: './g-option-card.component.html',
  styleUrls: ['./g-option-card.component.scss'],
})
export class GOptionCardComponent {
  environment = environment;
  @Input() title: string = 'product';
  @Input() icon: string = '';
  @Input() link?: string;
  @Input() today: number = 0;
  @Input() yesterday: number = 0;
}
