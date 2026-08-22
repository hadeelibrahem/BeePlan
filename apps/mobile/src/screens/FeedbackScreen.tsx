import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  type View as NativeView,
  View,
} from 'react-native';
import { ChevronUp, Lightbulb } from 'lucide-react-native';
import { feedbackApi, type FeedbackItem } from '../features/feedback/feedbackApi';
import { mergeFeedbackPages } from '../features/feedback/feedbackPagination';
import {
  KeyboardSafeForm,
  type KeyboardSafeFormHandle,
} from '../components/layout/KeyboardSafeForm';
import { useTheme } from '../theme/useTheme';
import { useLanguage } from '../i18n/LanguageContext';

const sorts = ['most_voted', 'newest', 'recently_updated'] as const;

export default function FeedbackScreen({
  accessToken,
  onOpen,
  onBack,
}: {
  accessToken: string;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const client = useQueryClient();
  const [sort, setSort] = useState<(typeof sorts)[number]>('most_voted');
  const [refresh, setRefresh] = useState(0);
  const [share, setShare] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ['feedback', sort, refresh],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => feedbackApi.list(accessToken, sort, pageParam),
    getNextPageParam: (last, pages) => (
      pages.flatMap(page => page.items).length < last.total ? pages.length + 1 : undefined
    ),
  });
  const vote = useMutation({
    mutationFn: (item: FeedbackItem) => feedbackApi.vote(accessToken, item.id, item.voted),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['feedback'] }),
  });
  const items = mergeFeedbackPages(query.data?.pages ?? []);

  return (
    <View className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <Pressable onPress={onBack}>
          <Text style={{ color: theme.colors.accent }}>‹ {t('actions.back')}</Text>
        </Pressable>
        <Text className="mt-4 text-3xl font-black" style={{ color: theme.colors.text }}>
          {t('feedback.title')}
        </Text>
        <Text className="mt-1" style={{ color: theme.colors.secondaryText }}>
          {t('feedback.subtitle')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('feedback.share')}
          onPress={() => setShare(true)}
          className="mt-5 flex-row items-center justify-center rounded-2xl py-3"
          style={{ backgroundColor: theme.colors.accent }}
        >
          <Lightbulb size={18} color={theme.colors.accentText} />
          <Text className="ml-2 font-bold" style={{ color: theme.colors.accentText }}>
            {t('feedback.share')}
          </Text>
        </Pressable>
        <View className="mt-5 flex-row rounded-xl p-1" style={{ backgroundColor: theme.colors.navigation }}>
          {sorts.map(value => (
            <Pressable
              key={value}
              onPress={() => setSort(value)}
              className="flex-1 rounded-lg px-1 py-2"
              style={{ backgroundColor: sort === value ? theme.colors.surfaceElevated : 'transparent' }}
            >
              <Text className="text-center text-xs font-bold" style={{ color: theme.colors.text }}>
                {t(`feedback.sort.${value}`)}
              </Text>
            </Pressable>
          ))}
        </View>
        {query.isLoading ? (
          <ActivityIndicator className="mt-8" color={theme.colors.accent} />
        ) : query.isError ? (
          <Text className="mt-8 text-center" style={{ color: theme.colors.secondaryText }}>
            {t('feedback.error')}
          </Text>
        ) : items.length ? (
          items.map(item => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => onOpen(item.id)}
              className="mt-3 rounded-2xl p-4"
              style={{ backgroundColor: theme.colors.surfaceElevated }}
            >
              <View className="flex-row">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.voted ? t('feedback.voted') : t('feedback.vote')}
                  disabled={vote.isPending}
                  onPress={event => {
                    event.stopPropagation();
                    vote.mutate(item);
                  }}
                  className="mr-3 items-center justify-center rounded-xl px-3"
                  style={{ backgroundColor: item.voted ? theme.colors.accent : theme.colors.accentSoft }}
                >
                  <ChevronUp size={20} color={item.voted ? theme.colors.accentText : theme.colors.accentInk} />
                  <Text className="font-bold" style={{ color: item.voted ? theme.colors.accentText : theme.colors.accentInk }}>
                    {item.voteCount}
                  </Text>
                </Pressable>
                <View className="flex-1">
                  <Text className="font-bold" style={{ color: theme.colors.text }}>{item.title}</Text>
                  <Text className="mt-1 text-xs" style={{ color: theme.colors.secondaryText }}>
                    {t(`feedback.category.${item.category}`)} · {t(`feedback.status.${item.status}`)} · {item.author.displayName}
                  </Text>
                  <Text className="mt-2 text-sm" numberOfLines={2} style={{ color: theme.colors.secondaryText }}>
                    {item.description}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))
        ) : (
          <View className="mt-8 items-center">
            <Lightbulb color={theme.colors.accent} size={30} />
            <Text className="mt-3 font-bold" style={{ color: theme.colors.text }}>{t('feedback.emptyTitle')}</Text>
            <Text className="mt-1 text-center" style={{ color: theme.colors.secondaryText }}>
              {t('feedback.emptyDescription')}
            </Text>
          </View>
        )}
        {query.hasNextPage ? (
          <Pressable
            disabled={query.isFetchingNextPage}
            onPress={() => void query.fetchNextPage()}
            className="mt-5 rounded-xl py-3"
            style={{ backgroundColor: theme.colors.navigation }}
          >
            <Text className="text-center font-bold" style={{ color: theme.colors.text }}>
              {t('feedback.loadMore')}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <ShareIdeaModal
        visible={share}
        token={accessToken}
        onClose={() => setShare(false)}
        onSaved={() => {
          setShare(false);
          setRefresh(value => value + 1);
        }}
      />
    </View>
  );
}

