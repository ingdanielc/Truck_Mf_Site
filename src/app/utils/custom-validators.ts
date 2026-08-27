import {
  AbstractControl,
  AsyncValidatorFn,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { map, catchError, of, forkJoin, timer, switchMap } from 'rxjs';
import {
  ModelFilterTable,
  Filter,
  Pagination,
  Sort,
} from '../models/model-filter-table';
import { SecurityService } from '../services/security/security.service';
import { DriverService } from '../services/driver.service';
import { OwnerService } from '../services/owner.service';

export type UniquenessField = 'documentNumber' | 'email' | 'cellPhone';
export type UniquenessScope = 'owner' | 'driver';

/** Datos del registro en edicion que necesita el validador de unicidad. */
export interface UniquenessContext {
  /** Propietario en edicion; null al crear. */
  ownerId?: number | null;
  /** Conductor en edicion; null al crear. */
  driverId?: number | null;
  /** Usuario asociado al registro en edicion. */
  userId?: number | null;
  /** Valor guardado del campo: si no cambia no se consulta al backend. */
  initialValue?: string | null;
  /** Formulario de propietario: valor del check "Es conductor". */
  isDriver?: boolean;
  /** Formulario de conductor: propietario seleccionado. */
  linkedOwnerId?: number | null;
}

export class CustomValidators {
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

  private static readonly UNIQUENESS_DEBOUNCE_MS = 400;

  /** Digitos minimos para consultar un documento; evita buscar valores
   *  incompletos mientras se escribe. */
  private static readonly MIN_DOCUMENT_DIGITS = 5;

  /**
   * Normaliza el valor segun el campo. El documento y el celular se guardan en
   * BD unicamente con digitos (el formulario los muestra con mascara), y el
   * correo se compara sin distinguir mayusculas.
   */
  private static normalizeUniqueValue(
    field: UniquenessField,
    value: any,
  ): string {
    const raw = String(value ?? '').trim();
    return field === 'email' ? raw.toLowerCase() : raw.replaceAll(/\D/g, '');
  }

  /** Filtro puntual: pregunta si el valor existe, no descarga la tabla. */
  private static uniquenessFilter(
    field: UniquenessField,
    value: string,
  ): ModelFilterTable {
    return new ModelFilterTable(
      [new Filter(field, '=', value)],
      new Pagination(5, 0),
      new Sort('id', true),
    );
  }

  private static sameId(a: any, b: any): boolean {
    if (a == null || b == null) return false;
    return Number(a) === Number(b);
  }

  /**
   * Valida que el documento, el correo o el celular no esten registrados ya en
   * las tablas de propietarios y conductores (y, para el correo, tambien en la
   * de usuarios), consultando el filtro del backend en lugar de traerse los
   * registros al navegador.
   *
   * Excepcion: un propietario marcado como conductor existe a proposito en las
   * dos tablas con los mismos datos, por lo que ese registro espejo no cuenta
   * como duplicado.
   */
  static ownerDriverUniquenessValidator(
    services: {
      owner: OwnerService;
      driver: DriverService;
      security: SecurityService;
    },
    config: {
      field: UniquenessField;
      scope: UniquenessScope;
      context: () => UniquenessContext;
    },
  ): AsyncValidatorFn {
    const { field, scope } = config;

    return (control: AbstractControl) => {
      const ctx = config.context();
      const value = CustomValidators.normalizeUniqueValue(field, control.value);

      if (!value) return of(null);

      // Documento a medio escribir: todavia no es un valor que valga la pena
      // consultar (el celular y el correo ya los frenan sus validadores sync).
      if (
        field === 'documentNumber' &&
        value.length < CustomValidators.MIN_DOCUMENT_DIGITS
      ) {
        return of(null);
      }

      // Sin cambios respecto a lo guardado: no hay nada que consultar.
      if (
        ctx.initialValue != null &&
        value === CustomValidators.normalizeUniqueValue(field, ctx.initialValue)
      ) {
        return of(null);
      }

      const filter = CustomValidators.uniquenessFilter(field, value);

      // Angular cancela la validacion anterior en cada cambio, asi que el timer
      // evita disparar una peticion por pulsacion mientras se escribe.
      return timer(CustomValidators.UNIQUENESS_DEBOUNCE_MS).pipe(
        switchMap(() =>
          forkJoin({
            owners: services.owner.getOwnerFilter(filter),
            drivers: services.driver.getDriverFilter(filter),
            users:
              field === 'email'
                ? services.security.getUserFilter(filter)
                : of(null),
          }),
        ),
        map(({ owners, drivers, users }) => {
          const matches = (candidate: any) =>
            CustomValidators.normalizeUniqueValue(field, candidate) === value;

          const ownerMatches: any[] = (owners?.data?.content ?? []).filter(
            (o: any) =>
              matches(o[field]) && !CustomValidators.sameId(o.id, ctx.ownerId),
          );
          const driverMatches: any[] = (drivers?.data?.content ?? []).filter(
            (d: any) =>
              matches(d[field]) && !CustomValidators.sameId(d.id, ctx.driverId),
          );

          // Registros espejo permitidos del propietario-conductor: desde el
          // propietario, cualquier conductor con sus datos; desde el conductor,
          // el propietario seleccionado cuando esta marcado como conductor.
          const mirrorDrivers =
            scope === 'owner' && ctx.isDriver ? driverMatches : [];
          const mirrorOwners =
            scope === 'driver'
              ? ownerMatches.filter(
                  (o: any) =>
                    o.isDriver &&
                    CustomValidators.sameId(o.id, ctx.linkedOwnerId),
                )
              : [];

          // El usuario de un registro espejo comparte el correo legitimamente.
          const allowedUserIds = new Set<number>();
          if (ctx.userId != null) allowedUserIds.add(Number(ctx.userId));
          for (const row of [...mirrorDrivers, ...mirrorOwners]) {
            if (row.user?.id != null) allowedUserIds.add(Number(row.user.id));
          }

          const userMatches: any[] =
            field === 'email'
              ? (users?.data?.content ?? []).filter(
                  (u: any) =>
                    matches(u.email) && !allowedUserIds.has(Number(u.id)),
                )
              : [];

          const isDuplicate =
            ownerMatches.length > mirrorOwners.length ||
            driverMatches.length > mirrorDrivers.length ||
            userMatches.length > 0;

          return isDuplicate ? { duplicate: true } : null;
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

  /**
   * Calculates password strength based on length, uppercase, numbers, and special characters.
   */
  static getPasswordStrength(password: string, minLength: number = 6): number {
    if (!password) return 0;
    let s = 0;
    if (password.length >= minLength) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  }

  /**
   * Returns a human-readable label for a given password strength value.
   */
  static getPasswordStrengthLabel(strength: number): string {
    if (strength === 0) return '';
    if (strength <= 1) return 'Débil';
    if (strength === 2) return 'Media';
    if (strength === 3) return 'Buena';
    return 'Fuerte';
  }
}
