import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'g-sidebar',
  templateUrl: './g-sidebar.component.html',
  styleUrls: ['./g-sidebar.component.scss'],
})
export class GSidebarComponent {
  @Input() visible: boolean = false;
  @Output() visibleChange: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Input() title: string = '';

  closeSidebar(event: Event) {
    event.stopPropagation(); // Evita el cierre al hacer clic dentro
    this.visible = false;
    this.visibleChange.emit(this.visible);
  }
}