function ShareIdeaModal({
  visible,
  token,
  onClose,
  onSaved,
}: {
  visible: boolean;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const formRef = useRef<KeyboardSafeFormHandle>(null);
  const titleFieldRef = useRef<NativeView>(null);
  const descriptionFieldRef = useRef<NativeView>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<FeedbackItem['category']>('idea');
  const submit = useMutation({
    mutationFn: () => feedbackApi.submit(token, {
      title: title.trim(),
      description: description.trim(),
      category,
    }),
    onSuccess: () => {
      setTitle('');
      setDescription('');
      onSaved();
    },
    onError: () => Alert.alert(t('feedback.error')),
  });
  const valid = title.trim().length >= 3 && description.trim().length >= 10;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,.4)' }}>
        <KeyboardSafeForm
          ref={formRef}
          sheetStyle={{ backgroundColor: theme.colors.surfaceElevated }}
          header={(
            <Text className="text-xl font-black" style={{ color: theme.colors.text }}>
              {t('feedback.share')}
            </Text>
          )}
          actions={(
            <View className="flex-row gap-3" testID="share-idea-actions">
              <Pressable accessibilityRole="button" onPress={onClose} className="flex-1 items-center rounded-xl py-3">
                <Text style={{ color: theme.colors.text }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!valid || submit.isPending}
                onPress={() => submit.mutate()}
                className="flex-1 items-center rounded-xl py-3"
                style={{ backgroundColor: theme.colors.accent }}
              >
                <Text style={{ color: theme.colors.accentText }}>
                  {submit.isPending ? t('feedback.submitting') : t('feedback.submit')}
                </Text>
              </Pressable>
            </View>
          )}
        >
          <View ref={titleFieldRef} collapsable={false} testID="share-idea-title-field">
            <TextInput
              value={title}
              onChangeText={setTitle}
              onFocus={() => formRef.current?.scrollToField('title', titleFieldRef.current)}
              placeholder={t('feedback.titleField')}
              placeholderTextColor={theme.colors.secondaryText}
              className="rounded-xl p-3"
              style={{ backgroundColor: theme.colors.background, color: theme.colors.text }}
            />
          </View>
          <View ref={descriptionFieldRef} collapsable={false} testID="share-idea-description-field" className="mt-3">
            <TextInput
              value={description}
              onChangeText={setDescription}
              onFocus={() => formRef.current?.scrollToField('description', descriptionFieldRef.current)}
              placeholder={t('feedback.description')}
              placeholderTextColor={theme.colors.secondaryText}
              multiline
              scrollEnabled
              textAlignVertical="top"
              className="rounded-xl p-3"
              style={{
                backgroundColor: theme.colors.background,
                color: theme.colors.text,
                minHeight: 130,
                maxHeight: 180,
              }}
            />
          </View>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {(['idea', 'improvement', 'problem', 'other'] as const).map(value => (
              <Pressable key={value} onPress={() => setCategory(value)} className="rounded-lg px-3 py-2">
                <Text style={{ color: theme.colors.text }}>{value}</Text>
              </Pressable>
            ))}
          </View>
        </KeyboardSafeForm>
      </View>
    </Modal>
  );
}
