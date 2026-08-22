import { useEffect, useState, type InputHTMLAttributes } from "react";
import { ConfirmDestructiveModal } from "../../components/ConfirmDestructiveModal";
import {
  DangerButton,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from "../../components/layout";
import type { AuthUser } from "../../lib/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { changePassword, deleteAccount, updateProfile } from "./settings.api";
import { validatePassword } from "./settingsValidation";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "../../lib/notificationPreferencesApi";

const fieldClass =
  "w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]";
function Field({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  if (label === "Timezone") return null;
  return (
    <label className="space-y-1">
      <span className="text-xs font-bold text-[var(--bp-muted)]">{label}</span>
      <input className={fieldClass} {...props} />
    </label>
  );
}
function Status({ value }: { value: { ok: boolean; text: string } | null }) {
  return value ? (
    <p
      role="status"
      className={`mt-3 text-xs font-bold ${value.ok ? "text-emerald-400" : "text-red-400"}`}
    >
      {value.text}
    </p>
  ) : null;
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--bp-border)]/60 py-3 last:border-0">
      <span className="text-sm font-bold">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full ${checked ? "bg-[var(--bp-accent)]" : "bg-[var(--bp-border)]"}`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${checked ? "left-6" : "left-1"}`}
        />
      </button>
    </div>
  );
}

export function AccountSettings({
  user,
  token,
  onUpdated,
}: {
  user: AuthUser | null;
  token?: string;
  onUpdated: (user: AuthUser) => void;
}) {
  const { t } = useLanguage();
  const [profile, setProfile] = useState({
    fullName: user?.fullName ?? "",
    email: user?.email ?? "",
    avatarUrl: user?.avatarUrl ?? "",
  });
  const [password, setPassword] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [profileStatus, setProfileStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  useEffect(
    () =>
      setProfile({
        fullName: user?.fullName ?? "",
        email: user?.email ?? "",
        avatarUrl: user?.avatarUrl ?? "",
      }),
    [user],
  );
  const social = user?.authProvider !== "password";
  async function saveProfile() {
    if (
      !token ||
      !profile.fullName.trim() ||
      !/^\S+@\S+\.\S+$/.test(profile.email)
    )
      return setProfileStatus({
        ok: false,
        text: t("settingsErrors.invalidProfile"),
      });
    setSaving(true);
    try {
      onUpdated(
        await updateProfile(token, {
          ...profile,
          avatarUrl: profile.avatarUrl || null,
          timezone: user?.timezone ?? "UTC",
        }),
      );
      setProfileStatus({ ok: true, text: t("settingsErrors.profileSaved") });
    } catch (error) {
      setProfileStatus({
        ok: false,
        text:
          error instanceof Error ? t("settingsErrors.saveFailed") : t("settingsErrors.saveFailed"),
      });
    } finally {
      setSaving(false);
    }
  }
  async function savePassword() {
    const error = validatePassword(password.next);
    if (!password.current || error || password.next !== password.confirm)
      return setPasswordStatus({
        ok: false,
        text: !password.current
          ? t("settingsErrors.currentPasswordRequired")
          : error || t("settingsErrors.passwordMismatch"),
      });
    if (!token) return;
    setChanging(true);
    try {
      await changePassword(token, password.current, password.next);
      setPassword({ current: "", next: "", confirm: "" });
      setPasswordStatus({ ok: true, text: t("settingsErrors.passwordChanged") });
    } catch (cause) {
      setPasswordStatus({
        ok: false,
        text:
          cause instanceof Error ? t("settingsErrors.passwordFailed") : t("settingsErrors.passwordFailed"),
      });
    } finally {
      setChanging(false);
    }
  }
  return (
    <SectionCard>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bp-accent-soft)] text-lg font-black text-[var(--bp-accent-ink)]">
          {(profile.fullName[0] ?? "?").toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-black">
            {profile.fullName || t("settingsUi.profile")}
          </p>
          <p className="truncate text-xs text-[var(--bp-muted)]">
            {profile.email}
          </p>
        </div>
      </div>
      <div className="mt-3 divide-y divide-[var(--bp-border)]">
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-bold">{t("settingsUi.profile")}</p>
            <p className="text-xs text-[var(--bp-muted)]">
              {profile.fullName || t("settingsUi.fullName")}
            </p>
          </div>
          <button
            type="button"
            className="text-xs font-black text-[var(--bp-accent-ink)]"
            onClick={() =>
              document.getElementById("profile-editor")?.toggleAttribute("open")
            }
          >
            {t("settingsUi.edit")}
          </button>
        </div>
        <div className="py-3">
          <p className="text-sm font-bold">{t("settingsUi.email")}</p>
          <p className="truncate text-xs text-[var(--bp-muted)]">
            {profile.email}
          </p>
        </div>
        <div className="py-3">
          <p className="text-sm font-bold">{t("settingsUi.password")}</p>
          <p className="text-xs text-[var(--bp-muted)]">
            {social ? "Managed by your sign-in provider" : "••••••••"}
          </p>
        </div>
        <div className="py-3">
          <p className="text-sm font-bold">{t("settingsUi.connectedGoogle")}</p>
          <p className="text-xs text-[var(--bp-muted)]">
            {t("settingsUi.manageIntegrations")}
          </p>
        </div>
      </div>
      <details
        id="profile-editor"
        className="mt-3 rounded-xl border border-[var(--bp-border)] p-3"
      >
        <summary className="cursor-pointer text-xs font-black text-[var(--bp-muted)]">
          {t("settingsUi.editProfile")}
        </summary>
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("settingsUi.fullName")}
              value={profile.fullName}
              onChange={(e) =>
                setProfile({ ...profile, fullName: e.target.value })
              }
            />
            <Field
              label={t("settingsUi.email")}
              type="email"
              value={profile.email}
              onChange={(e) =>
                setProfile({ ...profile, email: e.target.value })
              }
            />
            <Field
              label={t("settingsUi.photoUrl")}
              type="url"
              value={profile.avatarUrl}
              onChange={(e) =>
                setProfile({ ...profile, avatarUrl: e.target.value })
              }
            />
          </div>
          <PrimaryButton loading={saving} onClick={saveProfile}>
            {t("settingsUi.saveProfile")}
          </PrimaryButton>
          <Status value={profileStatus} />
          <div className="border-t border-[var(--bp-border)] pt-3">
            <p className="mb-3 text-xs text-[var(--bp-muted)]">
              {social
                ? "Password is managed by your social sign-in provider."
                : "Use at least 8 characters with uppercase, lowercase, number, and symbol."}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
              label={t("settingsUi.currentPassword")}
                type="password"
                disabled={social}
                value={password.current}
                onChange={(e) =>
                  setPassword({ ...password, current: e.target.value })
                }
              />
              <Field
              label={t("settingsUi.newPassword")}
                type="password"
                disabled={social}
                value={password.next}
                onChange={(e) =>
                  setPassword({ ...password, next: e.target.value })
                }
              />
              <Field
              label={t("settingsUi.confirmPassword")}
                type="password"
                disabled={social}
                value={password.confirm}
                onChange={(e) =>
                  setPassword({ ...password, confirm: e.target.value })
                }
              />
            </div>
            <PrimaryButton
              className="mt-3"
              disabled={social}
              loading={changing}
              onClick={savePassword}
            >
            {t("settingsUi.changePassword")}
            </PrimaryButton>
            <Status value={passwordStatus} />
          </div>
        </div>
      </details>
    </SectionCard>
  );
}

