import { Injectable, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AutoUtils implements OnDestroy {
  private subscriptions: Subscription[] = [];
  public static indexName = 0;

  protected addSubscription(subscription: Subscription) {
    this.subscriptions.push(subscription);
  }

  protected addSubscriptions(subscriptions: Subscription[]) {
    for (let subscription of subscriptions) {
      this.subscriptions.push(subscription);
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    this.subscriptions = [];
    this.onExtendedDestroy();
  }

  protected onExtendedDestroy(): void {
    // Este método puede ser sobreescrito por clases derivadas para incluir su propia lógica de limpieza
  }

  /**
   * Permite comparar dos modelos
   * @param model1
   * @param model2
   * @returns
   */
  compareModel(model1: any, model2: any): boolean {
    return JSON.stringify(model1) !== JSON.stringify(model2);
  }

  /**
   * Formatea una palabra con la primera letra en mayuscula
   * @param value
   * @returns
   */
  capitalize(value: string): string {
    if (!value) return value;
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }

  getPartnerCode(): number {
    const urlParams = new URLSearchParams(window.location.search);
    const partnerCode = urlParams.get('pc');
    return partnerCode ? Number(partnerCode) : 0;
  }

  /**
   * @method getControlName: creates a generic name assigned to the form Control
   * @returns string
   */
  getControlName() {
    AutoUtils.indexName++;
    return `name-${new Date().getTime()}${new Date().getUTCMilliseconds()}-${
      AutoUtils.indexName
    }`;
  }

  /**
   * @method updateControlAndValidate: updates the states of the component's form group
   * @param formGroup Component's form group
   * @param controlName Control name
   */
  updateControlAndValidate(formGroup: any, controlName: any) {
    setTimeout(() => {
      if (formGroup && formGroup.get(controlName)) {
        formGroup.controls[controlName].updateValueAndValidity();
      }
    });
  }

  /**
   * Formate date
   * @param date
   * @returns
   */
  formatDate(date: any) {
    const opciones: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    };
    const formateador = new Intl.DateTimeFormat('es-CO', opciones);
    return formateador.format(date);
  }

  /**
   * Format date for set input
   * @param date
   * @returns
   */
  formatDateSet(date: any) {
    const opciones: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    };
    const formateador = new Intl.DateTimeFormat('en-CA', opciones);
    const fechaFormateada = formateador.format(date);
    return fechaFormateada.replace(',', '');
  }
}
