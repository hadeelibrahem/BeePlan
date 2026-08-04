import { useEffect, useState } from "react";
import { SectionCard } from "../../components/layout";
import {
  getTaskAssistantPreferences,
  updateTaskAssistantPreferences,
  type TaskAssistantPreferences,
} from "../../lib/tasksApi";

const toggles: [keyof TaskAssistantPreferences, string][] = [
  ["proactiveAssistanceEnabled", "Proactive assistance"],
  ["dynamicPreparationEnabled", "Dynamic preparation lists"],
  ["dynamicPackingEnabled", "Dynamic packing lists"],
  ["contextTimelineEnabled", "Context timeline"],
  ["contextualNotificationsEnabled", "Contextual notifications"],
  ["preparationChecklistsEnabled", "Preparation checklists"],
  ["travelAdviceEnabled", "Travel and departure advice"],
  ["weatherAdviceEnabled", "Weather advice"],
  ["documentAdviceEnabled", "Document reminders"],
  ["clothingAdviceEnabled", "Clothing suggestions"],
  ["umbrellaAdviceEnabled", "Umbrella reminders"],
  ["hydrationAdviceEnabled", "Hydration reminders"],
  ["electronicsAdviceEnabled", "Electronics"],
  ["medicationAdviceEnabled", "Medication"],
  ["departureRemindersEnabled", "Departure reminders"],
];
export function WeatherTravelSettings({ token }: { token?: string }) {
  const [value, setValue] = useState<TaskAssistantPreferences | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (token)
      void getTaskAssistantPreferences(token)
        .then(setValue)
        .catch(() => setStatus("Could not load settings."));
  }, [token]);
  if (!token || !value)
    return (
      <SectionCard>
        <h3 className="text-sm font-black">Task Context Assistant</h3>
        <p className="mt-1 text-xs text-[var(--bp-muted)]">
          {status || "Loading settings…"}
        </p>
      </SectionCard>
    );
  const set = <K extends keyof TaskAssistantPreferences>(
    key: K,
    next: TaskAssistantPreferences[K],
  ) => setValue({ ...value, [key]: next });
  const save = async () => {
    setStatus("Saving…");
    try {
      setValue(await updateTaskAssistantPreferences(token, value));
      setStatus("Saved");
    } catch {
      setStatus("Could not save settings.");
    }
  };
  return (
    <SectionCard>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-black">Task Context Assistant</h3>
          <p className="mt-1 text-xs text-[var(--bp-muted)]">
            Relevant preparation, travel, and weather guidance for each task.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold">
          Enabled
          <input
            aria-label="Enable Task Context Assistant"
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => set("enabled", event.target.checked)}
          />
        </label>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {toggles.map(([key, label]) => (
          <Toggle
            key={key}
            label={label}
            value={Boolean(value[key])}
            onChange={(next) => set(key, next as never)}
          />
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-bold text-[var(--bp-muted)]">
          Notification timing
          <select
            aria-label="Notification timing"
            className={input}
            value={value.notificationMode}
            onChange={(event) =>
              set("notificationMode", event.target.value as any)
            }
          >
            <option value="smart">Smart timing</option>
            <option value="minimal">Minimal notifications</option>
            <option value="important_only">Important only</option>
          </select>
        </label>
        <label className="text-xs font-bold text-[var(--bp-muted)]">
          Default travel mode
          <select
            className={input}
            value={value.defaultTravelMode}
            onChange={(event) =>
              set("defaultTravelMode", event.target.value as any)
            }
          >
            <option value="driving">Driving</option>
            <option value="walking">Walking</option>
            <option value="cycling">Cycling</option>
          </select>
        </label>
        <label className="text-xs font-bold text-[var(--bp-muted)]">
          Preferred language
          <select
            className={input}
            value={value.language}
            onChange={(event) => set("language", event.target.value as any)}
          >
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </label>
      </div>
      <details className="mt-4 rounded-xl border border-[var(--bp-border)] p-3">
        <summary className="cursor-pointer text-xs font-black text-[var(--bp-muted)]">
          Advanced Settings
        </summary>
        <p className="mt-2 text-xs text-[var(--bp-muted)]">
          Weather thresholds, provider caches, routing fallbacks, and location
          freshness continue to use the existing safe Weather &amp; Travel
          defaults.
        </p>
      </details>
      <button
        type="button"
        onClick={() => void save()}
        className="mt-4 rounded-xl bg-[var(--bp-accent)] px-4 py-2 font-black text-[var(--bp-accent-text)]"
      >
        Save Task Assistant
      </button>
      <span aria-live="polite" className="ms-3 text-xs text-[var(--bp-muted)]">
        {status}
      </span>
    </SectionCard>
  );
}
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--bp-border)] p-3 text-sm font-bold">
      {label}
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
const input =
  "mt-1 w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2 text-[var(--bp-text)]";
