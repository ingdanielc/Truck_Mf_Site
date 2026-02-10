import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';

@Component({
  selector: 'g-filter',
  templateUrl: './g-filter.component.html',
  styleUrls: ['./g-filter.component.scss'],
})
export class GFilterComponent extends AutoUtils implements OnChanges {
  isOpen: boolean = false;
  statusFilterCh: string[] = [];
  typesFilterCh: string[] = [];
  startDate: any;
  endDate: any;
  maxDate: Date = new Date();
  errorText: string = '';
  @Input() statusFilter: string[] = [];
  @Input() typesFilter: string[] = [];
  @Input() listStatus: any[] = [];
  @Input() listTypes: any[] = [];
  @Input() labelFiltro: string = '';
  @Input() range: boolean = false;
  @Output() selectedStatus: EventEmitter<any> = new EventEmitter<any>();
  @Output() selectedTypes: EventEmitter<any> = new EventEmitter<any>();
  @Output() selectedStartDate: EventEmitter<any> = new EventEmitter<any>();
  @Output() selectedEndDate: EventEmitter<any> = new EventEmitter<any>();
  @Output() apply: EventEmitter<any> = new EventEmitter<any>();
  @Output() clean: EventEmitter<any> = new EventEmitter<any>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes) {
      this.statusFilterCh = this.statusFilter;
      this.statusFilter = [];
      this.typesFilterCh = this.typesFilter;
      this.typesFilter = [];
      if (this.range && !this.startDate && !this.endDate) {
        this.startDate = new Date();
        this.endDate = new Date();
        this.selectedStartDate.emit(this.startDate);
        this.selectedEndDate.emit(this.endDate);
      }
    }
  }

  toggleDropdown() {
    if (
      (this.statusFilterCh.length > 0 ||
        this.typesFilterCh.length > 0 ||
        this.statusFilter.length > 0 ||
        this.typesFilter.length > 0) &&
      this.isOpen === true
    )
      this.isOpen = true;
    else this.isOpen = !this.isOpen;
  }

  cleanFilter() {
    this.statusFilterCh = [];
    this.typesFilterCh = [];
    this.statusFilter = [...this.statusFilterCh];
    this.typesFilter = [...this.typesFilterCh];
    if (this.range) {
      this.startDate = new Date();
      this.endDate = new Date();
    }
    this.selectedStatus.emit(this.statusFilter);
    this.selectedTypes.emit(this.typesFilter);
    this.clean.emit(true);
  }

  applyFilter() {
    this.statusFilter = [...this.statusFilterCh];
    this.typesFilter = [...this.typesFilterCh];
    this.isOpen = false;
    this.selectedStatus.emit(this.statusFilter);
    this.selectedTypes.emit(this.typesFilter);
    if (this.range) {
      this.selectedStartDate.emit(this.startDate);
      this.selectedEndDate.emit(this.endDate);
    }
    this.apply.emit(true);
  }

  isInvalid(field: string) {
    return false;
  }
}
