import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { ToastService } from 'src/app/services/utils/toast.service';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';
import { Observable, Subject } from 'rxjs';
import { WebcamImage, WebcamInitError, WebcamUtil } from 'ngx-webcam';
import { ModelPartner } from 'src/app/models/partner-model';
import { PartnerService } from 'src/app/services/partner.service';
import { CommonService } from 'src/app/services/common.service';
import { NotificationsService } from 'src/app/services/notifications.service';
import { KeyValue, ModelNotification } from 'src/app/models/notification-model';

@Component({
  selector: 'app-create-update',
  templateUrl: './create-update.component.html',
  styleUrls: ['./create-update.component.scss'],
})
export class CreateUpdateComponent extends AutoUtils implements OnInit {
  principalTitle: string = 'Crear socio';
  listTypeDocument: any[] = [];
  listGender: any[] = [];
  route: string = '';
  partner: ModelPartner = new ModelPartner();
  isShimmer: boolean = false;
  errorText: string = 'Este campo es obligatorio para continuar';
  showNoProduct: boolean = false;
  partnerForm: FormGroup = new FormGroup({});
  listCity: any = [];
  photoDefault: string = '';
  hasFingerprint?: boolean;
  today: Date = new Date();
  minDate: Date = new Date('1930-01-01');

  public allowCameraSwitch = true;
  public multipleWebcamsAvailable = false;
  public deviceId?: string;
  public videoOptions: MediaTrackConstraints = {
    width: { ideal: 1024 },
    height: { ideal: 576 },
  };
  public errors: WebcamInitError[] = [];

