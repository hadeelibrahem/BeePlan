import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { AppScreen, InputField, OutlineButton, PrimaryButton, SectionCard } from '../components/layout';
import BeePlanLogo from '../components/BeePlanLogo';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../theme/useTheme';
import {
  getPasswordStrength,
  hasNoErrors,
  validateSignIn,
  validateSignUp,
  type AuthErrors,
} from '../lib/authValidation';

interface AuthScreenProps {
  onSuccess?: (email: string) => void;
  onForgotPassword?: () => void;
}

export default function AuthScreen({ onSuccess, onForgotPassword }: AuthScreenProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const { clearOAuthError, oauthError, oauthMessage, signIn, signInWithGoogle, signUp } = useAuth();
  const submitInFlightRef = useRef(false);
  const googleInFlightRef = useRef(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const signUpFields = { name, email, password, confirmPassword };
  const passwordStrength = getPasswordStrength(password);
  const isSignUpValid = hasNoErrors(validateSignUp(signUpFields));
  const isSubmitDisabled = isLoading || (isSignUp && !isSignUpValid);

  const validate = () => {
    const newErrors = isSignUp ? validateSignUp(signUpFields) : validateSignIn(email, password);
    setErrors(newErrors);
    return hasNoErrors(newErrors);
  };

  const handleSubmit = async () => {
    if (submitInFlightRef.current) {
      return;
    }

    setSubmitError('');
    clearOAuthError();
    setSuccessMessage('');
    if (!validate()) return;

    submitInFlightRef.current = true;
    setIsLoading(true);
    try {
      if (isSignUp) {
        const hasSession = await signUp({ fullName: name.trim(), email: email.trim(), password });
        setSuccessMessage(
          hasSession
            ? 'Account created successfully.'
            : 'Account created successfully. Please check your email to confirm it.',
        );
        if (hasSession) setTimeout(() => onSuccess?.(email), 700);
      } else {
        await signIn(email, password);
        onSuccess?.(email);
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : isSignUp
            ? 'Sign up failed. Please try again.'
            : 'Sign in failed. Please try again.',
      );
    } finally {
      submitInFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleInFlightRef.current || isLoading) {
      return;
    }

    googleInFlightRef.current = true;
    setIsGoogleLoading(true);
    setSubmitError('');
    clearOAuthError();
    setSuccessMessage('');

    try {
      await signInWithGoogle();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Google sign-in failed. Please try again.');
    } finally {
      googleInFlightRef.current = false;
      setIsGoogleLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setErrors({});
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setSubmitError('');
    clearOAuthError();
    setSuccessMessage('');
  };

  return (
    <AppScreen keyboardAvoiding scroll={false} contentClassName="px-0 pt-0">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
        className="px-6"
      >
        <View className="py-10">
          <View className="mb-8 items-center">
            <BeePlanLogo size={64} showTagline />
          </View>

          <SectionCard className="p-6">
            <Text className="text-center text-2xl font-bold" style={{ color: colors.text }}>
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </Text>
            <Text className="mb-6 mt-2 text-center text-sm" style={{ color: colors.secondaryText }}>
              {isSignUp
                ? 'Start organizing your reminders and plans with BeePlan.'
                : 'Sign in to manage your reminders, tasks, and smart plans.'}
            </Text>

            <View className="gap-4">
              {isSignUp && (
                <InputField
                  label="Full Name"
                  placeholder="e.g. John Doe"
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    setErrors((previous) => ({
                      ...previous,
                      name: isSignUp && !value.trim() ? 'Full name is required' : undefined,
                    }));
                    setSubmitError('');
                    setSuccessMessage('');
                  }}
                  error={errors.name}
                />
              )}

              <InputField
                label="Email Address"
                placeholder="name@example.com"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setErrors((previous) => ({
                    ...previous,
                    email: validateSignUp({ ...signUpFields, email: value }).email,
                  }));
                  setSubmitError('');
                  setSuccessMessage('');
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                error={errors.email}
              />

              <View>
                <View className="mb-2 flex-row items-center justify-between">
                  <Text className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.secondaryText }}>Password</Text>
                  {!isSignUp && (
                    <Pressable onPress={onForgotPassword} accessibilityRole="button" accessibilityLabel="Forgot password">
                      <Text className="text-xs font-semibold" style={{ color: colors.accent }}>Forgot Password?</Text>
                    </Pressable>
                  )}
                </View>
                <View
                  className="flex-row items-center justify-between rounded-2xl border px-4 py-3.5"
                  style={{ backgroundColor: colors.input, borderColor: errors.password ? colors.error : colors.border }}
                >
                  <TextInputPasswordField
                    value={password}
                    showPassword={showPassword}
                    onChangeText={(value) => {
                      setPassword(value);
                      setErrors((previous) => ({
                        ...previous,
                        password: isSignUp
                          ? validateSignUp({ ...signUpFields, password: value }).password
                          : undefined,
                        confirmPassword:
                          isSignUp && confirmPassword && confirmPassword !== value
                            ? 'Passwords do not match'
                            : undefined,
                      }));
                      setSubmitError('');
                      setSuccessMessage('');
                    }}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)} accessibilityRole="button" accessibilityLabel="Toggle password visibility">
                    <Text className="px-2 text-xs font-semibold" style={{ color: colors.secondaryText }}>
                      {showPassword ? 'HIDE' : 'SHOW'}
                    </Text>
                  </Pressable>
                </View>
                {errors.password && <Text className="ml-1 mt-1 text-xs" style={{ color: colors.error }}>{errors.password}</Text>}
                {isSignUp && password && (
                  <Text className="ml-1 mt-1 text-xs" style={{ color: colors.secondaryText }}>
                    Password strength: <Text className="font-bold" style={{ color: colors.text }}>{passwordStrength}</Text>
                  </Text>
                )}
              </View>

              {isSignUp && (
                <InputField
                  label="Confirm Password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChangeText={(value) => {
                    setConfirmPassword(value);
                    setErrors((previous) => ({
                      ...previous,
                      confirmPassword: validateSignUp({ ...signUpFields, confirmPassword: value }).confirmPassword,
                    }));
                    setSubmitError('');
                    setSuccessMessage('');
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  error={errors.confirmPassword}
                />
              )}

              {(oauthError || submitError) && (
                <Text className="ml-1 mt-1 text-xs" style={{ color: colors.error }}>{oauthError || submitError}</Text>
              )}
              {oauthMessage && <Text className="ml-1 mt-1 text-xs" style={{ color: colors.success }}>{oauthMessage}</Text>}
              {successMessage && <Text className="ml-1 mt-1 text-xs" style={{ color: colors.success }}>{successMessage}</Text>}

              <PrimaryButton onPress={() => void handleSubmit()} disabled={isSubmitDisabled} loading={isLoading} fullWidth className="mt-2">
                {isSignUp ? 'Create Account' : 'Sign In'}
              </PrimaryButton>
            </View>

            <View className="my-6 flex-row items-center">
              <View className="h-px flex-1" style={{ backgroundColor: colors.border }} />
              <Text className="px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.secondaryText }}>
                or continue with
              </Text>
              <View className="h-px flex-1" style={{ backgroundColor: colors.border }} />
            </View>

            <View className="flex-row gap-3">
              <OutlineButton
                onPress={() => void handleGoogleSignIn()}
                disabled={isLoading || isGoogleLoading}
                loading={isGoogleLoading}
                className="flex-1"
              >
                <View className="flex-row items-center">
                  <View className="mr-2 h-5 w-5 items-center justify-center rounded-full bg-white">
                    <Text className="text-xs font-black" style={{ color: colors.accentText }}>G</Text>
                  </View>
                  <Text className="text-sm font-semibold" style={{ color: colors.text }}>Google</Text>
                </View>
              </OutlineButton>

              <OutlineButton disabled className="flex-1">
                <View className="flex-row items-center">
                  <View className="mr-2 h-5 w-5 items-center justify-center rounded-full bg-white">
                    <Text className="text-xs font-black" style={{ color: colors.accentText }}>A</Text>
                  </View>
                  <Text className="text-sm font-semibold" style={{ color: colors.text }}>Coming Soon</Text>
                </View>
              </OutlineButton>
            </View>
          </SectionCard>

          <View className="mt-6 flex-row items-center justify-center">
            <Text className="text-sm" style={{ color: colors.secondaryText }}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            </Text>
            <Pressable onPress={toggleMode} accessibilityRole="button" accessibilityLabel="Toggle sign in or sign up">
              <Text className="text-sm font-bold underline" style={{ color: colors.accent }}>{isSignUp ? 'Sign In' : 'Sign Up'}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </AppScreen>
  );
}

function TextInputPasswordField({
  value,
  showPassword,
  onChangeText,
}: {
  value: string;
  showPassword: boolean;
  onChangeText: (value: string) => void;
}) {
  const { theme } = useTheme();

  return (
    <TextInput
      placeholder="Enter password"
      placeholderTextColor={theme.colors.placeholder}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!showPassword}
      autoCapitalize="none"
      autoCorrect={false}
      className="flex-1 text-base"
      style={{ color: theme.colors.text }}
    />
  );
}
