import fs from "node:fs";
import path from "node:path";
import en from "./locales/en.json";
import ar from "./locales/ar.json";
const screenFiles = ["../screens/FocusScreen.tsx", "../screens/FocusSessionScreen.tsx", "../screens/FocusRoomsScreen.tsx", "../features/focus/StrictModeSetupSheet.tsx"];
function resolve(dictionary: unknown, key: string): unknown { return key.split(".").reduce<unknown>((value, part) => value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined, dictionary); }
function referencedKeys(source: string): string[] { return [...source.matchAll(/\bt\(\s*["']([^"']+)["']/g)].map((match) => match[1]); }
describe("Mobile Focus translation usage", () => {
  it("resolves every production Focus-family translation key in both locales", () => {
    const missing: string[] = [];
    for (const relativeFile of screenFiles) {
      const file = path.resolve(__dirname, relativeFile);
      const source = fs.readFileSync(file, "utf8");
      const keys = new Set(referencedKeys(source));
      if (source.includes("t(AGREEMENT_KEY)")) keys.add("sharedFocus.acceptAgreement");
      if (source.includes("focusUi.sound.")) for (const soundKey of ["Nature", "Environment", "Noise", "Relax", "rain", "heavy-rain", "thunder", "forest", "birds", "ocean-waves", "river", "coffee-shop", "library", "fireplace", "fan", "white-noise", "brown-noise", "pink-noise", "meditation", "soft-piano", "ambient", "lofi"]) keys.add(`focusUi.sound.${soundKey}`);
      for (const key of keys) if (typeof resolve(en, key) !== "string" || typeof resolve(ar, key) !== "string") missing.push(`${path.basename(file)}: ${key}`);
    }
    expect(missing).toEqual([]);
  });
});