  public webcamImage?: WebcamImage;
  private readonly trigger: Subject<void> = new Subject<void>();
  imagenUrl: string = '';

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly router: Router,
    private readonly fb: FormBuilder,
    private readonly partnerService: PartnerService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly notificationService: NotificationsService
  ) {
    super();
  }

  ngOnInit(): void {
    this.principalTitle = 'Crear socio';
    this.photoDefault = this.partnerService.getPhotoDefault();
    this.createForm();
    if (this.getPartnerCode() !== 0) {
      this.partner.id = this.getPartnerCode();
      this.getPartnerById();
      this.principalTitle = 'Modificar socio';
    }
    this.getCities();
    this.getListTypeDocument();
    this.getListGender();
    WebcamUtil.getAvailableVideoInputs().then(
      (mediaDevices: MediaDeviceInfo[]) => {
        this.multipleWebcamsAvailable = mediaDevices && mediaDevices.length > 1;
      }
    );
  }

  createForm() {
    this.partnerForm = this.fb.group({
      documentTypeId: ['', Validators.required],
      documentNumber: ['', Validators.required],
      name: ['', Validators.required],
      cellPhone: ['', Validators.required],
      email: ['', [Validators.email]],
      cityId: [''],
      address: [''],
      birthdate: [Date, Validators.required],
      genderId: ['', Validators.required],
      age: ['', Validators.required],
    });
  }

  public triggerSnapshot(): void {
    this.trigger.next();
  }

  public handleInitError(error: WebcamInitError): void {
    this.errors.push(error);
    console.log('Error webcam: ', this.errors);
  }

  public handleImage(webcamImage: WebcamImage): void {
    this.webcamImage = webcamImage;
    this.partner.photo = webcamImage.imageAsDataUrl;
  }

  public get triggerObservable(): Observable<void> {
    return this.trigger.asObservable();
  }

  getListTypeDocument() {
    this.addSubscription(
      this.commonService.getListTypeDocument().subscribe({
        next: (res) => {
          if (res.data) {
            this.listTypeDocument = res.data;
            this.partner.documentTypeId =
              this.listTypeDocument[0].documentTypeId;
          }
        },
        error: (err) => {
          console.error('Error al obtener los tipos de identificación', err);
        },
      })
    );
  }

  getListGender() {
    this.addSubscription(
      this.commonService.getGenders().subscribe({
        next: (res) => {
          if (res.data) {
            this.listGender = res.data;
          }
        },
        error: (err) => {
          console.error('Error al obtener los generos', err);
        },
      })
    );
  }

  getCities() {
    this.addSubscription(
      this.commonService.getCities().subscribe({
        next: (res) => {
          if (res.data) {
            this.listCity = res.data;
          }
        },
        error: (err) => {
          console.error('Error al obtener las ciudades', err);
        },
      })
    );
  }

  calculateAge(): string {
    if (!this.partner.birthdate) {
      return '----';
    }

    const birthDate = new Date(this.partner.birthdate);
    const today = new Date();

    // Calcular edad preliminar (diferencia de años)
    let age = today.getFullYear() - birthDate.getFullYear();

    // Ajustar edad si el cumpleaños aún no ha ocurrido este año
    const hasBirthdayPassed =
      today.getMonth() > birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() &&
        today.getDate() >= birthDate.getDate());

    if (!hasBirthdayPassed) {
      age -= 1;
    }

    this.partner.age = age;
    this.partnerForm.patchValue({ age: age });

    return `${age} años`;
  }

  getPartnerById() {
    if (this.partner.id === undefined || this.partner.id === null) return;

    let listField: any[] = [];
    listField.push(new Filter('id', '=', this.partner.id.toString()));
    let filter = new ModelFilterTable(
      listField,
      new Pagination(10, 0),
      new Sort('id', true)
    );
    this.addSubscription(
      this.partnerService.getPartnerFilter(filter).subscribe({
        next: (res: any) => {
          if (res?.data?.content) {
            this.partner = res.data.content[0];
            this.partner.birthdate = new Date(res.data.content[0].birthdate);
          }
        },
        error: (err: Error) => {
          console.error(err);
          this.resetClient();
        },
      })
    );
    this.cdr.detectChanges();
  }

  getPartner() {
    if (
      this.partner.documentTypeId === undefined ||
      this.partner.documentNumber === undefined ||
      this.partner.documentNumber === null
    )
      return;

    let listField: any[] = [];
    listField.push(
      new Filter('documentTypeId', '=', this.partner.documentTypeId.toString())
    );
    listField.push(
      new Filter('documentNumber', '=', this.partner.documentNumber.toString())
    );
    let filter = new ModelFilterTable(
      listField,
      new Pagination(10, 0),
      new Sort('id', true)
    );
    this.addSubscription(
      this.partnerService.getPartnerFilter(filter).subscribe({
        next: (res: any) => {
          if (res?.data?.content && res?.data?.totalElements > 0) {
            this.partner = res.data.content[0];
            this.partner.birthdate = new Date(res.data.content[0].birthdate);
            this.principalTitle = 'Modificar socio';
          } else {
            this.principalTitle = !this.partner.id
              ? 'Crear socio'
              : 'Modificar socio';
          }
        },
        error: (err: Error) => {
          this.principalTitle = 'Crear socio';
          console.error(err);
          this.resetClient();
        },
      })
    );
    this.cdr.detectChanges();
  }

  resetClient() {
    let cliente = { ...this.partner };
    this.partner = new ModelPartner();
    this.partner.documentTypeId = cliente.documentTypeId;
    this.partner.documentNumber = cliente.documentNumber;
  }

  savePartner() {
    if (!this.partnerForm.valid) return;
    this.mapSavePartner();
    this.partner.documentNumber = this.partner.documentNumber?.toString();
    this.partner.status =
      this.principalTitle.indexOf('Crear') >= 0
        ? 'Inactive'
        : this.partner.status;
    this.partner.photo = !this.webcamImage?.imageAsDataUrl
      ? this.photoDefault
      : this.webcamImage?.imageAsDataUrl;

    this.addSubscription(
      this.partnerService.createPartner(this.partner).subscribe({
        next: (res) => {
          if (res.data) {
            if (this.principalTitle.indexOf('Crear') >= 0) {
              this.toastService.showSuccess(
                'Creación exitosa',
                'Socio creado con éxito.'
              );
              this.sendNotification();
            } else {
              this.toastService.showSuccess(
                'Modificación exitosa',
                'Socio modificado con éxito.'
              );
            }
            this.router.navigate(['/site/partners']);
          }
        },
        error: (err) => {
          if (this.principalTitle.indexOf('Crear') >= 0) {
            this.toastService.showError(
              'Creación fallida',
              'Error al crear socio.'
            );
          } else {
            this.toastService.showError(
              'Modificación fallida',
              'Error al modificar socio.'
            );
          }
        },
      })
    );
  }

  mapSavePartner() {
    this.partner.documentTypeName = this.listTypeDocument.find(
      (x) => x.documentTypeId === this.partner.documentTypeId
    ).documentTypeName;

    if (this.partner.cityId) {
      const selectedCity = this.listCity.find(
        (city: any) => city.cityId === this.partner.cityId
      );

      this.partner.cityName = selectedCity.cityName;
    }

    const opciones: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    };
    const formateador = new Intl.DateTimeFormat('en-CA', opciones);
    const fechaFormateada = formateador.format(this.partner.birthdate);
    this.partner.birthdate = fechaFormateada;

    this.partner.cellPhone = `${this.partner.cellPhone}`;
  }

  isInvalid(field: string) {
    return (
      this.partnerForm.get(field)?.invalid &&
      this.partnerForm.get(field)?.touched
    );
  }

  goBack() {
    this.router.navigate([`/site/partners`]);
  }

  captureFingerprint() {
    this.hasFingerprint = true;
  }

  sendNotification() {
    let message = new ModelNotification();
    message.medium = 'Whatsapp';
    message.messageType = 'BIENVENIDA';
    message.phone = '+57' + this.partner.cellPhone;
    message.data?.push(new KeyValue('partnerName', this.partner.name));
    message.recipients?.push('+57' + this.partner.cellPhone!);

    this.addSubscription(
      this.notificationService.sendMessages(message).subscribe({
        next: (res: any) => {
          console.log('Notificación enviada con exito.');
        },
        error: (err: Error) => {
          console.error(err);
        },
      })
    );
  }
}