export function AiSettings({
  onOpen,
}: {
  token?: string;
  onOpen?: () => void;
}) {
  const { t } = useLanguage();
  return (
    <SectionCard>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-black">{t("settingsUi.planner")}</h3>
          <p className="mt-1 text-xs text-[var(--bp-muted)]">
            {t("settingsUi.plannerDesc")}
          </p>
        </div>
        <SecondaryButton size="sm" onClick={onOpen}>
          {t("settingsUi.openPlanner")}
        </SecondaryButton>
      </div>
    </SectionCard>
  );
}

type LocalPrefs = Record<
  | "taskReminders"
  | "collaboration"
  | "focus"
  | "focusCompletionSound"
  | "location"
  | "push"
  | "email",
  boolean
> & { timeFormat: string; dateFormat: string };
const defaults: LocalPrefs = {
  taskReminders: true,
  collaboration: true,
  focus: true,
  focusCompletionSound: true,
  location: true,
  push: true,
  email: false,
  timeFormat: "12",
  dateFormat: "MM/DD/YYYY",
};
function loadLocalPrefs(): LocalPrefs {
  try {
    const stored = JSON.parse(
      localStorage.getItem("beeplan_settings_preferences") ?? "{}",
    ) as Partial<LocalPrefs>;
    return Object.fromEntries(
      Object.keys(defaults).map((key) => [
        key,
        stored[key as keyof LocalPrefs] ?? defaults[key as keyof LocalPrefs],
      ]),
    ) as LocalPrefs;
  } catch {
    return defaults;
  }
}
export function GeneralSettings({
  variant,
  mode,
  language,
  timezone,
  token,
  onTheme,
  onLanguage,
  onNotifications,
  onDeleted,
}: {
  variant: "preferences" | "notifications" | "privacy";
  mode?: string;
  language?: string;
  timezone?: string;
  token?: string;
  onTheme?: () => void;
  onLanguage?: () => void;
  onNotifications?: () => void;
  onDeleted?: () => void;
}) {
  const { t } = useLanguage();
  const [prefs, setPrefs] = useState<LocalPrefs>(loadLocalPrefs);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const patch = (key: keyof LocalPrefs, value: string | boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    localStorage.setItem("beeplan_settings_preferences", JSON.stringify(next));
  };
  async function remove() {
    if (!token) return;
    setDeleting(true);
    try {
      await deleteAccount(token);
      onDeleted?.();
    } finally {
      setDeleting(false);
    }
  }
  if (variant === "preferences")
    return (
      <SectionCard>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-bold text-[var(--bp-muted)]">
              {t("settingsUi.theme")}
            </span>
            <select className={fieldClass} value={mode} onChange={onTheme}>
              <option value="light">{t("settingsUi.light")}</option>
              <option value="dark">{t("settingsUi.dark")}</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-[var(--bp-muted)]">
              {t("settingsUi.language")}
            </span>
            <select
              className={fieldClass}
              value={language}
              onChange={onLanguage}
            >
              <option value="en">{t("settingsUi.english")}</option>
              <option value="ar">العربية</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-[var(--bp-muted)]">
              {t("settingsUi.timeFormat")}
            </span>
            <select
              className={fieldClass}
              value={prefs.timeFormat}
              onChange={(e) => patch("timeFormat", e.target.value)}
            >
              <option value="12">{t("settingsUi.h12")}</option>
              <option value="24">{t("settingsUi.h24")}</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-[var(--bp-muted)]">
              {t("settingsUi.dateFormat")}
            </span>
            <select
              className={fieldClass}
              value={prefs.dateFormat}
              onChange={(e) => patch("dateFormat", e.target.value)}
            >
              <option>MM/DD/YYYY</option>
              <option>DD/MM/YYYY</option>
              <option>YYYY-MM-DD</option>
            </select>
          </label>
          <Field label={t("settingsUi.timezone")} value={timezone} disabled />
        </div>
      </SectionCard>
    );
  if (variant === "notifications")
    return (
      <NotificationSettings token={token} onNotifications={onNotifications} />
    );
  return (
    <>
      <SectionCard>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-black">{t("settingsUi.locationPermission")}</h3>
            <p className="mt-1 text-xs text-[var(--bp-muted)]">
              {t("settingsUi.locationHelp")}
            </p>
          </div>
          <span className="rounded-full bg-[var(--bp-accent-soft)] px-2.5 py-1 text-xs font-bold text-[var(--bp-accent-ink)]">
            {t("settingsUi.locationServices")}
          </span>
        </div>
        <div className="mt-3">
          <Toggle
            label={t("settingsUi.locationServices")}
            checked={prefs.location}
            onChange={(value) => patch("location", value)}
          />
        </div>
      </SectionCard>
      <SectionCard>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-black">{t("settingsUi.connectedServices")}</h3>
            <p className="mt-1 text-xs text-[var(--bp-muted)]">
              {t("settingsUi.calendarHelp")}
            </p>
          </div>
          <span className="text-xs font-bold text-[var(--bp-muted)]">
            {t("settingsUi.reviewIntegrations")}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <SecondaryButton disabled title={t("settingsUi.exportUnavailable")}>
            {t("settingsUi.exportSoon")}
          </SecondaryButton>
          <DangerButton onClick={() => setConfirm(true)}>
            {t("settingsUi.deleteAccount")}
          </DangerButton>
        </div>
      </SectionCard>
      <ConfirmDestructiveModal
        open={confirm}
        title={t("settingsUi.deleteQuestion")}
        message="This permanently deletes your account and all associated data. This cannot be undone."
        confirmLabel={t("settingsUi.deleteAccount")}
        isConfirming={deleting}
        onCancel={() => setConfirm(false)}
        onConfirm={remove}
      />
    </>
  );
}

