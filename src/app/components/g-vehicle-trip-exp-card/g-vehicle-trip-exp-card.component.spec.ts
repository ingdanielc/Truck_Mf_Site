import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GVehicleTripExpCardComponent } from './g-vehicle-trip-exp-card.component';

describe('GVehicleTripExpCardComponent', () => {
  let component: GVehicleTripExpCardComponent;
  let fixture: ComponentFixture<GVehicleTripExpCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GVehicleTripExpCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GVehicleTripExpCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
