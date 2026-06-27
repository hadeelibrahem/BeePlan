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

interface ForgotPasswordScreenProps {
  onBack: () => void;
  onReset: () => void;
}

export default function ForgotPasswordScreen({ onBack, onReset }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = () => {
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
    setTimeout(() => {
      setIsLoading(false);
      setSent(true);
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
            {sent ? (
              <View className="items-center">
                <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl border border-[#F5C542]/30 bg-[#F5C542]/10">
                  <Text className="text-xl font-black text-[#F5C542]">@</Text>
                </View>
                <Text className="text-center text-2xl font-black text-white">Check your email</Text>
                <Text className="mt-3 text-center text-sm leading-6 text-[#A1A7B3]">
                  We sent a password reset link to{' '}
                  <Text className="font-bold text-[#F5C542]">{email}</Text>.
                </Text>

                <Pressable onPress={onReset} className="mt-6 h-13 w-full items-center justify-center rounded-2xl bg-[#F5C542] py-4">
                  <Text className="text-sm font-black uppercase tracking-wider text-[#121820]">
                    Create New Password
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setSent(false);
                    setEmail('');
                  }}
                  className="mt-3 h-12 w-full items-center justify-center rounded-2xl border border-[#272D36] bg-[#0E1116]"
                >
                  <Text className="text-sm font-bold text-[#A1A7B3]">Resend Email</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View className="mb-5 items-center">
                  <View className="h-12 w-12 items-center justify-center rounded-2xl border border-[#F5C542]/30 bg-[#F5C542]/10">
                    <Text className="text-lg font-black text-[#F5C542]">?</Text>
                  </View>
                </View>
                <Text className="text-center text-2xl font-black text-white">Forgot Password?</Text>
                <Text className="mt-2 text-center text-sm leading-6 text-[#A1A7B3]">
                  Enter your email and we will send you a reset link.
                </Text>

                <View className="mt-6">
                  <Text className="mb-2 text-xs font-black uppercase tracking-widest text-[#7F8794]">
                    Email Address
                  </Text>
                  <View className={`rounded-2xl border bg-[#0E1116] px-4 py-3 ${error ? 'border-red-500' : 'border-[#272D36]'}`}>
                    <TextInput
                      placeholder="name@example.com"
                      placeholderTextColor="#5F6876"
                      value={email}
                      onChangeText={(value) => {
                        setEmail(value);
                        setError('');
                      }}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      returnKeyType="send"
                      onSubmitEditing={handleSend}
                      className="text-base text-white"
                    />
                  </View>
                  {!!error && <Text className="mt-1 pl-1 text-xs text-red-400">{error}</Text>}
                  <Text className="mt-2 text-xs leading-5 text-[#A1A7B3]">
                    Use the email associated with your BeePlan account.
                  </Text>
                </View>

                <Pressable
                  onPress={handleSend}
                  disabled={isLoading}
                  className="mt-6 h-14 items-center justify-center rounded-2xl bg-[#F5C542]"
                >
                  {isLoading ? (
                    <ActivityIndicator color="#121820" />
                  ) : (
                    <Text className="text-sm font-black uppercase tracking-wider text-[#121820]">
                      Send Reset Link
                    </Text>
                  )}
                </Pressable>
              </>
            )}

            <View className="mt-6 flex-row flex-wrap items-center justify-center">
              <Text className="text-sm text-[#A1A7B3]">Remember your password? </Text>
              <Pressable onPress={onBack}>
                <Text className="text-sm font-bold text-[#F5C542] underline">Back to Sign In</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
