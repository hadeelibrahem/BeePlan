import { isHomeOriginCandidate } from './home-origin';

describe('saved Home origin compatibility', () => {
  it('accepts a legacy place named home with valid coordinates', () => {
    expect(isHomeOriginCandidate({ name: 'home', category: null, latitude: '32.2366061', longitude: '35.2407483' })).toBe(true);
  });
  it('accepts semantic home regardless of category casing', () => {
    expect(isHomeOriginCandidate({ name: 'Apartment', category: 'Home', latitude: 32.2, longitude: 35.2 })).toBe(true);
  });
  it('does not treat unrelated names or invalid coordinates as Home', () => {
    expect(isHomeOriginCandidate({ name: 'University', category: null, latitude: 32.2, longitude: 35.2 })).toBe(false);
    expect(isHomeOriginCandidate({ name: 'home', category: null, latitude: 200, longitude: 35.2 })).toBe(false);
  });
});
