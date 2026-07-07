import { useEffect, useRef, useState, type ReactNode } from 'react';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  OutlineButton,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from '../components/layout';
import { createReminder, type Reminder, type ReminderFormValues } from '../features/reminders';
import { addSubtask, type ApiTask, type TaskPayload } from '../lib/tasksApi';
import {
  sendTaskPlanChat,
  type ConversationState,
  type TaskPlan,
  type TaskPlanChatMessage,
  type TaskPlanPriority,
  type UnderstoodSummary,
} from '../lib/aiTaskPlanApi';
import type { AppTheme } from '../theme/colors';
import { useTheme } from '../theme/useTheme';

type Props = {
  accessToken?: string;
  onCancel: () => void;
  onSaveTask: (payload: TaskPayload) => Promise<ApiTask | undefined> | ApiTask | void;
  onReminderCreated?: (reminder: Reminder) => void;
  onSaved: (task: ApiTask) => void;
};

type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  quickReplies?: string[];
  kind?: 'question' | 'advice' | 'plan';
  state?: ConversationState;
  understoodSummary?: UnderstoodSummary;
};

const GREETING =
  "Hi! I'm your AI Task Builder. Describe a big goal or task — for example \"prepare my graduation project presentation by next Sunday\" — and I'll break it into a full plan with subtasks, focus sessions, and reminders.";

const GREETING_QUICK_REPLIES = [
  'Plan my exam study schedule',
  'Prepare a project presentation',
  'Organize a big work deliverable',
];

