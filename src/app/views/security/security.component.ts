import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnInit,
  QueryList,
  ViewChildren,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { ToastService } from 'src/app/services/utils/toast.service';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';
import { ModelUser } from 'src/app/models/user-model';
import { SecurityService } from 'src/app/services/security/security.service';
import { GCardUserComponent } from 'src/app/components/g-card-user/g-card-user.component';
import { TokenService } from 'src/app/services/utils/token.service';

@Component({
  selector: 'app-security',
  templateUrl: './security.component.html',
  styleUrls: ['./security.component.scss'],
})
export class SecurityComponent
  extends AutoUtils
  implements OnInit, AfterViewInit
{
  hover: boolean = false;
  listUser: ModelUser[] = [];
  listAllUser: ModelUser[] = [];
  userFilter?: string;
  totalElements: number = 0;
  isSmallScreen: boolean = false;
  currentPageReportTemplate: string =
    'Mostrando {first} a {last} de {totalRecords} total.';
  rows: number = 10;
  first: number = 0;
  page: number = 0;
  listStatus: any[] = [
    { label: 'Activo', value: 'Active' },
    { label: 'Inactivo', value: 'Inactive' },
  ];
  status: string = '';
  statusFilter: any[] = [];
  listTypes: any[] = [];
  types: string = '';
  typesFilter: any[] = [];
  showFilters: boolean = false;
  labelFiltro: string = '';

  modalCreate: boolean = false;
  principalTitle: string = 'Crear usuario';
  newUser: ModelUser = new ModelUser();
  listRoles: any[] = [];
  userForm: FormGroup = new FormGroup({});
  errorText: string = 'Este campo es obligatorio para continuar';
  showInfo: boolean = false;
  confirmPassword: string = '';

  @ViewChildren(GCardUserComponent) userCards!: QueryList<GCardUserComponent>;
  shouldOpenModal = false;

  constructor(
    private readonly securityService: SecurityService,
    private readonly toastService: ToastService,
    private readonly tokenService: TokenService,
    private readonly cdr: ChangeDetectorRef,
    private readonly fb: FormBuilder
  ) {
    super();
  }

  ngOnInit(): void {
    this.labelFiltro = 'Rol';
    this.getListRoles();
    this.getListUser();
    window.addEventListener(
      'openUserProfile',
      this.handleOpenUserProfile.bind(this)
    );
  }

  getListUser() {
    let filtros: Filter[] = [];
    if (this.status !== '') {
      filtros.push(new Filter('status', 'in', this.status));
    }
    if (this.types !== '') {
      filtros.push(new Filter('userRoles.role.id', 'in', this.types));
    }
    let filter = new ModelFilterTable(
      filtros,
      new Pagination(this.rows, this.page),
      new Sort('id', true)
    );
    this.addSubscription(
      this.securityService.getUserFilter(filter).subscribe({
        next: (res: any) => {
          if (res?.data?.content) {
            this.listUser = res.data.content;
            this.listAllUser = [...this.listUser];
            this.totalElements = res.data.totalElements;
          }
        },
        error: (err: Error) => {
          this.listUser = [];
          this.totalElements = 0;
        },
      })
    );
  }

  onPageChange(event: any) {
    this.page = event.page;
    this.rows = event.rows;
    this.getListUser();
  }

  createNewUsuario() {
    this.principalTitle = 'Crear usuario';
    this.createForm();
    this.getListRoles();
    this.newUser = new ModelUser();
    this.confirmPassword = '';
    this.modalCreate = true;
  }

  createForm() {
    this.userForm = this.fb.group(
      {
        name: ['', Validators.required],
        email: ['', [Validators.required, Validators.email]],
        password: ['', Validators.required],
        confirmPassword: ['', Validators.required],
        rolId: ['', Validators.required],
      },
      { validator: this.matchPasswords('password', 'confirmPassword') }
    );
  }

  matchPasswords(password: string, confirmPassword: string) {
    return (formGroup: AbstractControl) => {
      const pass = formGroup.get(password);
      const confirmPass = formGroup.get(confirmPassword);

      if (confirmPass?.errors && !confirmPass.errors['mismatch']) {
        return;
      }

      if (pass?.value !== confirmPass?.value) {
        confirmPass?.setErrors({ mismatch: true });
      } else {
        confirmPass?.setErrors(null);
      }
    };
  }

  cleanFilter() {
    this.statusFilter = [];
    this.typesFilter = [];
    this.showFilters = false;
    this.getStringFilters();
    this.getListUser();
  }

  applyFilter() {
    this.showFilters = true;
    this.page = 0;
    this.getStringFilters();
    this.getListUser();
  }

  getStringFilters() {
    this.status = '';
    for (let i = 0; i < this.statusFilter.length; i++) {
      this.status += this.statusFilter[i];
      if (i < this.statusFilter.length - 1) {
        this.status += ', ';
      }
    }
    this.types = '';
    for (let i = 0; i < this.typesFilter.length; i++) {
      this.types += this.typesFilter[i];
      if (i < this.typesFilter.length - 1) {
        this.types += ', ';
      }
    }
  }

  applyFilterUser(filter: string) {
    if (!filter) {
      this.listUser = [...this.listAllUser];
    } else {
      this.listUser = [...this.listAllUser];
      this.listUser = this.listUser.filter((item) =>
        item.name!.toLowerCase().includes(filter.toLowerCase())
      );
    }
  }

  isInvalid(field: string) {
    return (
      this.userForm.get(field)?.invalid && this.userForm.get(field)?.touched
    );
  }

  getListRoles() {
    this.addSubscription(
      this.securityService.getAllRoles().subscribe({
        next: (res) => {
          if (res.data) {
            this.listRoles = res.data;
            let roles = res.data.map((rol: { id: number; name: string }) => ({
              id: rol.id,
              name: rol.name,
            }));
            this.listTypes = roles;
          }
        },
        error: (err) => {
          console.error('Error al obtener los roles', err);
        },
      })
    );
  }

  goBack() {
    this.modalCreate = false;
  }

  completeInfo() {
    if (this.newUser.userRoles[0].role.id) {
      this.newUser.userRoles[0].role.name = this.listRoles.find(
        (x) => x.id == this.newUser.userRoles[0].role.id
      ).name;
    }
  }

  openDetail(id: number) {
    if (id !== undefined) {
      this.createNewUsuario();
      this.principalTitle = 'Modificar usuario';
      this.newUser = this.listUser.filter((x) => x.id === id)[0];
      this.confirmPassword = this.newUser.password!;
      this.userForm.get('rolId')!.disable();
    } else {
      this.modalCreate = false;
    }
  }

  async createUser() {
    if (this.userForm.valid) {
      this.completeInfo();
      this.newUser.status = 'Active';
      this.newUser.password = await this.securityService.getHashSHA512(
        this.newUser.password!
      );
      this.addSubscription(
        this.securityService.createUser(this.newUser).subscribe({
          next: (res) => {
            if (res.data) {
              this.modalCreate = false;
              this.getListUser();
              if (this.principalTitle.indexOf('Crear') >= 0) {
                this.toastService.showSuccess(
                  'Creación exitosa',
                  'Usuario creado con éxito.'
                );
              } else {
                this.toastService.showSuccess(
                  'Modificación exitosa',
                  'Usuario modificado con éxito.'
                );
              }
            }
          },
          error: (err) => {
            let detail =
              this.principalTitle.indexOf('Crear') >= 0
                ? 'Error al crear usuario.'
                : 'Error al modificar usuario.';
            let title =
              this.principalTitle.indexOf('Crear') >= 0
                ? 'Creación fallida'
                : 'Modificación fallida';
            if (err.error.code == 409)
              detail =
                'Existe un usuario con el mismo nombre o correo electrónico.';

            this.toastService.showError(title, detail);
            this.newUser.password = this.userForm.get('confirmPassword')!.value;
          },
        })
      );
      this.cdr.detectChanges();
    }
  }

  @HostListener('window:resize', [])
  onResize() {
    this.checkScreenSize();
  }

  checkScreenSize() {
    this.isSmallScreen = window.innerWidth < 991; // lg en PrimeFlex
    this.currentPageReportTemplate = this.isSmallScreen
      ? '{first} / {last}'
      : 'Mostrando {first} a {last} de {totalRecords} total.';
  }

  ngAfterViewInit() {
    if (this.shouldOpenModal) {
      this.openAuthenticatedUserModal();
      this.shouldOpenModal = false;
    }
  }

  handleOpenUserProfile() {
    this.shouldOpenModal = true;
    this.openAuthenticatedUserModal();
  }

  openAuthenticatedUserModal() {
    const getInfo = this.tokenService.getPayload();
    let nameUser = '';
    if (getInfo) {
      nameUser = getInfo?.name;
    }
    setTimeout(() => {
      if (!this.userCards) return;
      const userCard = this.userCards.find(
        (card) => card.data?.name === nameUser
      );
      if (userCard) {
        this.openDetail(userCard.data?.id!);
      }
    }, 500);
  }
}
