import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CommonService } from '../../services/common.service';
import { SubscriptionService } from '../../services/subscription.service';
import { ToastService } from '../../services/toast.service';
import { SubscriptionQuote } from '../../models/subscription-model';
import { SubscriptionUtils } from '../../utils/subscription';
import {
  PAYMENT_METHODS,
  PaymentMethod,
  REPORTED_PAYMENT_METHOD,
  accountDigits,
} from '../../utils/payment-methods';

/** Lo mismo que acepta `/common/upload-document`. */
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

/** `spring.servlet.multipart.max-file-size` del backend. */
const MAX_FILE_SIZE_MB = 5;

/**
 * Renovar la suscripción: qué se paga, a dónde se transfiere y cómo se avisa.
 *
 * Los tres pasos van en un solo panel y en ese orden porque es el orden en que
 * ocurren: el propietario mira el total, sale a pagar por su aplicación de
 * banco y vuelve a mandar el soporte. Partirlo en pantallas obligaría a
 * volver a entrar justo en el momento en que ya pagó y solo quiere avisarlo.
 *
 * **No calcula el precio.** El total y su desglose llegan cotizados del
 * backend; aquí solo se pintan. Si la tarifa cambia, esta pantalla no se toca.
 */
@Component({
  selector: 'g-subscription-renew',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './g-subscription-renew.component.html',
  styleUrls: ['./g-subscription-renew.component.scss'],
})
export class GSubscriptionRenewComponent {
  @Input({ required: true }) quote: SubscriptionQuote | null = null;
  @Input({ required: true }) ownerId: number | null = null;

  /**
   * El vencimiento vigente, en `YYYY-MM-DD`.
   *
   * Lo resuelve la pantalla de atrás y no se saca de la cotización: el
   * catálogo de propietarios también lo trae, y si el endpoint de cotización
   * no lo mandara, el cálculo de abajo arrancaría en hoy y le comería al
   * propietario los días que le quedan.
   */
  @Input() currentEndDate: string | null = null;

  /**
   * El propietario viene del plan gratuito.
   *
   * Solo cambia cómo se titula el panel: quien nunca ha pagado no está
   * renovando nada, está activando su primer plan. El pago es el mismo.
   */
  @Input() isFree = false;

  /** `true` cuando se reportó un pago: la pantalla de atrás se recarga. */
  @Output() close = new EventEmitter<boolean>();

  public readonly methods: PaymentMethod[] = PAYMENT_METHODS;
  public readonly maxFileSizeMb = MAX_FILE_SIZE_MB;

  /* ---- Años ---------------------------------------------------------------
     Se puede renovar de uno en uno o dejar la suscripción pagada por varios.
     El tope son tres: más allá el propietario estaría pagando por adelantado
     una tarifa que puede cambiar antes de que llegue a usarla. */

  public readonly yearOptions = [1, 2, 3];

  /** Años elegidos. Uno por omisión, que es la renovación corriente. */
  public years = 1;

  /**
   * El desglose está desplegado.
   *
   * Arranca recogido: lo que hace falta para ir a pagar es el total, y el
   * concepto por concepto solo lo mira quien quiere verificar de dónde sale.
   * Con el panel ya cargado de pasos, dejarlo abierto empujaba los métodos de
   * pago fuera de la pantalla.
   */
  public showDetail = false;

  /** El formulario de comprobante está abierto. */
  public reporting = false;

  public reference = '';
  public selectedFile: File | null = null;
  public selectedFileName = '';
  public formError = '';
  public isSaving = false;

  constructor(
    private readonly commonService: CommonService,
    private readonly subscriptionService: SubscriptionService,
    private readonly toastService: ToastService,
  ) {}

  /* ======================================================================
     Plan
     ====================================================================== */

  /** Lo que vale un año, tal como lo cotizó el backend. */
  get annualTotal(): number {
    return this.quote?.total ?? 0;
  }

  /** Lo que se va a transferir: el año cotizado por los años elegidos. */
  get total(): number {
    return this.annualTotal * this.years;
  }

