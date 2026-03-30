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
    initialValue?: string | null,
  ): AsyncValidatorFn {
    return (control: AbstractControl) => {
      const val = (control.value || '').toString().trim().toLowerCase();
      const init = (initialValue || '').toString().trim().toLowerCase();

      if (initialValue !== null && initialValue !== undefined && val === init) {
        return of(null);
      }

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
   * Reads a photo file from an input change event, corrects its orientation using Canvas,
   * resizes it if it exceeds maxSide, and returns both a Base64 string and a corrected Blob.
   *
   * @param event The file input change event.
   * @param maxSide Maximum dimension (width or height) allowed (default: 1200).
   * @param quality Image quality (0.0 to 1.0) (default: 0.8).
   * @returns A Promise that resolves with an object { base64: string, blob: Blob }.
   */
  static readPhotoFile(
    event: Event,
    maxSide: number = 1200,
    quality: number = 0.8,
  ): Promise<{ base64: string; blob: Blob }> {
    return new Promise((resolve, reject) => {
      const input = event.target as HTMLInputElement;
      const file = input?.files?.[0];

      if (!file) {
        reject('No se seleccionó ningún archivo.');
        return;
      }

      if (file.type && !file.type.startsWith('image/')) {
        reject('El archivo seleccionado no es una imagen.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e: any) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Resize logic
          if (width > height) {
            if (width > maxSide) {
              height *= maxSide / width;
              width = maxSide;
            }
          } else {
            if (height > maxSide) {
              width *= maxSide / height;
              height = maxSide;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject('No se pudo obtener el contexto del canvas.');
            return;
          }

          // Modern browsers (Chrome 81+, iOS 13.4+, Safari 13.1+)
          // automatically handle EXIF orientation when drawing to canvas.
          ctx.drawImage(img, 0, 0, width, height);

          const base64 = canvas.toDataURL('image/jpeg', quality);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve({ base64, blob });
              } else {
                reject('Error al generar el blob de la imagen.');
              }
            },
            'image/jpeg',
            quality,
          );
        };
        img.onerror = () => reject('Error al cargar la imagen.');
        img.src = e.target.result;
      };
      reader.onerror = () => reject('Error al leer el archivo.');
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

  /**
   * Normalizes form values for comparison by converting numbers to strings
   * and handling null/undefined consistently.
   */
  static getNormalizedFormValue(raw: any): any {
    const normalized: any = {};
    if (!raw) return normalized;
    Object.keys(raw).forEach((key) => {
      let val = raw[key];
      if (val === undefined || val === null) val = null;
      if (typeof val === 'number') val = String(val);
      normalized[key] = val;
    });
    return normalized;
  }
}
