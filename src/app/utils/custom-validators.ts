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
        const itemValue = property
          .split('.')
          .reduce((obj, key) => obj?.[key], item);
        const controlValue = control.value;

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
}
