import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';

import { MenuItem } from 'primeng/api';
import { ModelPartner } from 'src/app/models/partner-model';
import { PartnerService } from 'src/app/services/partner.service';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';
import { TokenService } from 'src/app/services/utils/token.service';

@Component({
  selector: 'menubar',
  templateUrl: './menubar.component.html',
  styleUrls: ['./menubar.component.scss'],
})
export class MenubarComponent extends AutoUtils implements OnInit {
  @Input() isLogo: boolean = true;
  @Input() title: string = '';
  @Output() showSidebar: EventEmitter<any> = new EventEmitter<any>();

  name: string = '';
  email: string = '';
  items: MenuItem[] = [];
  birthdayPartners: ModelPartner[] = [];
  birthdays: boolean = true;
  partnersList: ModelPartner[] = [];
  partners: boolean = true;

  constructor(
    private readonly router: Router,
    private readonly tokenService: TokenService,
    private readonly partnerService: PartnerService
  ) {
    super();
  }

  ngOnInit(): void {
    const getInfo = this.tokenService.getPayload();
    if (getInfo) {
      this.email = getInfo.email;
      this.name = getInfo?.name;
    }
    this.items = [
      {
        label: 'Perfil',
        icon: 'mr-2 fa-solid fa-user-pen',
        command: () => {
          this.goToProfile();
        },
      },
      {
        label: 'Salir',
        icon: 'mr-2 fa-solid fa-right-from-bracket',
        command: () => {
          this.logout();
        },
      },
    ];
    this.getBirthdayPartners();
    this.getInactivePartners();
  }

  getBirthdayPartners() {
    this.addSubscription(
      this.partnerService.getBirthdays().subscribe({
        next: (res: any) => {
          if (res?.data) {
            this.birthdayPartners = res.data;
          }
        },
        error: (err: Error) => {
          console.error(err);
          this.birthdayPartners = [];
        },
      })
    );
  }

  getInactivePartners() {
    this.addSubscription(
      this.partnerService.getInactives().subscribe({
        next: (res: any) => {
          if (res?.data) {
            this.partnersList = res.data;
          }
        },
        error: (err: Error) => {
          console.error(err);
          this.partnersList = [];
        },
      })
    );
  }

  logout() {
    this.tokenService.clearToken();
    this.router.navigate(['/auth']);
  }

  goToProfile() {
    this.router.navigate(['/site/security']).then(() => {
      setTimeout(() => {
        const userProfileEvent = new CustomEvent('openUserProfile');
        window.dispatchEvent(userProfileEvent);
      }, 500);
    });
  }
}
