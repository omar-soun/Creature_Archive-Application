import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  Dimensions,
  Animated,
  ActivityIndicator,
} from 'react-native';
import authService from '../services/authService';
import { SignUpData } from '../types/models';

const { width } = Dimensions.get('window');

interface SignUpScreenProps {
  onSignUp: () => void;
  onNavigateToSignIn: () => void;
}

interface ValidationState {
  isValid: boolean;
  message: string;
}

const SignUpScreen: React.FC<SignUpScreenProps> = ({
  onSignUp,
  onNavigateToSignIn,
}) => {
  // Step State
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // Animation Values
  const slideAnim = useRef(new Animated.Value(0)).current;
  const step1Opacity = useRef(new Animated.Value(1)).current;
  const step2Opacity = useRef(new Animated.Value(0)).current;

  // Form State - Step 1
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [currentRole, setCurrentRole] = useState('');
  const [institution, setInstitution] = useState('');

  // Form State - Step 2
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Validation States
  const [emailValidation, setEmailValidation] = useState<ValidationState>({ isValid: true, message: '' });
  const [passwordValidation, setPasswordValidation] = useState<ValidationState>({ isValid: true, message: '' });
  const [confirmValidation, setConfirmValidation] = useState<ValidationState>({ isValid: true, message: '' });

  // Touch States (for showing validation only after interaction)
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  // Loading and Error States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for input focus management
  const lastNameRef = useRef<TextInput>(null);
  const roleRef = useRef<TextInput>(null);
  const institutionRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Validation Functions
  const validateEmail = (value: string): ValidationState => {
    if (!value) return { isValid: false, message: 'Email is required' };
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return { isValid: false, message: 'Please enter a valid email address' };
    return { isValid: true, message: '' };
  };

  const validatePassword = (value: string): ValidationState => {
    if (!value) return { isValid: false, message: 'Password is required' };
    if (value.length < 8) return { isValid: false, message: 'Password must be at least 8 characters' };
    if (!/[A-Z]/.test(value)) return { isValid: false, message: 'Include at least one uppercase letter' };
    if (!/[0-9]/.test(value)) return { isValid: false, message: 'Include at least one number' };
    return { isValid: true, message: '' };
  };

  const validateConfirmPassword = (value: string): ValidationState => {
    if (!value) return { isValid: false, message: 'Please confirm your password' };
    if (value !== password) return { isValid: false, message: 'Passwords do not match' };
    return { isValid: true, message: '' };
  };

  // Password Strength Indicator
  const getPasswordStrength = (): { level: number; label: string; color: string } => {
    if (!password) return { level: 0, label: '', color: '#E5E7EB' };
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    if (strength <= 2) return { level: 1, label: 'Weak', color: '#EF4444' };
    if (strength <= 3) return { level: 2, label: 'Fair', color: '#F59E0B' };
    if (strength <= 4) return { level: 3, label: 'Good', color: '#10B981' };
    return { level: 4, label: 'Strong', color: '#059669' };
  };

  // Update validations on input change
  useEffect(() => {
    if (emailTouched) setEmailValidation(validateEmail(email));
  }, [email, emailTouched]);

  useEffect(() => {
    if (passwordTouched) setPasswordValidation(validatePassword(password));
  }, [password, passwordTouched]);

  useEffect(() => {
    if (confirmTouched) setConfirmValidation(validateConfirmPassword(confirmPassword));
  }, [confirmPassword, password, confirmTouched]);

  // Animation Functions
  const animateToStep2 = () => {
    Keyboard.dismiss();
    
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(step1Opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(step2Opacity, {
        toValue: 1,
        duration: 350,
        delay: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentStep(2);
      setTimeout(() => emailRef.current?.focus(), 100);
    });
  };

  const animateToStep1 = () => {
    Keyboard.dismiss();
    
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(step1Opacity, {
        toValue: 1,
        duration: 350,
        delay: 100,
        useNativeDriver: true,
      }),
      Animated.timing(step2Opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setCurrentStep(1));
  };

  const handleNext = () => {
    if (!firstName.trim() || !lastName.trim()) {
      // Could add visual shake animation here
      return;
    }
    animateToStep2();
  };

  const handleBack = () => {
    animateToStep1();
  };

  const handleCreateAccount = async () => {
    // Clear previous error
    setError(null);

    // Trigger all validations
    setEmailTouched(true);
    setPasswordTouched(true);
    setConfirmTouched(true);

    const emailValid = validateEmail(email);
    const passwordValid = validatePassword(password);
    const confirmValid = validateConfirmPassword(confirmPassword);

    setEmailValidation(emailValid);
    setPasswordValidation(passwordValid);
    setConfirmValidation(confirmValid);

    if (!emailValid.isValid || !passwordValid.isValid || !confirmValid.isValid) {
      return;
    }

    // Validate Step 1 fields
    if (!firstName.trim() || !lastName.trim()) {
      setError('Please complete all required fields.');
      animateToStep1();
      return;
    }

    Keyboard.dismiss();
    setIsLoading(true);

    try {
      // Prepare signup data
      const signUpData: SignUpData = {
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        institution: institution.trim(),
        currentRole: currentRole.trim(),
      };

      // Create account with Firebase Auth and Firestore profile
      await authService.signUp(signUpData);

      // On success, navigate to main app
      onSignUp();
    } catch (err: any) {
      // Display user-friendly error message
      setError(err.message || 'Account creation failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputFocus = (inputIndex: number) => {
    const scrollPosition = Math.max(0, inputIndex * 85 - 50);
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: scrollPosition,
        animated: true,
      });
    }, 100);
  };

  // Interpolations
  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -width],
  });

  const passwordStrength = getPasswordStrength();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

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
            {/* Header Section - Fixed */}
            <View style={styles.header}>
              <Image
                source={require('../assets/logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.appName}>Creature Archive</Text>
              <Text style={styles.subtitle}>AI-Powered Zoological Research</Text>

              {/* Step Indicator */}
              <View style={styles.stepIndicator}>
                <View style={[styles.stepDot, styles.stepDotActive]} />
                <View style={[styles.stepLine, currentStep === 2 && styles.stepLineActive]} />
                <View style={[styles.stepDot, currentStep === 2 && styles.stepDotActive]} />
              </View>
              <Text style={styles.stepLabel}>
                Step {currentStep} of 2: {currentStep === 1 ? 'Profile Details' : 'Account Credentials'}
              </Text>
            </View>

            {/* Animated Form Container */}
            <View style={styles.formWindow}>
              <Animated.View 
                style={[
                  styles.slidingContainer, 
                  { transform: [{ translateX }] }
                ]}
              >
                {/* Step 1: Profile Details */}
                <Animated.View style={[styles.stepContainer, { opacity: step1Opacity }]}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>First Name</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Sarah"
                      placeholderTextColor="#9CA3AF"
                      value={firstName}
                      onChangeText={setFirstName}
                      onFocus={() => handleInputFocus(0)}
                      returnKeyType="next"
                      onSubmitEditing={() => lastNameRef.current?.focus()}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Last Name</Text>
                    <TextInput
                      ref={lastNameRef}
                      style={styles.input}
                      placeholder="Chen"
                      placeholderTextColor="#9CA3AF"
                      value={lastName}
                      onChangeText={setLastName}
                      onFocus={() => handleInputFocus(1)}
                      returnKeyType="next"
                      onSubmitEditing={() => roleRef.current?.focus()}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Current Role</Text>
                    <TextInput
                      ref={roleRef}
                      style={styles.input}
                      placeholder="Research Assistant"
                      placeholderTextColor="#9CA3AF"
                      value={currentRole}
                      onChangeText={setCurrentRole}
                      onFocus={() => handleInputFocus(2)}
                      returnKeyType="next"
                      onSubmitEditing={() => institutionRef.current?.focus()}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Current Company or School</Text>
                    <TextInput
                      ref={institutionRef}
                      style={styles.input}
                      placeholder="University Name"
                      placeholderTextColor="#9CA3AF"
                      value={institution}
                      onChangeText={setInstitution}
                      onFocus={() => handleInputFocus(3)}
                      returnKeyType="done"
                      onSubmitEditing={handleNext}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleNext}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.primaryButtonText}>Next</Text>
                  </TouchableOpacity>

                  <View style={styles.signInContainer}>
                    <Text style={styles.signInText}>Already have an account? </Text>
                    <TouchableOpacity onPress={onNavigateToSignIn} activeOpacity={0.7}>
                      <Text style={styles.signInLink}>Sign in</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>

                {/* Step 2: Account Credentials */}
                <Animated.View style={[styles.stepContainer, { opacity: step2Opacity }]}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                      ref={emailRef}
                      style={[
                        styles.input,
                        emailTouched && !emailValidation.isValid && styles.inputError
                      ]}
                      placeholder="researcher@university.edu"
                      placeholderTextColor="#9CA3AF"
                      value={email}
                      onChangeText={setEmail}
                      onBlur={() => setEmailTouched(true)}
                      onFocus={() => handleInputFocus(0)}
                      returnKeyType="next"
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {emailTouched && !emailValidation.isValid && (
                      <Text style={styles.validationError}>{emailValidation.message}</Text>
                    )}
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Password</Text>
                    <TextInput
                      ref={passwordRef}
                      style={[
                        styles.input,
                        passwordTouched && !passwordValidation.isValid && styles.inputError
                      ]}
                      placeholder="••••••••"
                      placeholderTextColor="#9CA3AF"
                      value={password}
                      onChangeText={setPassword}
                      onBlur={() => setPasswordTouched(true)}
                      onFocus={() => handleInputFocus(1)}
                      returnKeyType="next"
                      onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                      secureTextEntry
                    />
                    {/* Password Strength Indicator */}
                    {password.length > 0 && (
                      <View style={styles.strengthContainer}>
                        <View style={styles.strengthBars}>
                          {[1, 2, 3, 4].map((level) => (
                            <View
                              key={level}
                              style={[
                                styles.strengthBar,
                                {
                                  backgroundColor:
                                    level <= passwordStrength.level
                                      ? passwordStrength.color
                                      : '#E5E7EB',
                                },
                              ]}
                            />
                          ))}
                        </View>
                        <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>
                          {passwordStrength.label}
                        </Text>
                      </View>
                    )}
                    {passwordTouched && !passwordValidation.isValid && (
                      <Text style={styles.validationError}>{passwordValidation.message}</Text>
                    )}
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Confirm Password</Text>
                    <TextInput
                      ref={confirmPasswordRef}
                      style={[
                        styles.input,
                        confirmTouched && !confirmValidation.isValid && styles.inputError
                      ]}
                      placeholder="••••••••"
                      placeholderTextColor="#9CA3AF"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      onBlur={() => setConfirmTouched(true)}
                      onFocus={() => handleInputFocus(2)}
                      returnKeyType="done"
                      onSubmitEditing={handleCreateAccount}
                      secureTextEntry
                    />
                    {confirmTouched && !confirmValidation.isValid && (
                      <Text style={styles.validationError}>{confirmValidation.message}</Text>
                    )}
                    {confirmTouched && confirmValidation.isValid && confirmPassword.length > 0 && (
                      <Text style={styles.validationSuccess}>✓ Passwords match</Text>
                    )}
                  </View>

                  {/* Error Message */}
                  {error && (
                    <View style={styles.errorContainer}>
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  )}

                  <View style={styles.buttonGroup}>
                    <TouchableOpacity
                      style={[styles.secondaryButton, isLoading && styles.buttonDisabled]}
                      onPress={handleBack}
                      activeOpacity={0.85}
                      disabled={isLoading}
                    >
                      <Text style={styles.secondaryButtonText}>Back</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryButtonFlex, isLoading && styles.buttonDisabled]}
                      onPress={handleCreateAccount}
                      activeOpacity={0.85}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Create Account</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={styles.signInContainer}>
                    <Text style={styles.signInText}>Already have an account? </Text>
                    <TouchableOpacity onPress={onNavigateToSignIn} activeOpacity={0.7}>
                      <Text style={styles.signInLink}>Sign in</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              </Animated.View>
            </View>

            {/* Footer Disclaimer */}
            <View style={styles.footer}>
              <Text style={styles.disclaimer}>
                By continuing, you agree to our Terms of Service
              </Text>
              <Text style={styles.disclaimer}>
                For academic and research use only
              </Text>
            </View>
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
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 32,
  },

  // Header Styles
  header: {
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  logo: {
    width: 72,
    height: 72,
    marginBottom: 14,
    borderRadius: 16,
  },
  appName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    letterSpacing: 0.2,
    marginBottom: 20,
  },

  // Step Indicator
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E5E7EB',
  },
  stepDotActive: {
    backgroundColor: '#1B4D3E',
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: '#1B4D3E',
  },
  stepLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },

  // Form Window & Sliding
  formWindow: {
    width: width,
    overflow: 'hidden',
  },
  slidingContainer: {
    flexDirection: 'row',
    width: width * 2,
  },
  stepContainer: {
    width: width,
    paddingHorizontal: 24,
  },

  // Input Styles
  inputGroup: {
    marginBottom: 18,
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
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 15 : 13,
    fontSize: 16,
    color: '#111827',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  inputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },

  // Validation Messages
  validationError: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '500',
  },
  validationSuccess: {
    fontSize: 12,
    color: '#10B981',
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '500',
  },

  // Error Container
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

  // Password Strength
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  strengthBars: {
    flexDirection: 'row',
    flex: 1,
    gap: 4,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 10,
    width: 50,
  },

  // Button Styles
  primaryButton: {
    backgroundColor: '#1B4D3E',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 18,
    shadowColor: '#1B4D3E',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  primaryButtonFlex: {
    backgroundColor: '#1B4D3E',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginLeft: 10,
    shadowColor: '#1B4D3E',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 0.4,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  buttonGroup: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 18,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },

  // Secondary Navigation
  signInContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  signInText: {
    fontSize: 14,
    color: '#6B7280',
  },
  signInLink: {
    fontSize: 14,
    color: '#1B4D3E',
    fontWeight: '600',
  },

  // Footer Styles
  footer: {
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  disclaimer: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default SignUpScreen;