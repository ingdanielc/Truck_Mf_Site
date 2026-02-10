import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { ModelUser } from 'src/app/models/user-model';
import { SecurityService } from 'src/app/services/security/security.service';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';
import { ToastService } from 'src/app/services/utils/toast.service';

@Component({
  selector: 'g-card-user',
  templateUrl: './g-card-user.component.html',
  styleUrls: ['./g-card-user.component.scss'],
})
export class GCardUserComponent extends AutoUtils implements OnChanges {
  @Input() data?: ModelUser;
  @Input() hover: boolean = false;
  @Output() clickEmiter: EventEmitter<any> = new EventEmitter<any>();

  inactivateUser: boolean = true;
  showConfirm: boolean = false;

  constructor(
    private readonly securityService: SecurityService,
    private readonly toastService: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {
    super();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.inactivateUser = this.data?.status == 'Active';
    }
  }

  toggleUser(event: any) {
    event.stopPropagation();
    this.showConfirm = true;
  }

  goBack(event: any) {
    event.stopPropagation();
    this.showConfirm = false;
  }

  modifyUser(event: any) {
    event.stopPropagation();
    if (!this.data) return;
    this.inactivateUser = !this.inactivateUser;
    this.data.status = this.inactivateUser ? 'Active' : 'Inactive';
    this.addSubscription(
      this.securityService.createUser(this.data).subscribe({
        next: (res) => {
          if (res.data) {
            this.showConfirm = false;
            this.data!.status = this.inactivateUser ? 'Active' : 'Inactive';
            this.toastService.showSuccess(
              'Modificación exitosa',
              'Usuario modificado con éxito.'
            );
          }
        },
        error: (err) => {
          this.toastService.showError(
            'Modificación fallida',
            'Error al modificar usuario.'
          );
        },
      })
    );
    this.cdr.detectChanges();
  }
}
