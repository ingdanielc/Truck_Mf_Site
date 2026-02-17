import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ModelPartner } from 'src/app/models/partner-model';
import { GOwnerCardComponent } from '../../components/g-owner-card/g-owner-card.component';

@Component({
  selector: 'app-owners',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    GOwnerCardComponent,
  ],
  templateUrl: './owners.component.html',
  styleUrls: ['./owners.component.scss'],
})
export class OwnersComponent implements OnInit {
  partners: ModelPartner[] = [];
  allPartners: ModelPartner[] = [];
  totalPartners: number = 0;
  activePartners: number = 0;
  inactivePartners: number = 0;
  searchTerm: string = '';
  page: number = 1;
  rows: number = 10;

  // Offcanvas and Form
  isOffcanvasOpen: boolean = false;
  editingOwner: ModelPartner | null = null;
  ownerForm: FormGroup;

  constructor(private readonly fb: FormBuilder) {
    this.ownerForm = this.fb.group(
      {
        name: ['', [Validators.required]],
        documentType: ['', [Validators.required]],
        documentNumber: ['', [Validators.required]],
        cellPhone: ['', [Validators.required]],
        birthdate: ['', [Validators.required]],
        city: ['', [Validators.required]],
        gender: ['', [Validators.required]],
        vehicleCount: [0, [Validators.required, Validators.min(0)]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
      },
      {
        validators: this.passwordMatchValidator,
      },
    );
  }

  ngOnInit(): void {
    this.loadPartners();
  }

  private passwordMatchValidator(g: FormGroup) {
    return g.get('password')?.value === g.get('confirmPassword')?.value
      ? null
      : { mismatch: true };
  }

  get strength(): number {
    const pwd = this.ownerForm.get('password')?.value || '';
    if (!pwd) return 0;
    let s = 0;
    if (pwd.length >= 6) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    return s;
  }

  get strengthLabel(): string {
    const s = this.strength;
    if (s === 0) return '';
    if (s <= 1) return 'DÉBIL';
    if (s === 2) return 'MEDIA';
    if (s === 3) return 'BUENA';
    return 'FUERTE';
  }

  toggleOffcanvas(owner?: ModelPartner): void {
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
    if (this.isOffcanvasOpen) {
      if (owner) {
        this.editingOwner = owner;
        this.ownerForm.patchValue({
          name: owner.name,
          documentType: owner.documentTypeId,
          documentNumber: owner.documentNumber,
          cellPhone: owner.cellPhone,
          birthdate: owner.birthdate,
          city: owner.cityName,
          gender: owner.genderId,
          vehicleCount: 0,
          email: owner.email,
        });
        // Make password optional for editing
        this.ownerForm.get('password')?.clearValidators();
        this.ownerForm.get('confirmPassword')?.clearValidators();
        this.ownerForm.get('password')?.updateValueAndValidity();
        this.ownerForm.get('confirmPassword')?.updateValueAndValidity();
      } else {
        this.editingOwner = null;
        this.ownerForm.reset();
        // Restore password validators for new owner
        this.ownerForm
          .get('password')
          ?.setValidators([Validators.required, Validators.minLength(6)]);
        this.ownerForm
          .get('confirmPassword')
          ?.setValidators([Validators.required]);
        this.ownerForm.get('password')?.updateValueAndValidity();
        this.ownerForm.get('confirmPassword')?.updateValueAndValidity();
      }
    } else {
      this.editingOwner = null;
      this.ownerForm.reset();
    }
  }

  onSubmit(): void {
    if (this.ownerForm.valid) {
      const formValue = this.ownerForm.value;
      console.log('Form submitted:', formValue);
      // TODO: Implement actual save logic here
      // For now, just close the offcanvas
      this.toggleOffcanvas();
    }
  }

  loadPartners(): void {
    // Mock Data
    const mockPartners: ModelPartner[] = [
      {
        id: 1,
        name: 'Alejandro Ramírez',
        email: 'alejandro.ramirez@example.com',
        documentNumber: '1.023.456.789',
        cellPhone: '+57 300 456 7890',
        birthdate: '15-03-1985',
        age: 39,
        status: 'Active',
        photo: 'assets/images/avatars/01.png',
        cityId: 1,
        cityName: 'Bogotá',
        partnerMembership: [],
      },
      {
        id: 2,
        name: 'Valeria Gómez',
        email: 'valeria.gomez@example.com',
        documentNumber: '1.112.987.654',
        cellPhone: '+57 312 888 2233',
        birthdate: '22-07-1990',
        age: 34,
        status: 'Active',
        cityId: 2,
        cityName: 'Medellín',
        partnerMembership: [],
      },
      {
        id: 3,
        name: 'Ricardo Gutiérrez',
        email: 'ricardo.gutierrez@example.com',
        documentNumber: '79.432.100',
        cellPhone: '+57 315 990 1122',
        birthdate: '08-11-1978',
        age: 46,
        status: 'Inactive',
        cityId: 3,
        cityName: 'Cali',
        partnerMembership: [],
      },
      {
        id: 4,
        name: 'Luis Fernando Soto',
        email: 'luis.soto@example.com',
        documentNumber: '900.234.111-5',
        cellPhone: '+57 601 234 5678',
        birthdate: '30-05-1982',
        age: 42,
        status: 'Active',
        cityId: 1,
        cityName: 'Bogotá',
        partnerMembership: [],
      },
      {
        id: 5,
        name: 'Marta Cecilia López',
        email: 'marta.lopez@example.com',
        documentNumber: '43.222.111',
        cellPhone: '+57 320 555 1234',
        birthdate: '12-01-1995',
        age: 29,
        status: 'Active',
        cityId: 4,
        cityName: 'Barranquilla',
        partnerMembership: [],
      },
      {
        id: 6,
        name: 'Eduardo Martínez',
        email: 'eduardo.martinez@example.com',
        documentNumber: '1.036.777.222',
        cellPhone: '+57 311 222 3344',
        birthdate: '25-09-1988',
        age: 36,
        status: 'Inactive',
        cityId: 1,
        cityName: 'Bogotá',
        partnerMembership: [],
      },
    ];

    this.allPartners = mockPartners;
    this.calculateStats();
    this.applyFilter();
  }

  calculateStats(): void {
    this.totalPartners = this.allPartners.length;
    this.activePartners = this.allPartners.filter(
      (p) => p.status === 'Active',
    ).length;
    this.inactivePartners = this.totalPartners - this.activePartners;
  }

  applyFilter(): void {
    let filtered = this.allPartners;

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name?.toLowerCase().includes(term) ||
          p.email?.toLowerCase().includes(term) ||
          p.documentNumber?.includes(term),
      );
    }

    this.partners = filtered;
  }
}
