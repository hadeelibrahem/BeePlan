import { useCallback, useEffect, useState } from "react";
import {
  correctTaskAssistantContext,
  getTaskAssistant,
  refreshTaskAssistant,
  updateTaskAssistantSuggestion,
  updateTaskAssistantNotification,
  type ApiTask,
  type TaskAssistantState,
} from "../lib/tasksApi";
const contexts = [
  "automatic",
  "travel",
  "flight",
  "interview",
  "university",
  "medical",
  "meeting",
  "online_meeting",
  "pharmacy",
  "shopping",
  "exercise",
  "general",
];
export function TravelWeatherCard({
  token,
  task,
}: {
  token: string;
  task: ApiTask;
}) {
  const [state, setState] = useState<TaskAssistantState | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setState(await getTaskAssistant(token, task.id));
    } finally {
      setLoading(false);
    }
  }, [task.id, token]);
  useEffect(() => {
    void load();
  }, [load, task.updatedAt]);
  const update = async (id: string, payload: any) =>
    setState(await updateTaskAssistantSuggestion(token, task.id, id, payload));
  return (
    <section
      aria-label="Task Assistant"
      className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-black text-[var(--bp-text)]">Task Assistant</h3>
          <p className="mt-1 text-xs text-[var(--bp-muted)]">
            {state
              ? `${state.context.primaryContext.replaceAll("_", " ")} · ${state.context.confidence}`
              : "Detecting task context…"}
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() =>
            void refreshTaskAssistant(token, task.id).then(setState)
          }
          className="text-sm font-bold text-[var(--bp-accent-ink)]"
        >
          Refresh suggestions
        </button>
      </div>
      {state ? (
        <>
          <p className="mt-2 text-xs text-[var(--bp-muted)]">
            {state.context.confidenceReason}
          </p>
          <label className="mt-3 block text-xs font-bold text-[var(--bp-muted)]">
            Correct task type
            <select
              aria-label="Correct task type"
              className="ms-2 rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-2 py-1 text-[var(--bp-text)]"
              value={state.context.primaryContext}
              onChange={(event) => {
                if (event.target.value !== "automatic")
                  void correctTaskAssistantContext(
                    token,
                    task.id,
                    event.target.value,
                  ).then(setState);
              }}
            >
              {contexts
                .filter((value) => value !== "automatic")
                .map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </option>
                ))}
            </select>
          </label>
          <div className="mt-4 space-y-2">
            {state.timeline.length ? (
              <section aria-labelledby="task-assistant-timeline" className="mb-4">
                <h4 id="task-assistant-timeline" className="mb-2 text-sm font-black text-[var(--bp-text)]">Context Timeline</h4>
                <ol className="space-y-2 border-s border-[var(--bp-border)] ps-4">
                  {state.timeline.map((stage) => <li key={stage.id} className="text-sm"><p className="font-bold text-[var(--bp-text)]">{stage.title}</p><p className="text-xs text-[var(--bp-muted)]">{stage.scheduledAt ? new Date(stage.scheduledAt).toLocaleString() : "Timing pending"} · {stage.triggerReason}</p></li>)}
                </ol>
              </section>
            ) : null}
            {state.suggestions.some((item) => item.category) ? <h4 className="text-sm font-black text-[var(--bp-text)]">Dynamic packing &amp; preparation</h4> : null}
            {state.suggestions.length ? (
              state.suggestions.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-[var(--bp-border)] p-3"
                >
                  <div className="flex items-start gap-3">
                    <input
                      aria-label={`Complete ${item.title}`}
                      type="checkbox"
                      checked={item.status === "completed"}
                      onChange={(event) =>
                        void update(item.id, {
                          status: event.target.checked
                            ? "completed"
                            : "pending",
                        })
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[var(--bp-text)]">
                        {item.title}
                      </p>
                      <p className="text-sm text-[var(--bp-muted)]">
                        {item.description}
                      </p>
                      <p className="mt-1 text-xs text-[var(--bp-muted)]">
                        Why: {item.reason} ·{" "}
                        {item.evidenceType.replaceAll("_", " ")}
                      </p>
                      {item.category ? <label className="mt-2 block text-xs font-bold text-[var(--bp-muted)]">Quantity or note<input aria-label={`Quantity for ${item.title}`} defaultValue={item.quantity ?? ""} onBlur={(event) => void update(item.id, { quantity: event.target.value })} className="ms-2 rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-2 py-1 text-[var(--bp-text)]" /></label> : null}
                    </div>
                    <button
                      aria-label={`Dismiss ${item.title}`}
                      onClick={() =>
                        void update(item.id, { status: "dismissed" })
                      }
                      className="text-xs font-bold text-[var(--bp-muted)]"
                    >
                      Dismiss
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm text-[var(--bp-muted)]">
                No relevant preparation suggestions for this task.
              </p>
            )}
          </div>
          {state.travelWeather?.eligibility?.eligible ? (
            <div className="mt-4 rounded-xl bg-[var(--bp-bg)] p-3 text-sm text-[var(--bp-muted)]">
              <p className="font-bold text-[var(--bp-text)]">
                Travel &amp; weather
              </p>
              <p>{state.travelWeather.deterministicMessage}</p>
            </div>
          ) : null}
          {state.contextualNotifications.length ? <section aria-labelledby="task-assistant-notifications" className="mt-4"><h4 id="task-assistant-notifications" className="text-sm font-black text-[var(--bp-text)]">Scheduled contextual notifications</h4><ul className="mt-2 space-y-1 text-sm text-[var(--bp-muted)]">{state.contextualNotifications.map((notification) => <li key={notification.id} className="flex items-center justify-between gap-3"><span>{new Date(notification.scheduledAt).toLocaleString()} — {notification.body}</span><button type="button" aria-label={`Disable ${notification.body}`} onClick={() => void updateTaskAssistantNotification(token, task.id, notification.id, { status: "dismissed" }).then(setState)} className="text-xs font-bold">Disable</button></li>)}</ul></section> : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-[var(--bp-muted)]">
          {loading ? "Loading suggestions…" : "Suggestions unavailable."}
        </p>
      )}
    </section>
  );
}
