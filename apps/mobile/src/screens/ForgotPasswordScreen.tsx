import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InputField, OutlineButton, PrimaryButton, SectionCard } from '../components/layout';
import BeePlanLogo from '../components/BeePlanLogo';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../theme/useTheme';

interface ForgotPasswordScreenProps {
  onBack: () => void;
  onReset: (email: string, devResetCode?: string) => void;
}

export default function ForgotPasswordScreen({ onBack, onReset }: ForgotPasswordScreenProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    setSubmitError('');
    if (!email.trim()) {
      setError('Email address is required');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const devResetCode = await sendPasswordReset(email);
      setIsLoading(false);
      onReset(email.trim(), devResetCode);
    } catch (err) {
      setIsLoading(false);
      const message = err instanceof Error ? err.message : '';
      setSubmitError(message || 'Unable to send reset code. Please try again.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 15 }).map((_, row) =>
          Array.from({ length: 8 }).map((_, col) => (
            <View
              key={`${row}-${col}`}
              style={{
                position: 'absolute',
                top: row * 54 + 14,
                left: col * 54 + 14,
                width: 2,
                height: 2,
                borderRadius: 1,
                backgroundColor: colors.accent,
                opacity: 0.06,
              }}
            />
          )),
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 48 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SectionCard className="w-full max-w-[400px] items-center px-6 py-8">
          <BeePlanLogo size={50} showTagline style={{ marginBottom: 22 }} />

          {sent ? (
            <View className="w-full items-center">
              <IconBox>
                <View className="h-5 w-7 items-center justify-center gap-1 rounded border-2" style={{ borderColor: colors.accent }}>
                  <View className="h-0.5 w-4 rounded-full" style={{ backgroundColor: colors.accent }} />
                  <View className="h-0.5 w-[22px] rounded-full" style={{ backgroundColor: colors.accent }} />
                </View>
              </IconBox>

              <Text className="mb-2.5 text-center text-xl font-extrabold" style={{ color: colors.text }}>Check your email</Text>
              <Text className="mb-6 px-2.5 text-center text-xs leading-5" style={{ color: colors.secondaryText }}>
                We sent a 6-digit reset code. Enter it to create a new password.
              </Text>

              <PrimaryButton onPress={() => onReset(email.trim())} fullWidth>
                Enter Reset Code
              </PrimaryButton>

              <OutlineButton
                onPress={() => {
                  setSent(false);
                  setEmail('');
                  setSubmitError('');
                }}
                fullWidth
                className="mt-3"
              >
                Send Another Code
              </OutlineButton>

              <View className="mt-5 flex-row flex-wrap items-center justify-center">
                <Text className="text-xs" style={{ color: colors.secondaryText }}>Remember your password? </Text>
                <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to sign in">
                  <Text className="text-xs font-extrabold underline" style={{ color: colors.accent }}>Back to Sign In</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View className="w-full items-center">
              <IconBox>
                <View className="mb-[-1px] h-2.5 w-[18px] rounded-t-full border-2 border-b-0" style={{ borderColor: colors.accent }} />
                <View className="h-4 w-[22px] rounded" style={{ backgroundColor: colors.accent }} />
              </IconBox>

              <Text className="mb-2.5 text-center text-xl font-extrabold" style={{ color: colors.text }}>Forgot Password?</Text>
              <Text className="mb-6 px-2.5 text-center text-xs leading-5" style={{ color: colors.secondaryText }}>
                Enter your email and we'll send you a reset code to get back into your account.
              </Text>

              <View className="w-full">
                <InputField
                  label="Email Address"
                  placeholder="name@example.com"
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    setError('');
                    setSubmitError('');
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  error={error || submitError || undefined}
                />

                <Text className="mb-1 text-[10px] leading-4" style={{ color: colors.secondaryText }}>
                  Make sure you enter the email associated with your BeePlan account.
                </Text>

                <PrimaryButton onPress={() => void handleSend()} disabled={isLoading} loading={isLoading} fullWidth className="mt-4">
                  Send Reset Code
                </PrimaryButton>
              </View>

              <View className="mt-5 flex-row flex-wrap items-center justify-center">
                <Text className="text-xs" style={{ color: colors.secondaryText }}>Remember your password? </Text>
                <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to sign in">
                  <Text className="text-xs font-extrabold underline" style={{ color: colors.accent }}>Back to Sign In</Text>
                </Pressable>
              </View>
            </View>
          )}
        </SectionCard>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function IconBox({ children }: { children: ReactNode }) {
  const { theme } = useTheme();

  return (
    <View
      className="mb-4 h-[52px] w-[52px] items-center justify-center rounded-2xl border"
      style={{ borderColor: `${theme.colors.accent}66`, backgroundColor: theme.colors.accentSoft }}
    >
      {children}
    </View>
  );
}
