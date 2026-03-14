import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

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
   * Reads a photo file from an input change event, validates its size (max 2MB),
   * and returns a Base64 encoded string via a Promise.
   *
   * @param event The file input change event.
   * @param maxSizeMB Maximum file size allowed in megabytes (default: 2).
   * @returns A Promise that resolves with the base64 string, or rejects with an error message.
   */
  static readPhotoFile(event: Event, maxSizeMB: number = 2): Promise<string> {
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
}
