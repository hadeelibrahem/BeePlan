import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import BeePlanLogo from '../components/BeePlanLogo';
import { useAuth } from '../hooks/useAuth';
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#2B323F]"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
        className="px-6"
      >
        <View className="py-10">
          {/* Logo / Brand Header */}
          <View className="items-center mb-8">
            <BeePlanLogo size={64} showTagline />
          </View>

          {/* Form Card */}
          <View className="bg-[#353D4E] rounded-3xl p-6 border border-[#434D62] shadow-2xl">
            {/* Header within card */}
            <Text className="text-2xl font-bold text-white text-center">
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </Text>
            <Text className="text-sm text-[#8C9BAE] text-center mt-2 mb-6">
              {isSignUp
                ? 'Start organizing your reminders and plans with BeePlan.'
                : 'Sign in to manage your reminders, tasks, and smart plans.'}
            </Text>

            {/* Inputs Container */}
            <View className="gap-4">
              {/* Full Name Input (Sign Up Only) */}
              {isSignUp && (
                <View>
                  <Text className="text-xs font-semibold text-[#8C9BAE] uppercase tracking-wider mb-2">
                    Full Name
                  </Text>
                  <View
                    className={`bg-[#2B323F] rounded-2xl px-4 py-3.5 border ${
                      errors.name ? 'border-red-500' : 'border-[#434D62]'
                    }`}
                  >
                    <TextInput
                      placeholder="e.g. John Doe"
                      placeholderTextColor="#64748B"
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
                      className="text-white text-base"
                    />
                  </View>
                  {errors.name && (
                    <Text className="text-red-400 text-xs mt-1 ml-1">{errors.name}</Text>
                  )}
                </View>
              )}

              {/* Email Input */}
              <View>
                <Text className="text-xs font-semibold text-[#8C9BAE] uppercase tracking-wider mb-2">
                  Email Address
                </Text>
                <View
                  className={`bg-[#2B323F] rounded-2xl px-4 py-3.5 border ${
                    errors.email ? 'border-red-500' : 'border-[#434D62]'
                  }`}
                >
                  <TextInput
                    placeholder="name@example.com"
                    placeholderTextColor="#64748B"
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
                    autoCorrect={false}
                    className="text-white text-base"
                  />
                </View>
                {errors.email && (
                  <Text className="text-red-400 text-xs mt-1 ml-1">{errors.email}</Text>
                )}
              </View>

              {/* Password Input */}
              <View>
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-xs font-semibold text-[#8C9BAE] uppercase tracking-wider">
                    Password
                  </Text>
                  {!isSignUp && (
                    <Pressable onPress={onForgotPassword}>
                      <Text className="text-xs font-semibold text-[#FDEF4B]">
                        Forgot Password?
                      </Text>
                    </Pressable>
                  )}
                </View>
                <View
                  className={`bg-[#2B323F] rounded-2xl px-4 py-3.5 border flex-row justify-between items-center ${
                    errors.password ? 'border-red-500' : 'border-[#434D62]'
                  }`}
                >
                  <TextInput
                    placeholder="Enter password"
                    placeholderTextColor="#64748B"
                    value={password}
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
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="text-white text-base flex-1"
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)}>
                    <Text className="text-xs font-semibold text-[#8C9BAE] px-2">
                      {showPassword ? 'HIDE' : 'SHOW'}
                    </Text>
                  </Pressable>
                </View>
                {errors.password && (
                  <Text className="text-red-400 text-xs mt-1 ml-1">{errors.password}</Text>
                )}
                {isSignUp && password && (
                  <Text className="text-[#8C9BAE] text-xs mt-1 ml-1">
                    Password strength: <Text className="text-white font-bold">{passwordStrength}</Text>
                  </Text>
                )}
              </View>

              {/* Confirm Password Input (Sign Up Only) */}
              {isSignUp && (
                <View>
                  <Text className="text-xs font-semibold text-[#8C9BAE] uppercase tracking-wider mb-2">
                    Confirm Password
                  </Text>
                  <View
                    className={`bg-[#2B323F] rounded-2xl px-4 py-3.5 border ${
                      errors.confirmPassword ? 'border-red-500' : 'border-[#434D62]'
                    }`}
                  >
                    <TextInput
                      placeholder="Re-enter password"
                      placeholderTextColor="#64748B"
                      value={confirmPassword}
                      onChangeText={(value) => {
                        setConfirmPassword(value);
                        setErrors((previous) => ({
                          ...previous,
                          confirmPassword:
                            validateSignUp({ ...signUpFields, confirmPassword: value }).confirmPassword,
                        }));
                        setSubmitError('');
                        setSuccessMessage('');
                      }}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="text-white text-base"
                    />
                  </View>
                  {errors.confirmPassword && (
                    <Text className="text-red-400 text-xs mt-1 ml-1">
                      {errors.confirmPassword}
                    </Text>
                  )}
                </View>
              )}
              {(oauthError || submitError) && (
                <Text className="text-red-400 text-xs mt-1 ml-1">{oauthError || submitError}</Text>
              )}
              {oauthMessage && (
                <Text className="text-emerald-400 text-xs mt-1 ml-1">{oauthMessage}</Text>
              )}
              {successMessage && (
                <Text className="text-emerald-400 text-xs mt-1 ml-1">{successMessage}</Text>
              )}

              {/* Submit CTA Button */}
              <Pressable
                onPress={handleSubmit}
                disabled={isSubmitDisabled}
                className={`h-14 rounded-2xl bg-[#FDEF4B] items-center justify-center mt-4 shadow-lg shadow-[#FDEF4B]/20 active:opacity-90 ${
                  isSubmitDisabled ? 'opacity-70' : ''
                }`}
              >
                {isLoading ? (
                  <ActivityIndicator color="#2B323F" />
                ) : (
                  <Text className="text-[#2B323F] font-bold text-base uppercase tracking-wider">
                    {isSignUp ? 'Create Account' : 'Sign In'}
                  </Text>
                )}
              </Pressable>
            </View>

            {/* Divider */}
            <View className="flex-row items-center my-6">
              <View className="flex-1 h-px bg-[#434D62]" />
              <Text className="text-[#8C9BAE] text-xs font-semibold uppercase tracking-wider px-3">
                or continue with
              </Text>
              <View className="flex-1 h-px bg-[#434D62]" />
            </View>

            {/* Social Authentication Buttons */}
            <View className="flex-row gap-3">
              {/* Google Button */}
              <Pressable
                onPress={handleGoogleSignIn}
                disabled={isLoading || isGoogleLoading}
                accessibilityRole="button"
                accessibilityLabel="Continue with Google"
                className={`flex-1 h-12 border border-[#434D62] bg-[#2B323F] rounded-2xl flex-row items-center justify-center active:bg-[#353D4E] ${
                  isGoogleLoading ? 'opacity-70' : ''
                }`}
              >
                {/* Custom Google Logo drawing using layout */}
                <View className="flex-row items-center">
                  {isGoogleLoading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <View className="w-5 h-5 rounded-full bg-white mr-2 items-center justify-center">
                        <Text className="text-xs font-black text-[#2B323F]">G</Text>
                      </View>
                      <Text className="text-white font-semibold text-sm">Google</Text>
                    </>
                  )}
                </View>
              </Pressable>

              {/* Apple Button */}
              <Pressable
                disabled
                accessibilityRole="button"
                accessibilityLabel="Apple Sign In will be available in the production version"
                className="flex-1 h-12 border border-[#434D62] bg-[#2B323F] rounded-2xl flex-row items-center justify-center opacity-60"
              >
                {/* Apple icon representation */}
                <View className="flex-row items-center">
                  <View className="w-5 h-5 rounded-full bg-white mr-2 items-center justify-center">
                    <Text className="text-xs font-black text-[#2B323F]">A</Text>
                  </View>
                  <Text className="text-white font-semibold text-sm">Coming Soon</Text>
                </View>
              </Pressable>
            </View>
          </View>

          {/* Bottom Switch Toggle */}
          <View className="flex-row justify-center items-center mt-6">
            <Text className="text-[#8C9BAE] text-sm">
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            </Text>
            <Pressable onPress={toggleMode}>
              <Text className="text-[#FDEF4B] text-sm font-bold underline">
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
