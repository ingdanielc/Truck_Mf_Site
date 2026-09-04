import { cityCountry, locationQuery } from './city-geo';

/** La consulta que armaban las pantallas antes de este cambio. */
const anterior = (base: string) => `${base}, Colombia`;

describe('city-geo', () => {
  describe('no cambia nada en las ciudades colombianas', () => {
    const casos: { base: string; city: any }[] = [
      { base: 'Bogotá', city: { name: 'Bogotá', state: 'Cundinamarca' } },
      { base: 'Ipiales', city: { name: 'Ipiales', state: 'Nariño' } },
      // El mapa arma el texto con el departamento incluido
      {
        base: 'Ipiales, Nariño',
        city: { name: 'Ipiales', state: 'Nariño' },
      },
      // Nombres compuestos o con separadores: se mandan tal cual, como antes
      {
        base: 'San Vicente - Ferrer',
        city: { name: 'San Vicente - Ferrer', state: 'Antioquia' },
      },
      {
        base: 'Bogotá, D.C.',
        city: { name: 'Bogotá, D.C.', state: 'Cundinamarca' },
      },
      // Municipio homónimo de un país: sigue siendo colombiano
      {
        base: 'La Argentina',
        city: { name: 'La Argentina', state: 'Huila' },
      },
      // El catálogo dice Colombia de forma explícita
      {
        base: 'Ipiales',
        city: { name: 'Ipiales', state: 'Nariño', country: 'Colombia' },
      },
      // Un campo de país con un id no dice nada: se ignora
      {
        base: 'Ipiales',
        city: { name: 'Ipiales', state: 'Nariño', country: 57 },
      },
      {
        base: 'Ipiales',
        city: { name: 'Ipiales', state: 'Nariño', countryCode: '170' },
      },
      // Sin registro de ciudad, como cuando el catálogo aún no cargó
      { base: 'N/A', city: undefined },
      { base: '123', city: undefined },
    ];

    for (const { base, city } of casos) {
      it(`"${base}" se consulta igual que antes`, () => {
        expect(locationQuery(base, city)).toBe(anterior(base));
      });
    }
  });

  describe('corrige solo las ciudades de otro país', () => {
    it('con el país pegado al nombre', () => {
      const city = { name: 'Tulcan Ecuador' };
      expect(locationQuery('Tulcan Ecuador', city)).toBe('Tulcan, Ecuador');
    });

    it('con el país separado del nombre', () => {
      expect(locationQuery('Tulcán', { name: 'Tulcán - Ecuador' })).toBe(
        'Tulcán, Ecuador',
      );
      expect(locationQuery('Tulcán', { name: 'Tulcán, Ecuador' })).toBe(
        'Tulcán, Ecuador',
      );
    });

    // Asi esta guardada Tulcan en el catalogo: el pais va en el departamento
    it('con el país en el departamento', () => {
      const city = { name: 'Tulcán', state: 'Ecuador' };
      // El formulario y el detalle mandan solo el nombre
      expect(locationQuery('Tulcán', city)).toBe('Tulcán, Ecuador');
      // El mapa manda el nombre con el departamento
      expect(locationQuery('Tulcán, Ecuador', city)).toBe('Tulcán, Ecuador');
    });

    it('con el país en su propio campo, incluso en ISO', () => {
      const city = { name: 'Tulcán', state: 'Carchi', country: 'EC' };
      expect(locationQuery('Tulcán, Carchi', city)).toBe(
        'Tulcán, Carchi, Ecuador',
      );
    });

    it('conserva la provincia que venga en el nombre', () => {
      const city = { name: 'Tulcán - Carchi - Ecuador' };
      expect(locationQuery('Tulcán', city)).toBe('Tulcán, Ecuador');
      expect(locationQuery('Tulcán - Carchi - Ecuador', city)).toBe(
        'Tulcán, Carchi, Ecuador',
      );
    });

    it('acepta el país como objeto del catálogo', () => {
      const city = {
        name: 'Tulcán',
        state: 'Carchi',
        country: { name: 'Ecuador' },
      };
      expect(locationQuery('Tulcán, Carchi', city)).toBe(
        'Tulcán, Carchi, Ecuador',
      );
    });

    it('acepta un país que no está en la lista', () => {
      const city = { name: 'Iquitos', country: 'Estados Unidos' };
      expect(locationQuery('Iquitos', city)).toBe('Iquitos, Estados Unidos');
    });

    it('resuelve por el nombre cuando no hay registro de ciudad', () => {
      expect(locationQuery('Tulcan Ecuador')).toBe('Tulcan, Ecuador');
      expect(locationQuery('Tulcán (Ecuador)')).toBe('Tulcán, Ecuador');
    });
  });

  describe('cityCountry', () => {
    it('devuelve null cuando la ciudad no nombra ningún país', () => {
      expect(cityCountry({ name: 'Ipiales', state: 'Nariño' })).toBeNull();
      expect(cityCountry(null)).toBeNull();
    });

    it('devuelve el país cuando la ciudad lo nombra', () => {
      expect(cityCountry({ name: 'Tulcan Ecuador' })).toBe('Ecuador');
      expect(cityCountry({ name: 'Tulcán', state: 'Ecuador' })).toBe('Ecuador');
    });
  });

  it('sin texto no hay consulta', () => {
    expect(locationQuery('')).toBe('');
    expect(locationQuery('   ', { name: 'Tulcan Ecuador' })).toBe('');
  });
});
