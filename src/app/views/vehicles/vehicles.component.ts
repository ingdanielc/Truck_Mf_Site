import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { GVehicleCardComponent } from '../../components/g-vehicle-card/g-vehicle-card.component';
import { VehicleService } from 'src/app/services/vehicle.service';

@Component({
  selector: 'app-vehicles',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    GVehicleCardComponent,
  ],
  templateUrl: './vehicles.component.html',
  styleUrls: ['./vehicles.component.scss'],
})
export class VehiclesComponent implements OnInit {
  vehicles: ModelVehicle[] = [];
  allVehicles: ModelVehicle[] = [];
  totalVehicles: number = 0;
  availableVehicles: number = 0;
  occupiedVehicles: number = 0;
  searchTerm: string = '';
  page: number = 0;
  rows: number = 10;

  // Offcanvas and Form
  isOffcanvasOpen: boolean = false;
  editingVehicle: ModelVehicle | null = null;
  vehicleForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly vehicleService: VehicleService,
  ) {
    this.vehicleForm = this.fb.group({
      brand: ['', [Validators.required]],
      model: ['', [Validators.required]],
      year: [
        new Date().getFullYear(),
        [Validators.required, Validators.min(1900)],
      ],
      color: ['', [Validators.required]],
      plate: ['', [Validators.required]],
      motorNumber: ['', [Validators.required]],
      chassisNumber: ['', [Validators.required]],
      axleCount: [2, [Validators.required, Validators.min(1)]],
      photo: [''],
    });
  }

  ngOnInit(): void {
    this.loadVehicles();
  }

  toggleOffcanvas(vehicle?: ModelVehicle): void {
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
    if (this.isOffcanvasOpen) {
      if (vehicle) {
        this.editingVehicle = vehicle;
        this.vehicleForm.patchValue({
          brand: vehicle.brand,
          model: vehicle.model,
          year: vehicle.year,
          color: vehicle.color,
          plate: vehicle.plate,
          motorNumber: vehicle.motorNumber,
          chassisNumber: vehicle.chassisNumber,
          axleCount: vehicle.axleCount,
        });
      } else {
        this.editingVehicle = null;
        this.vehicleForm.reset({
          year: new Date().getFullYear(),
          axleCount: 2,
        });
      }
    } else {
      this.editingVehicle = null;
      this.vehicleForm.reset();
    }
  }

  onSubmit(): void {
    if (this.vehicleForm.valid) {
      const formValue = this.vehicleForm.value;
      console.log('Form submitted:', formValue);
      // Actual implementation would call vehicleService.createVehicle
      this.toggleOffcanvas();
    }
  }

  loadVehicles(): void {
    // Mocking some data for demonstration
    this.allVehicles = [
      {
        id: 1,
        brand: 'Toyota',
        model: 'Hilux L200',
        year: 2022,
        plate: 'ABC-1234',
        status: 'Disponible',
        km: '42k',
        fuelCapacity: '80%',
        color: 'Blanco',
        motorNumber: 'MOT-123',
        chassisNumber: 'CHS-123',
        axleCount: 2,
      },
      {
        id: 2,
        brand: 'Mercedes-Benz',
        model: 'Actros 2645',
        year: 2024,
        plate: 'XYZ-9876',
        status: 'Ocupado',
        km: '15k',
        fuelCapacity: '45%',
        color: 'Gris',
        motorNumber: 'MOT-456',
        chassisNumber: 'CHS-456',
        axleCount: 3,
      },
    ];
    this.calculateStats();
    this.applyFilter();
  }

  calculateStats(): void {
    this.totalVehicles = this.allVehicles.length;
    this.availableVehicles = this.allVehicles.filter(
      (v) => v.status?.toLowerCase() === 'disponible',
    ).length;
    this.occupiedVehicles = this.totalVehicles - this.availableVehicles;
  }

  applyFilter(): void {
    let filtered = this.allVehicles;

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (v) =>
          v.brand?.toLowerCase().includes(term) ||
          v.model?.toLowerCase().includes(term) ||
          v.plate?.toLowerCase().includes(term),
      );
    }

    this.vehicles = filtered;
  }
}
