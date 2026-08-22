import { useEffect, useState } from "react";
import { SectionCard } from "../../components/layout";
import {
  getTaskAssistantPreferences,
  updateTaskAssistantPreferences,
  type TaskAssistantPreferences,
} from "../../lib/tasksApi";
import { useLanguage } from "../../i18n/LanguageContext";

const toggles: [keyof TaskAssistantPreferences, string][] = [
  ["proactiveAssistanceEnabled", "proactiveAssistance"],
  ["dynamicPreparationEnabled", "dynamicPreparation"],
  ["dynamicPackingEnabled", "dynamicPacking"],
  ["contextTimelineEnabled", "contextTimeline"],
  ["contextualNotificationsEnabled", "contextualNotifications"],
  ["preparationChecklistsEnabled", "preparationChecklists"],
  ["travelAdviceEnabled", "travelAdvice"],
  ["weatherAdviceEnabled", "weatherAdvice"],
  ["documentAdviceEnabled", "documentAdvice"],
  ["clothingAdviceEnabled", "clothingAdvice"],
  ["umbrellaAdviceEnabled", "umbrellaAdvice"],
  ["hydrationAdviceEnabled", "hydrationAdvice"],
  ["electronicsAdviceEnabled", "electronicsAdvice"],
  ["medicationAdviceEnabled", "medicationAdvice"],
  ["departureRemindersEnabled", "departureReminders"],
];
export function WeatherTravelSettings({ token }: { token?: string }) {
  const { t } = useLanguage();
  const [value, setValue] = useState<TaskAssistantPreferences | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (token)
      void getTaskAssistantPreferences(token)
        .then(setValue)
        .catch(() => setStatus("settingsAssistant.loadFailed"));
  }, [token]);
  if (!token || !value)
    return (
      <SectionCard>
        <h3 className="text-sm font-black">{t("settingsAssistant.title")}</h3>
        <p className="mt-1 text-xs text-[var(--bp-muted)]">
          {status ? t(status) : t("settingsAssistant.loading")}
        </p>
      </SectionCard>
    );
  const set = <K extends keyof TaskAssistantPreferences>(
    key: K,
    next: TaskAssistantPreferences[K],
  ) => setValue({ ...value, [key]: next });
  const save = async () => {
    setStatus("settingsAssistant.saving");
    try {
      setValue(await updateTaskAssistantPreferences(token, value));
      setStatus("settingsAssistant.saved");
    } catch {
      setStatus("settingsAssistant.saveFailed");
    }
  };
  return (
    <SectionCard>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-black">{t("settingsAssistant.title")}</h3>
          <p className="mt-1 text-xs text-[var(--bp-muted)]">
            {t("settingsAssistant.description")}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold">
          {t("settingsAssistant.enabled")}
          <input
            aria-label={t("settingsAssistant.enableLabel")}
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
            label={t(`settingsAssistant.${label}`)}
            value={Boolean(value[key])}
            onChange={(next) => set(key, next as never)}
          />
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-bold text-[var(--bp-muted)]">
          {t("settingsAssistant.notificationTiming")}
          <select
            aria-label={t("settingsAssistant.notificationTiming")}
            className={input}
            value={value.notificationMode}
            onChange={(event) =>
              set("notificationMode", event.target.value as any)
            }
          >
            <option value="smart">{t("settingsAssistant.smartTiming")}</option>
            <option value="minimal">{t("settingsAssistant.minimalNotifications")}</option>
            <option value="important_only">{t("settingsAssistant.importantOnly")}</option>
          </select>
        </label>
        <label className="text-xs font-bold text-[var(--bp-muted)]">
          {t("settingsAssistant.defaultTravelMode")}
          <select
            className={input}
            value={value.defaultTravelMode}
            onChange={(event) =>
              set("defaultTravelMode", event.target.value as any)
            }
          >
            <option value="driving">{t("settingsAssistant.driving")}</option>
            <option value="walking">{t("settingsAssistant.walking")}</option>
            <option value="cycling">{t("settingsAssistant.cycling")}</option>
          </select>
        </label>
        <label className="text-xs font-bold text-[var(--bp-muted)]">
          {t("settingsAssistant.preferredLanguage")}
          <select
            className={input}
            value={value.language}
            onChange={(event) => set("language", event.target.value as any)}
          >
            <option value="en">{t("settingsAssistant.english")}</option>
            <option value="ar">{t("settingsAssistant.arabic")}</option>
          </select>
        </label>
      </div>
      <details className="mt-4 rounded-xl border border-[var(--bp-border)] p-3">
        <summary className="cursor-pointer text-xs font-black text-[var(--bp-muted)]">
          {t("settingsAssistant.advancedSettings")}
        </summary>
        <p className="mt-2 text-xs text-[var(--bp-muted)]">
          {t("settingsAssistant.advancedDescription")}
        </p>
      </details>
      <button
        type="button"
        onClick={() => void save()}
        className="mt-4 rounded-xl bg-[var(--bp-accent)] px-4 py-2 font-black text-[var(--bp-accent-text)]"
      >
        {t("settingsAssistant.save")}
      </button>
      <span aria-live="polite" className="ms-3 text-xs text-[var(--bp-muted)]">
        {status ? t(status) : null}
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
