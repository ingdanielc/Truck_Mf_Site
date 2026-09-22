import { phoneDigits } from './clipboard';

describe('phoneDigits', () => {
  it('quita los espacios con que se muestra el celular', () => {
    expect(phoneDigits('300 123 45 67')).toBe('3001234567');
  });

  it('quita guiones y paréntesis', () => {
    expect(phoneDigits('(601) 555-1234')).toBe('6015551234');
  });

  /* El indicativo importa al pegarlo en WhatsApp: sin el `+` el número deja de
     ser internacional. */
  it('conserva el + del país', () => {
    expect(phoneDigits('+57 300 123 45 67')).toBe('+573001234567');
  });

  it('devuelve vacío cuando no hay número', () => {
    expect(phoneDigits(null)).toBe('');
    expect(phoneDigits(undefined)).toBe('');
    expect(phoneDigits('  ')).toBe('');
  });
});
