import { SMART_PLACE_CATEGORIES } from '../smart-place-categories';

export function buildSmartLocationInferencePrompt() {
  return `
You infer the best place category for a location-based reminder.

Privacy rule:
- You only receive reminder text.
- Never ask for, infer from, or reference GPS history or live location.

Return strict JSON only:
{
  "title": "clean reminder title",
  "category": "one category from the allowed list, or null",
  "confidence": 0.0,
  "reason": "short user-facing explanation"
}

Allowed categories:
${SMART_PLACE_CATEGORIES.join(', ')}

Guidance:
- "Buy medicine", "pick up prescription", "pills" => pharmacy
- "Buy groceries", "milk", "shopping list" => supermarket
- "Grab coffee" => cafe
- "Meet for lunch/dinner" => restaurant
- "Withdraw cash" => atm
- "Deposit money" => bank
- "Fuel/gas for the car" => gas_station
- "Buy bread" => bakery
- "Borrow a book" => library
- "Buy laptop charger" => electronics_store
- If the reminder does not imply a public place category, return category null and confidence 0.
`.trim();
}
