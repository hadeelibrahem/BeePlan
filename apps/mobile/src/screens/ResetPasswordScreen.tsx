import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import BeePlanLogo from '../components/BeePlanLogo';

function getStrength(password: string): { label: string; color: string; pct: number } | null {
  if (!password) return null;
  const score =
    (password.length >= 6 ? 1 : 0) +
    (password.length >= 10 ? 1 : 0) +
    (/[A-Z]/.test(password) ? 1 : 0) +
    (/\d/.test(password) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(password) ? 1 : 0);
  if (score <= 1) return { label: 'Weak', color: '#EF4444', pct: 25 };
  if (score <= 3) return { label: 'Fair', color: '#F5C542', pct: 60 };
  return { label: 'Strong', color: '#34D399', pct: 100 };
}

export default function ResetPasswordScreen({ onBack }: { onBack: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const strength = getStrength(password);

  const handleSubmit = () => {
    const nextErrors: { [key: string]: string } = {};
    if (!password) nextErrors.password = 'Password is required';
    else if (password.length < 6) nextErrors.password = 'Password must be at least 6 characters';
    if (!confirmPassword) nextErrors.confirmPassword = 'Please confirm your password';
    else if (confirmPassword !== password) nextErrors.confirmPassword = 'Passwords do not match';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsDone(true);
    }, 1400);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#0E1116]"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
        className="px-6"
      >
        <View className="py-10">
          <View className="mb-8 items-center">
            <BeePlanLogo size={58} showTagline />
          </View>

          <View className="rounded-3xl border border-[#272D36] bg-[#15181E] p-6">
            {isDone ? (
              <View className="items-center">
                <View className="mb-5 h-16 w-16 items-center justify-center rounded-full border border-[#F5C542] bg-[#F5C542]/10">
                  <Text className="text-2xl font-black text-[#F5C542]">OK</Text>
                </View>
                <Text className="text-center text-2xl font-black text-white">Password Updated</Text>
                <Text className="mt-3 text-center text-sm leading-6 text-[#A1A7B3]">
                  Your BeePlan password has been reset successfully.
                </Text>
                <Pressable onPress={onBack} className="mt-6 h-14 w-full items-center justify-center rounded-2xl bg-[#F5C542]">
                  <Text className="text-sm font-black uppercase tracking-wider text-[#121820]">
                    Back to Sign In
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View className="mb-5 items-center">
                  <View className="h-12 w-12 items-center justify-center rounded-2xl border border-[#F5C542]/30 bg-[#F5C542]/10">
                    <Text className="text-lg font-black text-[#F5C542]">#</Text>
                  </View>
                </View>
                <Text className="text-center text-2xl font-black text-white">Create New Password</Text>
                <Text className="mt-2 text-center text-sm leading-6 text-[#A1A7B3]">
                  Choose a strong password to protect your BeePlan account.
                </Text>

                <View className="mt-6 gap-4">
                  <PasswordField
                    label="New Password"
                    value={password}
                    onChange={(value) => {
                      setPassword(value);
                      setErrors((current) => ({ ...current, password: '' }));
                    }}
                    error={errors.password}
                    showPassword={showPassword}
                    onToggleShow={() => setShowPassword((current) => !current)}
                  />

                  {strength && (
                    <View className="gap-1">
                      <View className="h-1 overflow-hidden rounded-full bg-[#272D36]">
                        <View
                          className="h-full rounded-full"
                          style={{ width: `${strength.pct}%`, backgroundColor: strength.color }}
                        />
                      </View>
                      <Text className="text-xs text-[#A1A7B3]">
                        Strength: <Text className="font-bold text-white">{strength.label}</Text>
                      </Text>
                    </View>
                  )}

                  <PasswordField
                    label="Confirm New Password"
                    value={confirmPassword}
                    onChange={(value) => {
                      setConfirmPassword(value);
                      setErrors((current) => ({ ...current, confirmPassword: '' }));
                    }}
                    error={errors.confirmPassword}
                    showPassword={showPassword}
                  />
                </View>

                <Text className="mt-4 text-xs leading-5 text-[#A1A7B3]">
                  At least 6 characters. Use uppercase, numbers, and symbols for stronger security.
                </Text>

                <Pressable
                  onPress={handleSubmit}
                  disabled={isLoading}
                  className="mt-6 h-14 items-center justify-center rounded-2xl bg-[#F5C542]"
                >
                  {isLoading ? (
                    <ActivityIndicator color="#121820" />
                  ) : (
                    <Text className="text-sm font-black uppercase tracking-wider text-[#121820]">
                      Reset Password
                    </Text>
                  )}
                </Pressable>

                <View className="mt-6 flex-row flex-wrap items-center justify-center">
                  <Text className="text-sm text-[#A1A7B3]">Changed your mind? </Text>
                  <Pressable onPress={onBack}>
                    <Text className="text-sm font-bold text-[#F5C542] underline">Back to Sign In</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  error,
  showPassword,
  onToggleShow,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  showPassword: boolean;
  onToggleShow?: () => void;
}) {
  return (
    <View>
      <Text className="mb-2 text-xs font-black uppercase tracking-widest text-[#7F8794]">
        {label}
      </Text>
      <View className={`flex-row items-center rounded-2xl border bg-[#0E1116] px-4 py-3 ${error ? 'border-red-500' : 'border-[#272D36]'}`}>
        <TextInput
          placeholder="Enter password"
          placeholderTextColor="#5F6876"
          value={value}
          onChangeText={onChange}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          className="flex-1 text-base text-white"
        />
        {onToggleShow && (
          <Pressable onPress={onToggleShow}>
            <Text className="pl-3 text-xs font-bold text-[#A1A7B3]">
              {showPassword ? 'HIDE' : 'SHOW'}
            </Text>
          </Pressable>
        )}
      </View>
      {!!error && <Text className="mt-1 pl-1 text-xs text-red-400">{error}</Text>}
    </View>
  );
}