  /**
   * El renglón base del desglose, el que ya trae un vehículo incluido.
   *
   * La plantilla le añade esa nota. Sin ella el desglose se lee como si el
   * primer camión también se cobrara aparte, y la cuenta no cuadra: un
   * propietario con dos vehículos ve una suscripción y un adicional, no dos
   * adicionales.
   *
   * El concepto lo nombra el backend, así que se reconoce por su contenido y
   * no por igualdad exacta: el renglón base habla de suscripción y el otro,
   * del vehículo adicional.
   */
  public isBaseItem(concept: string): boolean {
    const texto = (concept ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();

    return texto.includes('suscrip') && !texto.includes('adicional');
  }

  public selectYears(years: number): void {
    this.years = years;
  }

  /** El vencimiento vigente, venga de donde venga. */
  private get endDate(): string | null {
    return this.currentEndDate ?? this.quote?.endDate ?? null;
  }

  /**
   * Hasta cuándo quedaría la suscripción.
   *
   * Se suma sobre el vencimiento vigente y no sobre hoy: renovar antes de
   * tiempo no puede costarle al propietario los días que aún no ha usado. Si
   * ya venció, el periodo nuevo arranca hoy, que es cuando se está pagando.
   */
  get newEndDate(): string | null {
    const vigente = this.endDate;
    const hoy = SubscriptionUtils.today();
    const base = vigente && vigente > hoy ? vigente : hoy;
    return SubscriptionUtils.addMonths(base, 12 * this.years);
  }

  /* ======================================================================
     Pago
     ====================================================================== */

  /**
   * Tocar la tarjeta: copia el número y abre la aplicación.
   *
   * En ese orden y sin esperar a que la copia termine. El portapapeles solo
   * atiende dentro del gesto del usuario, así que se pide primero; navegar
   * después no lo cancela, y si la aplicación no está instalada el número
   * queda copiado igual, que es lo mínimo que hacía falta.
   *
   * La aplicación solo se intenta abrir en celular: en escritorio no hay
   * ninguna y el navegador respondería con un error por un esquema que no
   * conoce.
   */
  public openMethodApp(method: PaymentMethod): void {
    this.copyNumber(method);

    if (method.appUrl && GSubscriptionRenewComponent.isMobile()) {
      globalThis.location.href = method.appUrl;
    }
  }

  /** Deja el número en el portapapeles y avisa. */
  private copyNumber(method: PaymentMethod): void {
    const numero = accountDigits(method);
    if (!numero) return;

    const avisar = () =>
      this.toastService.showSuccess(
        'Número copiado',
        `${numero} · pégalo en ${method.name} para transferir.`,
      );

    /* `clipboard` no existe fuera de contexto seguro ni en algunos WebView:
       de ahí el respaldo con el campo oculto, que es lo que funciona ahí. */
    const clipboard = globalThis.navigator?.clipboard;
    if (clipboard?.writeText) {
      clipboard.writeText(numero).then(avisar, () => {
        if (GSubscriptionRenewComponent.copyFallback(numero)) avisar();
      });
      return;
    }
    if (GSubscriptionRenewComponent.copyFallback(numero)) avisar();
  }

  /** Copia con un campo oculto. `execCommand` está obsoleto pero es el único
   *  camino cuando no hay API de portapapeles. */
  private static copyFallback(text: string): boolean {
    try {
      const campo = document.createElement('textarea');
      campo.value = text;
      campo.setAttribute('readonly', '');
      campo.style.position = 'fixed';
      campo.style.opacity = '0';
      document.body.appendChild(campo);
      campo.select();
      const copiado = document.execCommand('copy');
      document.body.removeChild(campo);
      return copiado;
    } catch {
      return false;
    }
  }

  private static isMobile(): boolean {
    return /android|iphone|ipad|ipod/i.test(
      globalThis.navigator?.userAgent ?? '',
    );
  }

  /* ======================================================================
     Comprobante
     ====================================================================== */

  public startReport(): void {
    this.reporting = true;
    this.formError = '';
  }

  public onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    /* El input se limpia siempre para que volver a elegir el mismo archivo
       después de un error dispare el change de nuevo. */
    input.value = '';
    if (!file) return;

    const extension = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      this.formError =
        'Formato no permitido. Se aceptan: ' + ALLOWED_EXTENSIONS.join(', ');
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      this.formError = `El archivo supera los ${MAX_FILE_SIZE_MB} MB permitidos.`;
      return;
    }

    this.selectedFile = file;
    this.selectedFileName = file.name;
    this.formError = '';
  }

  public removeFile(): void {
    this.selectedFile = null;
    this.selectedFileName = '';
  }

  get canSend(): boolean {
    return !!this.selectedFile && !this.isSaving;
  }

  /**
   * Sube el comprobante y reporta el pago.
   *
   * En dos pasos y en este orden: primero el archivo, que devuelve su URL, y
   * después el registro que la referencia. Si el registro falla, el archivo ya
   * está guardado y reintentar no vuelve a subir los cinco megas.
   *
   * El monto que se reporta es el cotizado, no uno escrito a mano: lo que el
   * administrador va a confirmar tiene que ser comparable con lo que la
   * plataforma cobró.
   */
  public async sendReceipt(): Promise<void> {
    if (!this.canSend || !this.ownerId || !this.selectedFile) {
      if (!this.selectedFile) this.formError = 'Adjunta el comprobante.';
      return;
    }

    this.isSaving = true;
    this.formError = '';

    try {
      const subida: any = await firstValueFrom(
        this.commonService.uploadDocument(
          this.selectedFile,
          this.selectedFileName,
        ),
      );
      const receiptUrl = subida?.data || null;
      if (!receiptUrl) {
        throw new Error('La carga del comprobante no devolvió la URL.');
      }

      await firstValueFrom(
        this.subscriptionService.registerPayment({
          ownerId: this.ownerId,
          years: this.years,
          amount: this.total,
          method: REPORTED_PAYMENT_METHOD,
          receiptUrl,
          reference: this.reference.trim() || null,
        }),
      );

      this.toastService.showSuccess(
        'Comprobante enviado',
        'Tu pago quedó en revisión. Te avisamos al confirmarlo.',
      );
      this.close.emit(true);
    } catch (error) {
      console.error('Error reportando el pago de la suscripción:', error);
      this.formError =
        'No se pudo enviar el comprobante. Revisa tu conexión e inténtalo de nuevo.';
    } finally {
      this.isSaving = false;
    }
  }

  public dismiss(): void {
    this.close.emit(false);
  }
}
