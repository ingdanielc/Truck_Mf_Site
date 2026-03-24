import {
  AbstractControl,
  AsyncValidatorFn,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { map, catchError, of, forkJoin } from 'rxjs';
import {
  ModelFilterTable,
  Filter,
  Pagination,
  Sort,
} from '../models/model-filter-table';
import { SecurityService } from '../services/security/security.service';
import { DriverService } from '../services/driver.service';

export class CustomValidators {
  /**
   * Validates if a value is duplicated within a provided list.
   * @param list The full list to check against.
   * @param property The property name on the list items to compare.
   * @param currentId The ID of the item being edited (to exclude it from the check).
   * @returns A ValidatorFn
   */
  static duplicateValueValidator(
    list: any[],
    property: string,
    currentId: number | null | undefined,
  ): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value || !list) return null;

      const isDuplicate = list.some((item) => {
        let itemValue = property
          .split('.')
          .reduce((obj, key) => obj?.[key], item);
        let controlValue = control.value;

        // Clean values if property is a document or license number
        if (
          property.toLowerCase().includes('documentnumber') ||
          property.toLowerCase().includes('licensenumber')
        ) {
          itemValue = String(itemValue || '').replaceAll(/\D/g, '');
          controlValue = String(controlValue || '').replaceAll(/\D/g, '');
        }

        // Case-insensitive comparison for strings
        if (typeof itemValue === 'string' && typeof controlValue === 'string') {
          return (
            itemValue.toLowerCase() === controlValue.toLowerCase() &&
            item.id !== currentId
          );
        }

        return itemValue === controlValue && item.id !== currentId;
      });

      return isDuplicate ? { duplicate: true } : null;
    };
  }

  /**
   * Validates phone number format: starts with 3 and has length 10.
   */
  static phoneValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      const value = control.value.replaceAll(/\s/g, '');
      if (value.length > 0 && !value.startsWith('3')) {
        return { notStartingWith3: true };
      }
      if (value.length > 0 && value.length !== 10) {
        return { invalidLength: true };
      }
      return null;
    };
  }

  /**
   * Validates that password and confirmPassword match.
   */
  static passwordMatchValidator(g: AbstractControl): ValidationErrors | null {
    const password = g.get('password')?.value;
    const confirmPassword = g.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { mismatch: true };
  }

  /**
   * Validates if an email is already registered in the system.
   * @param securityService The SecurityService to perform the check.
   * @param currentId The ID of the item being edited.
   * @returns An AsyncValidatorFn
   */
  static emailUniquenessValidator(
    securityService: SecurityService,
    currentId: number | null | undefined,
  ): AsyncValidatorFn {
    return (control: AbstractControl) => {
      if (!control.value) return of(null);

      const filter = new ModelFilterTable(
        [new Filter('email', '=', control.value)],
        new Pagination(1, 0),
        new Sort('id', true),
      );

      return securityService.getUserFilter(filter).pipe(
        map((response: any) => {
          const users = response?.data?.content || [];
          const isDuplicate = users.some(
            (user: any) =>
              user.id !== currentId &&
              user.email.toLowerCase() === control.value.toLowerCase(),
          );
          return isDuplicate ? { duplicate: true } : null;
        }),
        catchError(() => of(null)),
      );
    };
  }

  /**
   * Reads a photo file from an input change event, validates its size (max 2MB),
   * and returns a Base64 encoded string via a Promise.
   *
   * @param event The file input change event.
   * @param maxSizeMB Maximum file size allowed in megabytes (default: 2).
   * @returns A Promise that resolves with the base64 string, or rejects with an error message.
   */
  static readPhotoFile(event: Event, maxSizeMB: number = 5): Promise<string> {
    return new Promise((resolve, reject) => {
      const input = event.target as HTMLInputElement;
      const file = input?.files?.[0];

      if (!file) {
        reject('No se seleccionó ningún archivo.');
        return;
      }

      if (file.size > maxSizeMB * 1024 * 1024) {
        reject(`La imagen no debe pesar más de ${maxSizeMB}MB`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        resolve(e.target?.result as string);
      };
      reader.onerror = () => {
        reject('Error al leer el archivo.');
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Validates if an email is already registered in the system (Users or Drivers).
   * @param securityService The SecurityService to perform the check.
   * @param driverService The DriverService to perform the check.
   * @param currentUserId The ID of the item being edited.
   * @param currentDriverId The ID of the driver being edited (if applicable).
   * @returns An AsyncValidatorFn
   */
  static emailGlobalUniquenessValidator(
    securityService: SecurityService,
    driverService: DriverService,
    currentUserId: number | null | undefined,
    currentDriverId: number | null | undefined,
    initialValue?: string | null,
  ): AsyncValidatorFn {
    return (control: AbstractControl) => {
      if (!control.value) return of(null);

      if (
        initialValue &&
        control.value.toLowerCase() === initialValue.toLowerCase()
      ) {
        return of(null);
      }

      const filter = new ModelFilterTable(
        [new Filter('email', '=', control.value)],
        new Pagination(1, 0),
        new Sort('id', true),
      );

      return forkJoin({
        users: securityService.getUserFilter(filter),
        drivers: driverService.getDriverFilter(filter),
      }).pipe(
        map(({ users, drivers }) => {
          const userList = users?.data?.content || [];
          const driverList = drivers?.data?.content || [];

          const isDuplicateUser = userList.some(
            (user: any) =>
              user.id !== currentUserId &&
              user.email.toLowerCase() === control.value.toLowerCase(),
          );

          const isDuplicateDriver = driverList.some(
            (driver: any) =>
              driver.id !== currentDriverId &&
              driver.email.toLowerCase() === control.value.toLowerCase(),
          );

          return isDuplicateUser || isDuplicateDriver
            ? { duplicate: true }
            : null;
        }),
        catchError(() => of(null)),
      );
    };
  }
}
