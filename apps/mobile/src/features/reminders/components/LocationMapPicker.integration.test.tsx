import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'LocationMapPicker.tsx'), 'utf8');

describe('location map fallback', () => {
  it('uses an in-memory Geoapify Leaflet map without native Google Maps', () => {
    expect(source).toContain('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    expect(source).toContain('getTileLayerUrl');
    expect(source).not.toContain('react-native-maps');
    expect(source).toContain('Map is temporarily unavailable');
    expect(source).toContain('setMapRequested(true)');
    expect(source).toContain('onShouldStartLoadWithRequest');
  });

  it('keeps map selection coordinates in the existing callback contract', () => {
    expect(source).toContain('postMessage(JSON.stringify({ type: \'location\'' );
    expect(source).toContain('Number.isFinite(next.latitude)');
    expect(source).toContain('reverseGeocode(next.latitude, next.longitude)');
    expect(source).toContain('onMapPick(selected)');
  });
});
