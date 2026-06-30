import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InputField, PrimaryButton, SectionCard } from '../components/layout';
import BeePlanLogo from '../components/BeePlanLogo';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../theme/useTheme';
import type { AppTheme } from '../theme/colors';

interface ResetPasswordScreenProps {
  initialEmail?: string;
  initialCode?: string;
  onBack: () => void;
}

function getStrength(pwd: string, theme: AppTheme): { label: string; color: string; pct: number } | null {
  if (!pwd) return null;
  const len = pwd.length;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasDigit = /\d/.test(pwd);
  const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
  const score = (len >= 6 ? 1 : 0) + (len >= 10 ? 1 : 0) + (hasUpper ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSpecial ? 1 : 0);
  if (score <= 1) return { label: 'Weak', color: theme.colors.error, pct: 0.25 };
  if (score <= 3) return { label: 'Fair', color: theme.colors.accent, pct: 0.6 };
  return { label: 'Strong', color: theme.colors.success, pct: 1 };
}

export default function ResetPasswordScreen({ initialEmail = '', initialCode = '', onBack }: ResetPasswordScreenProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const { updatePassword, verifyRecoveryCode } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState(initialCode);
  const [codeVerified, setCodeVerified] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ [k: string]: string }>({});
  const [submitError, setSubmitError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const strength = getStrength(password, theme);

  const handleVerifyCode = async () => {
    const e: { [k: string]: string } = {};
    if (!email.trim()) e.email = 'Email address is required';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Please enter a valid email';
    if (!code.trim()) e.code = 'Reset code is required';
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setSubmitError('');
    setIsLoading(true);
    try {
      await verifyRecoveryCode(email, code);
      setErrors({});
      setCodeVerified(true);
      setIsLoading(false);
    } catch (err) {
      setIsLoading(false);
      setSubmitError(err instanceof Error ? err.message : 'Invalid or expired reset code. Please request a new code.');
    }
  };

  const handleSubmit = async () => {
    const e: { [k: string]: string } = {};
    if (!password) e.password = 'Password is required';
    else if (password.length < 8) e.password = 'Password must be at least 8 characters';
    if (!confirmPassword) e.confirmPassword = 'Please confirm your password';
    else if (confirmPassword !== password) e.confirmPassword = 'Passwords do not match';
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setSubmitError('');
    setIsLoading(true);
    try {
      await updatePassword(password);
      setIsLoading(false);
      setIsDone(true);
      setTimeout(onBack, 1000);
    } catch (err) {
      setIsLoading(false);
      setSubmitError(err instanceof Error ? err.message : 'Unable to update password. Please open the reset link again.');
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

          {isDone ? (
            <View className="w-full items-center">
              <View className="relative mb-5 h-[72px] w-[72px] items-center justify-center rounded-full border-[3px]" style={{ borderColor: colors.accent }}>
                <View
                  className="absolute h-[3px] w-3.5 rounded"
                  style={{ bottom: 24, left: 14, transform: [{ rotate: '45deg' }], backgroundColor: colors.accent }}
                />
                <View
                  className="absolute h-[3px] w-6 rounded"
                  style={{ bottom: 26, right: 10, transform: [{ rotate: '-52deg' }], backgroundColor: colors.accent }}
                />
              </View>

              <Text className="mb-2.5 text-center text-xl font-extrabold" style={{ color: colors.text }}>Password Updated!</Text>
              <Text className="mb-6 px-2.5 text-center text-xs leading-5" style={{ color: colors.secondaryText }}>
                Your BeePlan password has been reset successfully. Opening your workspace...
              </Text>

              <PrimaryButton onPress={onBack} fullWidth>
                Open BeePlan
              </PrimaryButton>
            </View>
          ) : (
            <View className="w-full items-center">
              <View
                className="mb-4 h-[52px] w-[52px] items-center justify-center rounded-2xl border"
                style={{ borderColor: `${colors.accent}66`, backgroundColor: colors.accentSoft }}
              >
                <View className="h-[26px] w-6 items-center justify-center rounded-tl-lg rounded-tr-lg rounded-bl-xl rounded-br-xl" style={{ backgroundColor: colors.accent }}>
                  <View className="h-4 w-3.5 rounded-tl-md rounded-tr-md rounded-bl-lg rounded-br-lg border-[1.5px]" style={{ borderColor: colors.accentText, backgroundColor: `${colors.accent}4D` }} />
                </View>
              </View>

              <Text className="mb-2.5 text-center text-xl font-extrabold" style={{ color: colors.text }}>
                {codeVerified ? 'Create New Password' : 'Enter Reset Code'}
              </Text>
              <Text className="mb-6 px-2.5 text-center text-xs leading-5" style={{ color: colors.secondaryText }}>
                {codeVerified
                  ? 'Choose a strong password to protect your BeePlan account.'
                  : 'Enter the code we sent to your email before creating a new password.'}
              </Text>

              {codeVerified ? (
                <View className="w-full">
                  <View className="mb-4">
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.secondaryText }}>New Password</Text>
                      <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Toggle password visibility">
                        <Text className="text-[10px] font-bold" style={{ color: colors.secondaryText }}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
                      </Pressable>
                    </View>
                    <InputField
                      placeholder="Enter new password"
                      value={password}
                      onChangeText={(v) => {
                        setPassword(v);
                        setErrors((p) => ({ ...p, password: '' }));
                        setSubmitError('');
                      }}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      error={errors.password}
                    />
                    {strength && (
                      <View className="mt-2 gap-1">
                        <View className="h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: colors.border }}>
                          <View className="h-full rounded-full" style={{ width: `${strength.pct * 100}%`, backgroundColor: strength.color }} />
                        </View>
                        <Text className="text-[10px]" style={{ color: colors.secondaryText }}>
                          Strength: <Text className="font-bold" style={{ color: colors.text }}>{strength.label}</Text>
                        </Text>
                      </View>
                    )}
                  </View>

                  <InputField
                    label="Confirm New Password"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChangeText={(v) => {
                      setConfirmPassword(v);
                      setErrors((p) => ({ ...p, confirmPassword: '' }));
                      setSubmitError('');
                    }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    error={errors.confirmPassword || submitError || undefined}
                  />

                  <View className="mb-1 gap-1">
                    <Text className="text-[10px] leading-4" style={{ color: colors.secondaryText }}>• At least 8 characters</Text>
                    <Text className="text-[10px] leading-4" style={{ color: colors.secondaryText }}>
                      • Mix of uppercase, numbers &amp; symbols for best security
                    </Text>
                  </View>

                  <PrimaryButton onPress={() => void handleSubmit()} disabled={isLoading} loading={isLoading} fullWidth className="mt-4">
                    Update Password
                  </PrimaryButton>
                </View>
              ) : (
                <View className="w-full">
                  <InputField
                    label="Email Address"
                    placeholder="name@example.com"
                    value={email}
                    onChangeText={(v) => {
                      setEmail(v);
                      setErrors((p) => ({ ...p, email: '' }));
                      setSubmitError('');
                    }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    error={errors.email}
                  />

                  <InputField
                    label="Reset Code"
                    placeholder="Enter the code from your email"
                    value={code}
                    onChangeText={(v) => {
                      setCode(v);
                      setErrors((p) => ({ ...p, code: '' }));
                      setSubmitError('');
                    }}
                    keyboardType="number-pad"
                    error={errors.code || submitError || undefined}
                  />
                  {!!initialCode && (
                    <Text className="mb-1 text-xs font-bold" style={{ color: colors.accent }}>Development code: {initialCode}</Text>
                  )}

                  <PrimaryButton onPress={() => void handleVerifyCode()} disabled={isLoading} loading={isLoading} fullWidth className="mt-4">
                    Verify Code
                  </PrimaryButton>
                </View>
              )}

              <View className="mt-5 flex-row flex-wrap items-center justify-center">
                <Text className="text-xs" style={{ color: colors.secondaryText }}>Changed your mind? </Text>
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