export default function AiTaskBuilderScreen({ accessToken, onCancel, onSaveTask, onReminderCreated, onSaved }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 0, role: 'assistant', content: GREETING, quickReplies: GREETING_QUICK_REPLIES },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [retryConversation, setRetryConversation] = useState<ChatMessage[] | null>(null);
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  const [planVersion, setPlanVersion] = useState(0);
  const nextIdRef = useRef(1);
  const sendingRef = useRef(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  function nextId() {
    return nextIdRef.current++;
  }

  function scrollToEnd() {
    listRef.current?.scrollToEnd({ animated: true });
  }

  // Auto-scroll whenever the keyboard opens, in addition to the FlatList's own
  // onContentSizeChange scroll — the keyboard resizing the visible area can
  // otherwise leave the latest message tucked out of view.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const subscription = Keyboard.addListener(showEvent, () => {
      requestAnimationFrame(scrollToEnd);
    });
    return () => subscription.remove();
  }, []);

  function toApiMessages(list: ChatMessage[]): TaskPlanChatMessage[] {
    return list.map(({ role, content }) => ({ role, content }));
  }

  async function performSend(conversation: ChatMessage[]) {
    setLoading(true);
    setError('');

    try {
      const response = await sendTaskPlanChat(accessToken ?? '', toApiMessages(conversation));
      setMessages((current) => [
        ...current,
        {
          id: nextId(),
          role: 'assistant',
          content: response.message,
          quickReplies: response.type !== 'plan' ? response.quickReplies : undefined,
          kind: response.type,
          state: response.state,
          understoodSummary: response.understoodSummary,
        },
      ]);

      if (response.type === 'plan' && response.plan) {
        setPlan(response.plan);
        setPlanVersion((value) => value + 1);
      }

      setRetryConversation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI planning failed. Please try again.');
      setRetryConversation(conversation);
    } finally {
      setLoading(false);
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading || saving || sendingRef.current || !accessToken) return;

    sendingRef.current = true;
    setInput('');
    const outgoing: ChatMessage = { id: nextId(), role: 'user', content: trimmed };
    const conversation = [...messages, outgoing];
    setMessages(conversation);

    try {
      await performSend(conversation);
    } finally {
      sendingRef.current = false;
    }
  }

  function retry() {
    if (!retryConversation || loading || sendingRef.current) return;
    sendingRef.current = true;
    void performSend(retryConversation).finally(() => {
      sendingRef.current = false;
    });
  }

  function regenerate() {
    void send(
      'Please regenerate the plan with a different structure or schedule, keeping the same goal and deadline.',
    );
  }

  async function handleSave() {
    if (!plan || saving) return;
    if (!plan.mainTask.title.trim()) {
      setError('The plan needs a task title before saving.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const totalMinutes = plan.subtasks.reduce((sum, subtask) => sum + subtask.estimatedMinutes, 0);
      const createdTask = await onSaveTask({
        title: plan.mainTask.title.trim(),
        description: plan.mainTask.description,
        priority: plan.mainTask.priority,
        status: 'todo',
        dueDate: plan.mainTask.dueDate ?? undefined,
        estimatedTimeMinutes: totalMinutes,
        reminderEnabled: true,
        reminderBeforeMinutes: 30,
        isFocusTask: plan.focusSessions.length > 0,
      });

      if (!createdTask) return;

      let latestTask = createdTask;
      for (const subtask of plan.subtasks) {
        latestTask = await addSubtask(accessToken ?? '', latestTask.id, { title: subtask.title });
      }

      let reminderFailures = 0;
      for (const planReminder of plan.reminders) {
        try {
          const reminder = await createReminder(
            {
              title: planReminder.title,
              type: 'time',
              remindAt: planReminder.remindAt,
              priority: plan.mainTask.priority,
              repeatRule: { frequency: 'none', interval: 1 },
            } as ReminderFormValues,
            accessToken ?? '',
          );
          onReminderCreated?.(reminder);
        } catch {
          reminderFailures += 1;
        }
      }

      if (reminderFailures > 0) {
        console.warn(`[AI Task Builder] ${reminderFailures} reminder(s) could not be created.`);
      }

      onSaved(latestTask);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the plan.');
    } finally {
      setSaving(false);
    }
  }

  const totalMinutes = plan ? plan.subtasks.reduce((sum, subtask) => sum + subtask.estimatedMinutes, 0) : 0;
  const lastMessage = messages[messages.length - 1];
  const showReviewActions = !loading && lastMessage?.role === 'assistant' && lastMessage.state === 'review';

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
      {/*
        The composer lives inside this KeyboardAvoidingView as a normal flex
        sibling (not an absolutely-positioned footer) so it actually gets
        pushed up above the keyboard on both platforms — an absolutely
        positioned footer outside a KeyboardAvoidingView never moves.
      */}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View className="flex-1 px-4 pt-6">
          <PageHeader title="AI Plan Task" subtitle="Describe your goal and let AI build a plan" onBack={onCancel} />

          <FlatList
            ref={listRef}
            className="flex-1"
            data={messages}
            keyExtractor={(message) => String(message.id)}
            renderItem={({ item, index }) => (
              <ChatBubble
                message={item}
                isLast={index === messages.length - 1}
                loading={loading}
                onQuickReply={(reply) => void send(reply)}
              />
            )}
            contentContainerStyle={{ paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={scrollToEnd}
            onLayout={scrollToEnd}
            ListFooterComponent={
              <View>
                {loading ? <TypingIndicator /> : null}

                {error ? (
                  <Animated.View
                    entering={FadeIn.duration(180)}
                    className="mb-3 rounded-2xl border px-4 py-3"
                    style={{ borderColor: colors.error, backgroundColor: `${colors.error}14` }}
                  >
                    <Text className="text-sm font-semibold" style={{ color: colors.error }}>
                      {error}
                    </Text>
                    {retryConversation ? (
                      <Pressable onPress={retry} accessibilityRole="button" accessibilityLabel="Retry" className="mt-2 self-start">
                        <Text className="text-sm font-bold" style={{ color: colors.accent }}>
                          Retry
                        </Text>
                      </Pressable>
                    ) : null}
                  </Animated.View>
                ) : null}

                {showReviewActions ? (
                  <ReviewSummaryCard
                    understoodSummary={lastMessage?.understoodSummary}
                    loading={loading}
                    onGenerate={() => void send('Yes, please generate the final task plan.')}
                    onAdjustScope={() => void send("I'd like to adjust the scope before we finalize.")}
                    onAddDetails={() => void send('I want to add more details first.')}
                  />
                ) : null}

                {plan ? (
                  <PlanPreviewCard
                    key={planVersion}
                    plan={plan}
                    totalMinutes={totalMinutes}
                    onChange={setPlan}
                    onSave={() => void handleSave()}
                    onRegenerate={regenerate}
                    onCancel={onCancel}
                    saving={saving}
                    loading={loading}
                  />
                ) : null}
              </View>
            }
          />
        </View>

        <View
          className="flex-row items-end gap-2 border-t px-4 pt-3"
          style={{
            borderColor: colors.border,
            backgroundColor: colors.navigation,
            paddingBottom: Math.max(insets.bottom, 12),
          }}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            onFocus={() => requestAnimationFrame(scrollToEnd)}
            placeholder="Describe your goal, e.g. 'Finish my research paper by June 20'..."
            placeholderTextColor={colors.placeholder}
            multiline
            editable={!loading && !saving}
            className="flex-1 rounded-xl border px-3 py-2.5 text-sm"
            style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text, maxHeight: 100 }}
          />
          <PrimaryButton onPress={() => void send(input)} disabled={loading || saving || !input.trim()} size="sm">
            Send
          </PrimaryButton>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChatBubble({
  message,
  isLast,
  loading,
  onQuickReply,
}: {
  message: ChatMessage;
  isLast: boolean;
  loading: boolean;
  onQuickReply: (reply: string) => void;
}) {
  const { theme } = useTheme();
  const { colors } = theme;
  const isUser = message.role === 'user';
  const isAdvice = !isUser && message.kind === 'advice';
  const showQuickReplies = !isUser && isLast && !loading && (message.quickReplies?.length ?? 0) > 0;

  return (
    <Animated.View entering={FadeInUp.duration(220)} className="mb-3">
      <View className={`flex-row ${isUser ? 'justify-end' : 'justify-start'}`}>
        <View
          className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${isUser ? 'rounded-br-md' : 'rounded-bl-md border'}`}
          style={{
            backgroundColor: isUser ? colors.accent : isAdvice ? colors.accentSoft : colors.card,
            borderColor: isUser ? undefined : isAdvice ? colors.accent : colors.border,
          }}
        >
          {isAdvice ? (
            <Text className="mb-1 text-xs font-black uppercase tracking-wide" style={{ color: colors.accent }}>
              Suggestion
            </Text>
          ) : null}
          <Text
            className="text-sm leading-5"
            style={{ color: isUser ? colors.accentText : colors.text, fontWeight: isUser ? '700' : '400' }}
          >
            {message.content}
          </Text>
        </View>
      </View>

      {showQuickReplies ? (
        <View className="mt-2 flex-row flex-wrap gap-2">
          {message.quickReplies?.map((reply) => (
            <Pressable
              key={reply}
              onPress={() => onQuickReply(reply)}
              accessibilityRole="button"
              accessibilityLabel={reply}
              className="rounded-full border px-3 py-1.5 active:opacity-80"
              style={{ borderColor: colors.accent, backgroundColor: colors.accentSoft }}
            >
              <Text className="text-xs font-bold" style={{ color: colors.accent }}>
                {reply}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

function TypingIndicator() {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Animated.View entering={FadeIn.duration(150)} className="mb-3 flex-row justify-start">
      <View
        className="flex-row items-center gap-1.5 rounded-2xl rounded-bl-md border px-4 py-3"
        style={{ borderColor: colors.border, backgroundColor: colors.card }}
      >
        <TypingDot delay={0} color={colors.accent} />
        <TypingDot delay={150} color={colors.accent} />
        <TypingDot delay={300} color={colors.accent} />
      </View>
    </Animated.View>
  );
}

function TypingDot({ delay, color }: { delay: number; color: string }) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(-4, { duration: 300 }), withTiming(0, { duration: 300 })), -1, true),
    );
  }, [delay, translateY]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  return <Animated.View style={[{ height: 6, width: 6, borderRadius: 3, backgroundColor: color }, style]} />;
}

function ReviewSummaryCard({
  understoodSummary,
  onGenerate,
  onAdjustScope,
  onAddDetails,
  loading,
}: {
  understoodSummary?: UnderstoodSummary;
  onGenerate: () => void;
  onAdjustScope: () => void;
  onAddDetails: () => void;
  loading: boolean;
}) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <SectionCard className="mb-3" style={{ borderColor: `${colors.accent}4D`, backgroundColor: `${colors.accent}0D` }}>
        <Text className="mb-2 text-xs font-black uppercase tracking-wide" style={{ color: colors.accent }}>
          What I Understood
        </Text>

        {understoodSummary ? (
          <View className="gap-1">
            <SummaryRow label="Goal" value={understoodSummary.goal} />
            {understoodSummary.goalType ? <SummaryRow label="Type" value={understoodSummary.goalType} /> : null}
            {understoodSummary.deadline ? <SummaryRow label="Deadline" value={understoodSummary.deadline} /> : null}
            {understoodSummary.availableTime ? (
              <SummaryRow label="Available time" value={understoodSummary.availableTime} />
            ) : null}
            {understoodSummary.currentProgress ? (
              <SummaryRow label="Progress so far" value={understoodSummary.currentProgress} />
            ) : null}
            <SummaryBullets label="Deliverables" items={understoodSummary.deliverables} />
            <SummaryBullets label="Constraints" items={understoodSummary.constraints} />
            <SummaryBullets label="Risks" items={understoodSummary.risks} />
          </View>
        ) : (
          <Text className="text-sm" style={{ color: colors.secondaryText }}>
            No summary captured yet — feel free to add more details.
          </Text>
        )}

        <View className="mt-4 gap-2">
          <PrimaryButton onPress={onGenerate} disabled={loading} size="sm">
            Generate Final Plan
          </PrimaryButton>
          <View className="flex-row gap-2">
            <SecondaryButton className="flex-1" onPress={onAdjustScope} disabled={loading} size="sm">
              Adjust Scope
            </SecondaryButton>
            <OutlineButton className="flex-1" onPress={onAddDetails} disabled={loading} size="sm">
              Add More Details
            </OutlineButton>
          </View>
        </View>
      </SectionCard>
    </Animated.View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Text className="text-sm" style={{ color: colors.text }}>
      <Text className="font-bold" style={{ color: colors.secondaryText }}>
        {label}:{' '}
      </Text>
      {value}
    </Text>
  );
}

function SummaryBullets({ label, items }: { label: string; items: string[] }) {
  const { theme } = useTheme();
  const { colors } = theme;

  if (!items.length) return null;

  return (
    <View className="mt-1">
      <Text className="text-xs font-bold" style={{ color: colors.secondaryText }}>
        {label}:
      </Text>
      {items.map((item, index) => (
        <Text key={index} className="text-sm" style={{ color: colors.text }}>
          • {item}
        </Text>
      ))}
    </View>
  );
}

function ExpandablePlanBody({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const progress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, { duration: 240 });
  }, [expanded, progress]);

  const style = useAnimatedStyle(() => ({
    height: measuredHeight ? progress.value * measuredHeight : undefined,
    opacity: progress.value,
    overflow: 'hidden',
  }));

  return (
    <Animated.View style={style}>
      <View onLayout={(event) => setMeasuredHeight(event.nativeEvent.layout.height)}>{children}</View>
    </Animated.View>
  );
}

type PlanPreviewCardProps = {
  plan: TaskPlan;
  totalMinutes: number;
  onChange: (plan: TaskPlan) => void;
  onSave: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
  saving: boolean;
  loading: boolean;
};

function PlanPreviewCard({ plan, totalMinutes, onChange, onSave, onRegenerate, onCancel, saving, loading }: PlanPreviewCardProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [iosDatePickerVisible, setIosDatePickerVisible] = useState(false);
  const chevronRotation = useSharedValue(expanded ? 180 : 0);

  useEffect(() => {
    chevronRotation.value = withTiming(expanded ? 180 : 0, { duration: 200 });
  }, [expanded, chevronRotation]);

  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${chevronRotation.value}deg` }] }));

  function updateMainTask(patch: Partial<TaskPlan['mainTask']>) {
    onChange({ ...plan, mainTask: { ...plan.mainTask, ...patch } });
  }

  function updateSubtask(index: number, patch: Partial<TaskPlan['subtasks'][number]>) {
    onChange({
      ...plan,
      subtasks: plan.subtasks.map((subtask, itemIndex) => (itemIndex === index ? { ...subtask, ...patch } : subtask)),
    });
  }

  function removeSubtask(index: number) {
    onChange({
      ...plan,
      subtasks: plan.subtasks
        .filter((_, itemIndex) => itemIndex !== index)
        .map((subtask, itemIndex) => ({ ...subtask, order: itemIndex + 1 })),
    });
  }

  function removeFocusSession(index: number) {
    onChange({ ...plan, focusSessions: plan.focusSessions.filter((_, itemIndex) => itemIndex !== index) });
  }

  function removeReminder(index: number) {
    onChange({ ...plan, reminders: plan.reminders.filter((_, itemIndex) => itemIndex !== index) });
  }

  function openDueDatePicker() {
    const initial = plan.mainTask.dueDate ? new Date(plan.mainTask.dueDate) : new Date();

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'date',
        onChange: (event: DateTimePickerEvent, selected?: Date) => {
          if (event.type === 'set' && selected) {
            updateMainTask({ dueDate: selected.toISOString() });
          }
        },
      });
      return;
    }

    setIosDatePickerVisible(true);
  }

  const inputStyle = { borderColor: colors.border, backgroundColor: colors.input, color: colors.text };

  return (
    <Animated.View entering={FadeIn.duration(220)}>
      <SectionCard className="mb-3">
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse generated plan' : 'Expand generated plan'}
          className="flex-row items-center justify-between"
        >
          <View className="flex-1 pr-3">
            <Text className="text-xs font-black uppercase tracking-wide" style={{ color: colors.accent }}>
              Generated Plan
            </Text>
            <Text className="mt-0.5 text-base font-black" numberOfLines={1} style={{ color: colors.text }}>
              {plan.mainTask.title}
            </Text>
          </View>
          <Animated.Text style={[{ fontSize: 16 }, { color: colors.secondaryText }, chevronStyle]}>▾</Animated.Text>
        </Pressable>

        <ExpandablePlanBody expanded={expanded}>
          <View className="pt-3">
            {editing ? (
              <>
                <Label text="Task Title" />
                <TextInput
                  value={plan.mainTask.title}
                  onChangeText={(value) => updateMainTask({ title: value })}
                  className="mb-3 rounded-xl border px-3 py-2.5 text-sm"
                  style={inputStyle}
                />

                <Label text="Description" />
                <TextInput
                  multiline
                  value={plan.mainTask.description}
                  onChangeText={(value) => updateMainTask({ description: value })}
                  textAlignVertical="top"
                  className="mb-3 h-20 rounded-xl border px-3 py-2.5 text-sm"
                  style={inputStyle}
                />

                <View className="mb-1 flex-row gap-3">
                  <View className="flex-1">
                    <Label text="Due Date" />
                    <Pressable
                      onPress={openDueDatePicker}
                      accessibilityRole="button"
                      accessibilityLabel="Edit due date"
                      className="rounded-xl border px-3 py-2.5 active:opacity-80"
                      style={{ borderColor: colors.border, backgroundColor: colors.input }}
                    >
                      <Text className="text-sm" style={{ color: colors.text }}>
                        {formatDate(plan.mainTask.dueDate)}
                      </Text>
                    </Pressable>
                  </View>
                  <View className="flex-1">
                    <Label text="Priority" />
                    <View className="flex-row gap-1.5">
                      {(['low', 'medium', 'high'] as TaskPlanPriority[]).map((item) => (
                        <PrioritySegment
                          key={item}
                          label={item}
                          active={plan.mainTask.priority === item}
                          onPress={() => updateMainTask({ priority: item })}
                        />
                      ))}
                    </View>
                  </View>
                </View>
              </>
            ) : (
              <View className="mb-1">
                {plan.mainTask.description ? (
                  <Text className="text-sm leading-5" style={{ color: colors.secondaryText }}>
                    {plan.mainTask.description}
                  </Text>
                ) : null}
                <View className="mt-2 flex-row flex-wrap gap-2">
                  <MetaChip label={`Due: ${formatDate(plan.mainTask.dueDate)}`} theme={theme} />
                  <MetaChip label={`Priority: ${plan.mainTask.priority}`} theme={theme} tone={plan.mainTask.priority} />
                  <MetaChip label={`Est: ${formatHours(totalMinutes)}`} theme={theme} />
                </View>
              </View>
            )}

            <SectionHeading text={`Subtasks (${plan.subtasks.length})`} />
            {plan.subtasks.length ? (
              plan.subtasks.map((subtask, index) => (
                <SubtaskRow
                  key={index}
                  subtask={subtask}
                  editing={editing}
                  onChangeTitle={(value) => updateSubtask(index, { title: value })}
                  onChangeMinutes={(value) => updateSubtask(index, { estimatedMinutes: value })}
                  onDelete={() => removeSubtask(index)}
                />
              ))
            ) : (
              <EmptyRow text="No subtasks suggested." />
            )}

            <SectionHeading text={`Focus Sessions (${plan.focusSessions.length})`} />
            {plan.focusSessions.length ? (
              plan.focusSessions.map((session, index) => (
                <FocusSessionRow key={index} session={session} editing={editing} onDelete={() => removeFocusSession(index)} />
              ))
            ) : (
              <EmptyRow text="No focus sessions suggested." />
            )}

            <SectionHeading text={`Reminders (${plan.reminders.length})`} />
            {plan.reminders.length ? (
              plan.reminders.map((reminder, index) => (
                <ReminderRow key={index} reminder={reminder} editing={editing} onDelete={() => removeReminder(index)} />
              ))
            ) : (
              <EmptyRow text="No reminders suggested." />
            )}

            <View className="mt-4 gap-2">
              <View className="flex-row gap-2">
                <SecondaryButton className="flex-1" onPress={onRegenerate} disabled={saving || loading} size="sm">
                  Regenerate
                </SecondaryButton>
                <OutlineButton className="flex-1" onPress={() => setEditing((value) => !value)} disabled={saving} size="sm">
                  {editing ? 'Done Editing' : 'Edit Plan'}
                </OutlineButton>
              </View>
              <View className="flex-row gap-2">
                <SecondaryButton className="flex-1" onPress={onCancel} disabled={saving} size="sm">
                  Cancel
                </SecondaryButton>
                <PrimaryButton className="flex-1" onPress={onSave} loading={saving} disabled={saving || loading} size="sm">
                  Save Plan
                </PrimaryButton>
              </View>
            </View>
          </View>
        </ExpandablePlanBody>
      </SectionCard>

      {Platform.OS !== 'android' && (
        <Modal
          visible={iosDatePickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIosDatePickerVisible(false)}
        >
          <View className="flex-1 items-center justify-center bg-black/50 px-6">
            <View className="w-full rounded-3xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
              <DateTimePicker
                value={plan.mainTask.dueDate ? new Date(plan.mainTask.dueDate) : new Date()}
                mode="date"
                display="inline"
                themeVariant={theme.mode}
                accentColor={colors.accent}
                onChange={(_event, selected) => selected && updateMainTask({ dueDate: selected.toISOString() })}
              />
              <View className="mt-2 flex-row justify-end">
                <Pressable
                  onPress={() => setIosDatePickerVisible(false)}
                  className="rounded-full px-4 py-2.5 active:opacity-90"
                  style={{ backgroundColor: colors.accent }}
                >
                  <Text className="text-sm font-black" style={{ color: colors.accentText }}>
                    Done
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </Animated.View>
  );
}

function SectionHeading({ text }: { text: string }) {
  const { theme } = useTheme();

  return (
    <Text className="mb-2 mt-4 text-xs font-black uppercase tracking-wide" style={{ color: theme.colors.secondaryText }}>
      {text}
    </Text>
  );
}

function EmptyRow({ text }: { text: string }) {
  const { theme } = useTheme();

  return (
    <Text className="text-xs" style={{ color: theme.colors.secondaryText }}>
      {text}
    </Text>
  );
}

function Label({ text }: { text: string }) {
  const { theme } = useTheme();

  return (
    <Text className="mb-1.5 text-xs font-black uppercase tracking-wide" style={{ color: theme.colors.secondaryText }}>
      {text}
    </Text>
  );
}

function PrioritySegment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 rounded-xl border px-2 py-2.5 active:opacity-80"
      style={{
        borderColor: active ? colors.accent : colors.border,
        backgroundColor: active ? colors.accentSoft : colors.input,
      }}
    >
      <Text className="text-center text-xs font-bold capitalize" style={{ color: active ? colors.accent : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

function MetaChip({ label, theme, tone }: { label: string; theme: AppTheme; tone?: TaskPlanPriority }) {
  const { colors } = theme;
  const color =
    tone === 'high' ? colors.error : tone === 'low' ? colors.success : tone === 'medium' ? colors.warning : colors.accent;

  return (
    <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: `${color}26` }}>
      <Text className="text-xs font-bold capitalize" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

function SubtaskRow({
  subtask,
  editing,
  onChangeTitle,
  onChangeMinutes,
  onDelete,
}: {
  subtask: TaskPlan['subtasks'][number];
  editing: boolean;
  onChangeTitle: (value: string) => void;
  onChangeMinutes: (value: number) => void;
  onDelete: () => void;
}) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="mb-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.background }}>
      {editing ? (
        <View className="flex-row items-center gap-2">
          <Text className="text-xs font-black" style={{ color: colors.accent }}>
            {subtask.order}.
          </Text>
          <TextInput
            value={subtask.title}
            onChangeText={onChangeTitle}
            className="flex-1 rounded-lg border px-2.5 py-2 text-sm"
            style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
          />
          <TextInput
            value={String(subtask.estimatedMinutes)}
            onChangeText={(value) => onChangeMinutes(Math.max(0, Number(value.replace(/[^0-9]/g, '')) || 0))}
            keyboardType="number-pad"
            className="w-16 rounded-lg border px-2 py-2 text-center text-sm"
            style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
          />
          <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel="Delete subtask">
            <Text className="text-xs font-black" style={{ color: colors.error }}>
              Remove
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-sm font-semibold" style={{ color: colors.text }}>
              <Text style={{ color: colors.accent }}>{subtask.order}. </Text>
              {subtask.title}
            </Text>
            {subtask.description ? (
              <Text className="mt-0.5 text-xs leading-4" style={{ color: colors.secondaryText }}>
                {subtask.description}
              </Text>
            ) : null}
          </View>
          <View className="shrink-0 rounded-full px-2 py-1" style={{ backgroundColor: colors.accentSoft }}>
            <Text className="text-[11px] font-bold" style={{ color: colors.accent }}>
              {formatMinutes(subtask.estimatedMinutes)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function FocusSessionRow({
  session,
  editing,
  onDelete,
}: {
  session: TaskPlan['focusSessions'][number];
  editing: boolean;
  onDelete: () => void;
}) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="mb-2 flex-row items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.background }}>
      <View className="flex-1">
        <Text className="text-sm font-semibold" style={{ color: colors.text }}>
          {session.title}
        </Text>
        <Text className="mt-0.5 text-xs" style={{ color: colors.secondaryText }}>
          {formatDateTime(session.startTime)} – {formatTime(session.endTime)}
          {session.relatedSubtaskTitle ? ` · ${session.relatedSubtaskTitle}` : ''}
        </Text>
      </View>
      {editing ? (
        <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel="Delete focus session">
          <Text className="text-xs font-black" style={{ color: colors.error }}>
            Remove
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ReminderRow({
  reminder,
  editing,
  onDelete,
}: {
  reminder: TaskPlan['reminders'][number];
  editing: boolean;
  onDelete: () => void;
}) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="mb-2 flex-row items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.background }}>
      <View className="flex-1">
        <Text className="text-sm font-semibold" style={{ color: colors.text }}>
          {reminder.title}
        </Text>
        <Text className="mt-0.5 text-xs" style={{ color: colors.secondaryText }}>
          {formatDateTime(reminder.remindAt)}
        </Text>
      </View>
      {editing ? (
        <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel="Delete reminder">
          <Text className="text-xs font-black" style={{ color: colors.error }}>
            Remove
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function formatDate(value: string | null) {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No due date';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function formatMinutes(minutes: number) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

function formatHours(minutes: number) {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}
