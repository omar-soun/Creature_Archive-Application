import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { apiService } from '../services/apiService';
import { useTheme } from '../context/ThemeContext';

interface ForgotPasswordScreenProps {
  onNavigateToSignIn: () => void;
}

type Step = 'email' | 'verify' | 'reset' | 'success';

const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({
  onNavigateToSignIn,
}) => {
  const { isDarkMode, theme } = useTheme();

  // Step management
  const [step, setStep] = useState<Step>('email');

  // Step 1: Email
  const [email, setEmail] = useState('');

  // Step 2: Verification
  const [sessionToken, setSessionToken] = useState('');
  const [challengeFields, setChallengeFields] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Step 3: Reset password
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Refs
  const scrollViewRef = useRef<ScrollView>(null);
  const answer2Ref = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  // ── Step 1: Submit email ──────────────────────────────────────────

  const handleSubmitEmail = async () => {
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    Keyboard.dismiss();
    setIsLoading(true);

    try {
      const result = await apiService.forgotPasswordInitiate(trimmedEmail);
      setSessionToken(result.session_token);
      setChallengeFields(result.challenge_fields);
      setAnswers({});
      setStep('verify');
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 2: Verify answers ────────────────────────────────────────

  const handleVerifyAnswers = async () => {
    setError(null);

    // Check all fields are filled
    for (const field of challengeFields) {
      if (!answers[field]?.trim()) {
        setError('Please fill in all fields.');
        return;
      }
    }

    Keyboard.dismiss();
    setIsLoading(true);

    try {
      const result = await apiService.forgotPasswordVerify(sessionToken, answers);
      setResetToken(result.reset_token);
      setStep('reset');
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 3: Reset password ────────────────────────────────────────

  const handleResetPassword = async () => {
    setError(null);

    if (!newPassword.trim()) {
      setError('Please enter a new password.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      setError('Password must contain at least one uppercase letter.');
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      setError('Password must contain at least one number.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    Keyboard.dismiss();
    setIsLoading(true);

    try {
      await apiService.forgotPasswordReset(resetToken, newPassword);
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step indicator ────────────────────────────────────────────────

  const stepIndex = step === 'email' ? 0 : step === 'verify' ? 1 : step === 'reset' ? 2 : 3;

  const renderStepIndicator = () => {
    if (step === 'success') return null;

    const steps = ['Email', 'Verify', 'Reset'];
    return (
      <View style={styles.stepIndicator}>
        {steps.map((label, idx) => (
          <View key={label} style={styles.stepItem}>
            <View
              style={[
                styles.stepDot,
                idx <= stepIndex && styles.stepDotActive,
              ]}
            >
              <Text
                style={[
                  styles.stepDotText,
                  idx <= stepIndex && styles.stepDotTextActive,
                ]}
              >
                {idx + 1}
              </Text>
            </View>
            <Text
              style={[
                styles.stepLabel,
                { color: idx <= stepIndex ? theme.text : theme.textSecondary },
              ]}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  // ── Render steps ──────────────────────────────────────────────────

  const renderEmailStep = () => (
    <View style={styles.form}>
      <Text style={[styles.title, { color: theme.text }]}>Forgot Password</Text>
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        Enter your email address and we'll verify your identity using your profile information.
      </Text>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: theme.text }]}>Email</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.border, color: theme.text }]}
          placeholder="researcher@university.edu"
          placeholderTextColor={theme.textSecondary}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          returnKeyType="done"
          onSubmitEditing={handleSubmitEmail}
        />
      </View>

      {renderError()}

      <TouchableOpacity
        style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
        onPress={handleSubmitEmail}
        activeOpacity={0.85}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>Continue</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderVerifyStep = () => (
    <View style={styles.form}>
      <Text style={[styles.title, { color: theme.text }]}>Verify Your Identity</Text>
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        Please answer the following questions to verify your identity.
      </Text>

      {challengeFields.map((field, idx) => (
        <View key={field} style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>{field}</Text>
          <TextInput
            ref={idx === 1 ? answer2Ref : undefined}
            style={[styles.input, { backgroundColor: theme.border, color: theme.text }]}
            placeholder={`Enter your ${field.toLowerCase()}`}
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            value={answers[field] || ''}
            onChangeText={(text) =>
              setAnswers((prev) => ({ ...prev, [field]: text }))
            }
            returnKeyType={idx === 0 ? 'next' : 'done'}
            onSubmitEditing={
              idx === 0
                ? () => answer2Ref.current?.focus()
                : handleVerifyAnswers
            }
          />
        </View>
      ))}

      {renderError()}

      <TouchableOpacity
        style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
        onPress={handleVerifyAnswers}
        activeOpacity={0.85}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>Verify</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderResetStep = () => (
    <View style={styles.form}>
      <Text style={[styles.title, { color: theme.text }]}>Set New Password</Text>
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        Create a strong password with at least 8 characters, one uppercase letter, and one number.
      </Text>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: theme.text }]}>New Password</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={[styles.passwordInput, { backgroundColor: theme.border, color: theme.text }]}
            placeholder="Enter new password"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry={!showNewPassword}
            value={newPassword}
            onChangeText={setNewPassword}
            returnKeyType="next"
            onSubmitEditing={() => confirmPasswordRef.current?.focus()}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowNewPassword(!showNewPassword)}
            activeOpacity={0.7}
          >
            <Text style={[styles.eyeIcon, { color: theme.textSecondary }]}>
              {showNewPassword ? '🙈' : '👁'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: theme.text }]}>Confirm Password</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            ref={confirmPasswordRef}
            style={[styles.passwordInput, { backgroundColor: theme.border, color: theme.text }]}
            placeholder="Confirm new password"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry={!showConfirmPassword}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            returnKeyType="done"
            onSubmitEditing={handleResetPassword}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            activeOpacity={0.7}
          >
            <Text style={[styles.eyeIcon, { color: theme.textSecondary }]}>
              {showConfirmPassword ? '🙈' : '👁'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {renderError()}

      <TouchableOpacity
        style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
        onPress={handleResetPassword}
        activeOpacity={0.85}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>Reset Password</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderSuccessStep = () => (
    <View style={styles.form}>
      <View style={styles.successIconContainer}>
        <Text style={styles.successIcon}>✓</Text>
      </View>
      <Text style={[styles.title, { color: theme.text, textAlign: 'center' }]}>
        Password Reset Successful
      </Text>
      <Text
        style={[
          styles.description,
          { color: theme.textSecondary, textAlign: 'center' },
        ]}
      >
        Your password has been updated. You can now sign in with your new password.
      </Text>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={onNavigateToSignIn}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryButtonText}>Back to Sign In</Text>
      </TouchableOpacity>
    </View>
  );

  const renderError = () => {
    if (!error) return null;
    return (
      <View
        style={[
          styles.errorContainer,
          isDarkMode && { backgroundColor: '#3B1111', borderColor: '#7F1D1D' },
        ]}
      >
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={true}
          >
            {/* Back button */}
            {step !== 'success' && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={
                  step === 'email'
                    ? onNavigateToSignIn
                    : () => {
                        setError(null);
                        if (step === 'verify') setStep('email');
                        else if (step === 'reset') setStep('verify');
                      }
                }
                activeOpacity={0.7}
              >
                <Text style={[styles.backButtonText, { color: theme.text }]}>
                  ← Back
                </Text>
              </TouchableOpacity>
            )}

            {renderStepIndicator()}

            {step === 'email' && renderEmailStep()}
            {step === 'verify' && renderVerifyStep()}
            {step === 'reset' && renderResetStep()}
            {step === 'success' && renderSuccessStep()}

            {/* Footer */}
            {step !== 'success' && (
              <View style={styles.footer}>
                <View style={styles.footerLinks}>
                  <Text style={[styles.footerText, { color: theme.textSecondary }]}>
                    Remember your password?{' '}
                  </Text>
                  <TouchableOpacity onPress={onNavigateToSignIn} activeOpacity={0.7}>
                    <Text style={styles.signInText}>Sign in</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 32,
  },

  // Back button
  backButton: {
    marginBottom: 16,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingRight: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },

  // Step indicator
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 32,
    gap: 24,
  },
  stepItem: {
    alignItems: 'center',
    gap: 6,
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: '#059669',
  },
  stepDotText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  stepDotTextActive: {
    color: '#FFFFFF',
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Form
  form: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    letterSpacing: 0.1,
  },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    fontSize: 16,
    color: '#111827',
    borderWidth: 2,
    borderColor: 'transparent',
  },

  // Password field
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    paddingRight: 50,
    fontSize: 16,
    color: '#111827',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  eyeButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIcon: {
    fontSize: 18,
  },

  // Error
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Primary button
  primaryButton: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  buttonDisabled: {
    opacity: 0.7,
  },

  // Success
  successIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  successIcon: {
    fontSize: 36,
    color: '#059669',
    fontWeight: '700',
  },

  // Footer
  footer: {
    marginTop: 'auto',
    paddingTop: 24,
  },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    color: '#6B7280',
    fontSize: 15,
  },
  signInText: {
    color: '#059669',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default ForgotPasswordScreen;
