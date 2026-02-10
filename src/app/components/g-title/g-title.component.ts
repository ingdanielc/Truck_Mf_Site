import { Component, Input } from '@angular/core';

@Component({
  selector: 'g-title',
  templateUrl: './g-title.component.html',
  styleUrls: ['./g-title.component.scss'],
})
export class GTitleComponent {
  @Input() title: string = '';
  @Input() description: string = '';
}
