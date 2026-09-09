import { ModelTrip } from '../models/trip-model';
import {
  CANCELLED_TRIP_STATUS,
  applyTripStatusChange,
  canCancelTrip,
  canChangeTripStatus,
  canSetTripStatus,
  excludeCancelledFilter,
  isCancelledTrip,
  statusNeedsConfirmation,
  tripStatusConfirmation,
} from './trip-status';

const viaje = (extra: Partial<ModelTrip> = {}): ModelTrip =>
  ({
    id: 1,
    status: 'En Curso',
    originId: '1',
    destinationId: '2',
    freight: 100,
    manifestNumber: 'M-1',
    advancePayment: 0,
    balance: 0,
    ...extra,
  }) as ModelTrip;

describe('trip-status', () => {
  describe('isCancelledTrip', () => {
    it('reconoce las variantes que devuelve el backend', () => {
      ['Cancelado', 'CANCELADO', 'cancelado', 'Cancelled', 'CANCELLED'].forEach(
        (estado) => {
          expect(isCancelledTrip(estado)).withContext(estado).toBeTrue();
        },
      );
    });

    it('no marca de baja los estados vivos', () => {
      ['En Curso', 'Completado', 'Pendiente', 'Planeado', ''].forEach(
        (estado) => {
          expect(isCancelledTrip(estado)).withContext(estado).toBeFalse();
        },
      );
    });

    /* Los contadores llaman a esto sobre viajes recien llegados de la API, y
       un viaje sin estado no es una baja logica. */
    it('trata la ausencia de estado como viaje vivo', () => {
      expect(isCancelledTrip(undefined)).toBeFalse();
      expect(isCancelledTrip(null)).toBeFalse();
    });
  });

  describe('excludeCancelledFilter', () => {
    it('arma la exclusion que entiende /trip/filter', () => {
      const filtro = excludeCancelledFilter();

      expect(filtro.fieldFilter).toBe('status');
      expect(filtro.compFilter).toBe('!=');
      expect(filtro.valueFilter).toBe(CANCELLED_TRIP_STATUS);
    });

    /* Se mete en arreglos que se comparten con `[...filtros, ...]`: si
       devolviera siempre la misma instancia, un cambio en una consulta se
       arrastraria a las otras. */
    it('devuelve una instancia nueva en cada llamada', () => {
      expect(excludeCancelledFilter()).not.toBe(excludeCancelledFilter());
    });
  });
});

describe('statusNeedsConfirmation', () => {
  it('pregunta al completar y al cancelar', () => {
    expect(statusNeedsConfirmation('En Curso', 'Completado')).toBeTrue();
    expect(statusNeedsConfirmation('En Curso', 'Cancelado')).toBeTrue();
    expect(statusNeedsConfirmation('Pendiente', 'Cancelado')).toBeTrue();
  });

  /* Devolver a "Pendiente" un viaje completado deshace un cobro: el saldo que
     estaba dado por recibido vuelve a deberse y reaparece en el reporte de
     saldos. Desde "En Curso" no hay nada que deshacer. */
  it('pregunta al devolver a pendiente un viaje ya cobrado', () => {
    expect(statusNeedsConfirmation('Completado', 'Pendiente')).toBeTrue();
  });

  it('no pregunta por los cambios que se deshacen solos', () => {
    expect(statusNeedsConfirmation('Cancelado', 'En Curso')).toBeFalse();
    expect(statusNeedsConfirmation('En Curso', 'Pendiente')).toBeFalse();
  });

  /* El diálogo salta con el cambio, no con el estado: reafirmar el que ya
     tiene no es una decisión nueva. */
  it('no pregunta si el viaje ya está en ese estado', () => {
    expect(statusNeedsConfirmation('Completado', 'Completado')).toBeFalse();
    expect(statusNeedsConfirmation('Cancelado', 'Cancelado')).toBeFalse();
  });
});

describe('tripStatusConfirmation', () => {
  it('da un texto distinto a cada cambio', () => {
    expect(tripStatusConfirmation('En Curso', 'Completado')?.kind).toBe(
      'completar',
    );
    expect(tripStatusConfirmation('En Curso', 'Cancelado')?.kind).toBe(
      'cancelar',
    );
    expect(tripStatusConfirmation('Completado', 'Pendiente')?.kind).toBe(
      'reabrir',
    );
  });

  it('no da diálogo para los cambios que no se preguntan', () => {
    expect(tripStatusConfirmation('En Curso', 'Pendiente')).toBeNull();
    expect(tripStatusConfirmation('Completado', 'Completado')).toBeNull();
  });

  /* Los dos sitios que confirman leen de aquí: si el texto viniera vacío, la
     hoja saldría sin decir qué se está aceptando. */
  it('nombra siempre la acción', () => {
    const dialogo = tripStatusConfirmation('Completado', 'Pendiente');
    expect(dialogo?.title.length).toBeGreaterThan(0);
    expect(dialogo?.message.length).toBeGreaterThan(0);
    expect(dialogo?.confirmLabel.length).toBeGreaterThan(0);
  });
});

