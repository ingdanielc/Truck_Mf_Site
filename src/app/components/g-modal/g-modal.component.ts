import {
  AfterContentInit,
  Component,
  ContentChildren,
  EventEmitter,
  Input,
  OnInit,
  Output,
  QueryList,
} from '@angular/core';
import { PrimeTemplate, PrimeNGConfig, ConfirmationService } from 'primeng/api';

@Component({
  selector: 'g-modal',
  templateUrl: './g-modal.component.html',
  styleUrls: ['./g-modal.component.scss'],
  providers: [ConfirmationService],
})
export class GModalComponent implements OnInit, AfterContentInit {
  @Input() show: boolean = false;
  @Input() showCloseIcon: boolean = true;
  @Input() closeOnEscape: boolean = true;
  @Input() showHeader: boolean = false;
  @Output() showChange: EventEmitter<any> = new EventEmitter();
  @Output() closeEvent: EventEmitter<any> = new EventEmitter();
  @ContentChildren(PrimeTemplate) template:
    | QueryList<PrimeTemplate>
    | undefined;

  @Output() confirmEvent: EventEmitter<any> = new EventEmitter();
  @Input() width: string = '100%';
  @Input() height: string = 'auto';
  @Input() maxWidth?: string;
  @Input() minHeight?: string;

  public header: any;
  public content: any;
  public footer: any;

  constructor(private readonly primengConfig: PrimeNGConfig) {}

  ngOnInit(): void {
    this.primengConfig.ripple = true;
  }

  ngAfterContentInit(): void {
    this.template?.forEach((template) => {
      switch (template.getType()) {
        case 'header':
          this.header = template.template;
          break;
        case 'content':
          this.content = template.template;
          break;
        case 'footer':
          this.footer = template.template;
          break;
      }
    });
  }

  closeModal(isClickCancel?: any, isClickCloseIcon?: boolean): void {
    this.show = false;
    this.showChange.emit(false);
    if (isClickCloseIcon) {
      this.closeEvent.emit(false);
    }
  }
}
