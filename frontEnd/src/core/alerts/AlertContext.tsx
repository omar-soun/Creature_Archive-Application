import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useTheme } from '../theme';

// ============================================
// TYPES — mirrors React Native Alert.alert API
// ============================================
interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertState {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

interface AlertContextValue {
  showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void;
}

// ============================================
// CONTEXT
// ============================================
const AlertContext = createContext<AlertContextValue>({
  showAlert: () => {},
});

export const useAlert = () => useContext(AlertContext);

// ============================================
// PROVIDER
// ============================================
export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<AlertState | null>(null);
  const queue = useRef<AlertState[]>([]);

  const showNext = useCallback(() => {
    if (queue.current.length > 0) {
      const next = queue.current.shift()!;
      setCurrent(next);
      setVisible(true);
    } else {
      setCurrent(null);
      setVisible(false);
    }
  }, []);

  const showAlert = useCallback(
    (title: string, message?: string, buttons?: AlertButton[]) => {
      const alert: AlertState = {
        title,
        message,
        buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' }],
      };

      if (visible) {
        queue.current.push(alert);
      } else {
        setCurrent(alert);
        setVisible(true);
      }
    },
    [visible],
  );

  const handleButtonPress = useCallback(
    (onPress?: () => void) => {
      setVisible(false);
      // Call onPress after modal dismisses to avoid state conflicts
      if (onPress) {
        setTimeout(onPress, 100);
      }
      // Show next queued alert after a brief delay
      setTimeout(showNext, 200);
    },
    [showNext],
  );

  const handleBackdropPress = useCallback(() => {
    // Only dismiss on backdrop tap when there's a single default/OK button
    if (current && current.buttons.length === 1) {
      handleButtonPress(current.buttons[0].onPress);
    }
  }, [current, handleButtonPress]);

  // Sort buttons: cancel first, then default, then destructive
  const sortedButtons = current
    ? [...current.buttons].sort((a, b) => {
        const order = { cancel: 0, default: 1, destructive: 2 };
        return (order[a.style || 'default'] ?? 1) - (order[b.style || 'default'] ?? 1);
      })
    : [];

  const getButtonTextColor = (style?: string) => {
    switch (style) {
      case 'destructive':
        return '#EF4444';
      case 'cancel':
        return theme.textSecondary;
      default:
        return theme.accent;
    }
  };

  const getButtonFontWeight = (style?: string): '400' | '600' => {
    return style === 'cancel' ? '600' : '600';
  };

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => handleButtonPress()}
      >
        <TouchableWithoutFeedback onPress={handleBackdropPress}>
          <View style={styles.backdrop}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.alertCard,
                  { backgroundColor: theme.card },
                  sortedButtons.length > 2 && styles.alertCardWide,
                ]}
              >
                {/* Title */}
                <Text style={[styles.title, { color: theme.text }]}>
                  {current?.title}
                </Text>

                {/* Message */}
                {current?.message ? (
                  <Text style={[styles.message, { color: theme.textSecondary }]}>
                    {current.message}
                  </Text>
                ) : null}

                {/* Divider */}
                <View style={[styles.divider, { backgroundColor: theme.border }]} />

                {/* Buttons */}
                {sortedButtons.length <= 2 ? (
                  // Horizontal layout for 1–2 buttons
                  <View style={styles.buttonRow}>
                    {sortedButtons.map((btn, index) => (
                      <React.Fragment key={index}>
                        {index > 0 && (
                          <View style={[styles.buttonDividerVertical, { backgroundColor: theme.border }]} />
                        )}
                        <TouchableOpacity
                          style={styles.buttonHorizontal}
                          onPress={() => handleButtonPress(btn.onPress)}
                          activeOpacity={0.6}
                        >
                          <Text
                            style={[
                              styles.buttonText,
                              {
                                color: getButtonTextColor(btn.style),
                                fontWeight: getButtonFontWeight(btn.style),
                              },
                            ]}
                          >
                            {btn.text || 'OK'}
                          </Text>
                        </TouchableOpacity>
                      </React.Fragment>
                    ))}
                  </View>
                ) : (
                  // Vertical layout for 3+ buttons
                  <View style={styles.buttonColumn}>
                    {sortedButtons.map((btn, index) => (
                      <React.Fragment key={index}>
                        {index > 0 && (
                          <View style={[styles.buttonDividerHorizontal, { backgroundColor: theme.border }]} />
                        )}
                        <TouchableOpacity
                          style={styles.buttonVertical}
                          onPress={() => handleButtonPress(btn.onPress)}
                          activeOpacity={0.6}
                        >
                          <Text
                            style={[
                              styles.buttonText,
                              {
                                color: getButtonTextColor(btn.style),
                                fontWeight: getButtonFontWeight(btn.style),
                              },
                            ]}
                          >
                            {btn.text || 'OK'}
                          </Text>
                        </TouchableOpacity>
                      </React.Fragment>
                    ))}
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </AlertContext.Provider>
  );
};

// ============================================
// STYLES
// ============================================
const SCREEN_WIDTH = Dimensions.get('window').width;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertCard: {
    width: SCREEN_WIDTH * 0.78,
    borderRadius: 16,
    paddingTop: 22,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  alertCardWide: {
    width: SCREEN_WIDTH * 0.78,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    minHeight: 46,
  },
  buttonHorizontal: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  buttonColumn: {
    flexDirection: 'column',
  },
  buttonVertical: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 46,
  },
  buttonDividerVertical: {
    width: StyleSheet.hairlineWidth,
  },
  buttonDividerHorizontal: {
    height: StyleSheet.hairlineWidth,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AlertContext;