describe('canChangeTripStatus', () => {
  it('cierra el estado de un viaje completado solo al conductor', () => {
    expect(canChangeTripStatus('Completado', 'CONDUCTOR')).toBeFalse();
    expect(canChangeTripStatus('Completado', 'PROPIETARIO')).toBeTrue();
    expect(canChangeTripStatus('Completado', 'ADMINISTRADOR')).toBeTrue();
  });

  /* Quien no puede cancelar tampoco descancela: de lo contrario el conductor
     saltaria la restriccion en dos pasos, sacando el viaje de Cancelado y
     dejandolo donde quisiera. */
  it('cierra el viaje dado de baja a quien no puede darlo de baja', () => {
    expect(canChangeTripStatus('Cancelado', 'CONDUCTOR')).toBeFalse();
    expect(canChangeTripStatus('CANCELLED', 'CONDUCTOR')).toBeFalse();
    expect(canChangeTripStatus('Cancelado', 'PROPIETARIO')).toBeTrue();
    expect(canChangeTripStatus('Cancelado', 'ADMINISTRADOR')).toBeTrue();
  });

  it('deja cambiar el resto de estados a cualquiera', () => {
    expect(canChangeTripStatus('En Curso', 'CONDUCTOR')).toBeTrue();
    expect(canChangeTripStatus('Pendiente', 'CONDUCTOR')).toBeTrue();
  });
});

describe('applyTripStatusChange', () => {
  const ahora = new Date('2026-03-10T15:00:00.000Z');

  it('no toca el viaje recibido', () => {
    const original = viaje();
    const resultado = applyTripStatusChange(original, 'Completado', ahora);

    expect(original.status).toBe('En Curso');
    expect(resultado).not.toBe(original);
    expect(resultado.status).toBe('Completado');
  });

  it('da el saldo por pagado al completar y lo retira al dejar pendiente', () => {
    expect(
      applyTripStatusChange(viaje(), 'Completado', ahora).paidBalance,
    ).toBeTrue();
    expect(
      applyTripStatusChange(viaje({ paidBalance: true }), 'Pendiente', ahora)
        .paidBalance,
    ).toBeFalse();
  });

  it('deja el saldo como estaba al cancelar o al reabrir', () => {
    expect(
      applyTripStatusChange(viaje({ paidBalance: true }), 'Cancelado', ahora)
        .paidBalance,
    ).toBeTrue();
    expect(
      applyTripStatusChange(viaje({ paidBalance: true }), 'En Curso', ahora)
        .paidBalance,
    ).toBeTrue();
  });

  it('cierra el viaje con la fecha del momento y cuenta los días', () => {
    const resultado = applyTripStatusChange(
      viaje({ startDate: '2026-03-08T15:00:00.000Z' }),
      'Completado',
      ahora,
    );

    expect(resultado.endDate).toBe(ahora.toISOString());
    expect(resultado.numberOfDays).toBe(2);
  });

  /* La llegada ya registrada no se reescribe: ni al dar de baja un viaje que
     sí llegó, ni al mover a Pendiente uno ya cerrado. Es lo mismo que hace el
     detalle, donde el campo de fecha se rellena con la que trae el viaje. */
  ['Cancelado', 'Pendiente', 'Completado'].forEach((estado) => {
    it(`respeta la fecha de fin que ya tuviera al pasar a ${estado}`, () => {
      const resultado = applyTripStatusChange(
        viaje({
          status: 'Completado',
          startDate: '2026-03-08T15:00:00.000Z',
          endDate: '2026-03-09T15:00:00.000Z',
        }),
        estado,
        ahora,
      );

      expect(resultado.endDate).toBe('2026-03-09T15:00:00.000Z');
      expect(resultado.numberOfDays).toBe(1);
    });
  });

  it('pone la fecha de fin cuando el viaje no la tenía', () => {
    ['Cancelado', 'Completado', 'Pendiente'].forEach((estado) => {
      expect(applyTripStatusChange(viaje(), estado, ahora).endDate)
        .withContext(estado)
        .toBe(ahora.toISOString());
    });
  });

  /* Volver a poner el viaje en ruta no lo cierra: si fijara fecha de fin, el
     viaje reabierto nacería terminado. */
  it('no cierra el viaje al devolverlo a En Curso', () => {
    const resultado = applyTripStatusChange(viaje(), 'En Curso', ahora);
    expect(resultado.endDate).toBeUndefined();
    expect(resultado.numberOfDays).toBeUndefined();
  });

  /* Un viaje que empieza y acaba el mismo día es un día, no cero. */
  it('nunca deja el viaje en cero días', () => {
    const resultado = applyTripStatusChange(
      viaje({ startDate: ahora.toISOString() }),
      'Completado',
      ahora,
    );
    expect(resultado.numberOfDays).toBe(1);
  });
});

describe('canCancelTrip', () => {
  it('deja dar de baja al propietario y al administrador', () => {
    expect(canCancelTrip('PROPIETARIO')).toBeTrue();
    expect(canCancelTrip('ADMINISTRADOR')).toBeTrue();
  });

  /* El conductor gestiona el viaje, pero darlo de baja lo saca de las cifras
     del propietario: esa decisión no es suya. */
  it('no deja dar de baja al conductor', () => {
    expect(canCancelTrip('CONDUCTOR')).toBeFalse();
    expect(canCancelTrip('ROL')).toBeFalse();
    expect(canCancelTrip('')).toBeFalse();
  });
});

describe('canSetTripStatus', () => {
  it('solo restringe el estado cancelado', () => {
    ['En Curso', 'Completado', 'Pendiente'].forEach((estado) => {
      expect(canSetTripStatus(estado, 'CONDUCTOR'))
        .withContext(estado)
        .toBeTrue();
    });
  });

  it('cierra el cancelado al conductor y lo abre a los demás', () => {
    expect(canSetTripStatus('Cancelado', 'CONDUCTOR')).toBeFalse();
    expect(canSetTripStatus('Cancelado', 'PROPIETARIO')).toBeTrue();
    expect(canSetTripStatus('Cancelado', 'ADMINISTRADOR')).toBeTrue();
  });

  /* El backend devuelve las dos formas; si solo se reconociera una, el
     conductor tendría la mitad del camino abierto. */
  it('reconoce la variante en inglés', () => {
    expect(canSetTripStatus('CANCELLED', 'CONDUCTOR')).toBeFalse();
  });
});
