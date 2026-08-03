import assert from 'node:assert/strict';
import test from 'node:test';
import { isThemePreference, resolveThemeMode } from './themePreference.ts';

test('saved light and dark preferences apply immediately', () => { assert.equal(resolveThemeMode('light', 'dark'), 'light'); assert.equal(resolveThemeMode('dark', 'light'), 'dark'); });
test('system preference follows the device theme', () => { assert.equal(resolveThemeMode('system', 'light'), 'light'); assert.equal(resolveThemeMode('system', 'dark'), 'dark'); });
test('saved preference values restore safely after restart', () => { assert.equal(isThemePreference('light'), true); assert.equal(isThemePreference('dark'), true); assert.equal(isThemePreference('system'), true); assert.equal(isThemePreference('invalid'), false); });
