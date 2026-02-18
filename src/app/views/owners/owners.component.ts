import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ModelOwner } from 'src/app/models/owner-model';
import { GOwnerCardComponent } from '../../components/g-owner-card/g-owner-card.component';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { OwnerService } from 'src/app/services/owner.service';

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
  owners: ModelOwner[] = [];
  allOwners: ModelOwner[] = [];
  totalOwners: number = 0;
  activeOwners: number = 0;
  inactiveOwners: number = 0;
  searchTerm: string = '';
  page: number = 1;
  rows: number = 10;

  // Offcanvas and Form
  isOffcanvasOpen: boolean = false;
  editingOwner: ModelOwner | null = null;
  ownerForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly ownerService: OwnerService,
  ) {
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

  toggleOffcanvas(owner?: ModelOwner): void {
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
    let filtros: Filter[] = [];
    let filter = new ModelFilterTable(
      filtros,
      new Pagination(this.rows, this.page),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        console.log('asd: ', response);
        if (response?.data?.content) {
          this.totalOwners = response.data.totalElements || 0;
          this.allOwners = response.data.content;
          // .map((u: ModelOwner) =>
          //   this.mapOwner(u),
          // );
          this.applyFilter();
        } else {
          this.allOwners = [];
          this.owners = [];
        }
      },
      error: (err) => {
        console.error('Error loading users:', err);
      },
    });
    this.calculateStats();
    this.applyFilter();
  }

  calculateStats(): void {
    this.totalOwners = this.allOwners.length;
    this.activeOwners = this.allOwners.filter(
      (p) => p.status === 'Active',
    ).length;
    this.inactiveOwners = this.totalOwners - this.activeOwners;
  }

  applyFilter(): void {
    let filtered = this.allOwners;

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name?.toLowerCase().includes(term) ||
          p.email?.toLowerCase().includes(term) ||
          p.documentNumber?.includes(term),
      );
    }

    this.owners = filtered;
  }
}