const notificationFields: {
  key: keyof Pick<
    NotificationPreferences,
    | "taskNotifications"
    | "calendarNotifications"
    | "focusNotifications"
    | "collaborationNotifications"
    | "aiNotifications"
    | "emailNotifications"
    | "pushNotifications"
  >;
  label: string;
  description: string;
}[] = [
  {
    key: "taskNotifications",
    label: "",
    description: "",
  },
  {
    key: "calendarNotifications",
    label: "",
    description: "",
  },
  {
    key: "focusNotifications",
    label: "",
    description: "",
  },
  {
    key: "collaborationNotifications",
    label: "",
    description: "",
  },
  {
    key: "aiNotifications",
    label: "",
    description: "",
  },
  {
    key: "emailNotifications",
    label: "",
    description: "",
  },
  {
    key: "pushNotifications",
    label: "",
    description: "",
  },
];
function NotificationSettings({
  token,
  onNotifications,
}: {
  token?: string;
  onNotifications?: () => void;
}) {
  const { t } = useLanguage();
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    void getNotificationPreferences(token)
      .then(setPreferences)
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load notification preferences.",
        ),
      );
    removeObsoleteNotificationPrefs();
  }, [token]);
  async function toggle(key: (typeof notificationFields)[number]["key"]) {
    if (!token || !preferences || saving) return;
    const previous = preferences;
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    setSaving(key);
    setError("");
    try {
      setPreferences(
        await updateNotificationPreferences(token, { [key]: next[key] }),
      );
    } catch (cause) {
      setPreferences(previous);
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save notification preferences.",
      );
    } finally {
      setSaving(null);
    }
  }
  return (
    <SectionCard>
      <div className="flex items-center justify-between gap-3">
        <div>
            <p className="text-xs text-[var(--bp-muted)]">
            {t("settingsUi.notificationHelp")}
          </p>
          <p className="mt-1 text-xs text-[var(--bp-muted)]">
            {t("settingsUi.emailUnavailable")}
          </p>
        </div>
        <SecondaryButton size="sm" onClick={onNotifications}>
          {t("settingsUi.notificationCenter")}
        </SecondaryButton>
      </div>
      {notificationFields.map((item) => (
        <div
          key={item.key}
          className="flex items-center justify-between gap-4 border-b border-[var(--bp-border)]/60 py-3 last:border-0"
        >
          <div>
            <p className="text-sm font-bold">{t(`settingsUi.${item.key === "taskNotifications" ? "task" : item.key === "calendarNotifications" ? "calendar" : item.key === "focusNotifications" ? "focus" : item.key === "collaborationNotifications" ? "collaboration" : item.key === "aiNotifications" ? "planner" : item.key === "emailNotifications" ? "email" : "mobilePush"}`)}</p>
            <p className="text-xs text-[var(--bp-muted)]">{t(`settingsUi.${item.key === "taskNotifications" ? "taskDesc" : item.key === "calendarNotifications" ? "calendarDesc" : item.key === "focusNotifications" ? "focusDesc" : item.key === "collaborationNotifications" ? "collaborationDesc" : item.key === "aiNotifications" ? "plannerAlerts" : item.key === "emailNotifications" ? "emailDesc" : "mobilePushDesc"}`)}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label={item.label}
            aria-checked={preferences?.[item.key] ?? false}
            disabled={
              !preferences ||
              saving !== null ||
              item.key === "emailNotifications"
            }
            onClick={() => void toggle(item.key)}
            className={`relative h-6 w-11 shrink-0 rounded-full ${preferences?.[item.key] ? "bg-[var(--bp-accent)]" : "bg-[var(--bp-border)]"} ${saving === item.key || item.key === "emailNotifications" ? "opacity-60" : ""}`}
          >
            <span
              className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${preferences?.[item.key] ? "left-6" : "left-1"}`}
            />
          </button>
        </div>
      ))}
      {error ? (
        <p role="alert" className="mt-3 text-xs font-bold text-red-400">
          {error}
        </p>
      ) : null}
    </SectionCard>
  );
}
function removeObsoleteNotificationPrefs() {
  try {
    const raw = localStorage.getItem("beeplan_settings_preferences");
    if (!raw) return;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    for (const key of [
      "taskReminders",
      "location",
      "focus",
      "collaboration",
      "push",
      "email",
    ])
      delete stored[key];
    localStorage.setItem(
      "beeplan_settings_preferences",
      JSON.stringify(stored),
    );
  } catch {
    /* Ignore malformed legacy local preferences. */
  }
}
