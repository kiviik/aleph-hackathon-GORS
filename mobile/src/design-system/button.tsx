// Compound button. `Button` never accepts a string child — text goes through `ButtonText`, icons
// through `ButtonIcon`. That keeps composition explicit and makes a stray string impossible.
import { memo, type ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { Pressable } from "./pressable";
import { Text } from "./text";
import { useThemedStyles } from "./use-theme";
import type { Theme } from "./theme";

export type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = {
  children: ReactNode;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export const Button = memo(function Button({
  children,
  onPress,
  variant = "primary",
  disabled = false,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const styles = useThemedStyles(buttonStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={disabled ? disabledState : undefined}
      onPress={onPress}
      disabled={disabled}
      style={[styles.base, styles[variant], disabled ? styles.disabled : null, style]}
    >
      {children}
    </Pressable>
  );
});

export function ButtonText({
  children,
  variant = "primary",
}: {
  children: ReactNode;
  variant?: ButtonVariant;
}) {
  const styles = useThemedStyles(buttonStyles);
  return <Text style={[styles.label, styles[`${variant}Label`]]}>{children}</Text>;
}

export function ButtonIcon({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

const disabledState = { disabled: true } as const;

const buttonStyles = (theme: Theme) =>
  StyleSheet.create({
    base: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.space.sm,
      minHeight: 44,
      paddingHorizontal: theme.space.lg,
      borderRadius: theme.radius.md,
      borderCurve: "continuous",
    },
    primary: { backgroundColor: theme.color.accent },
    secondary: {
      borderWidth: 1,
      borderColor: theme.color.accent,
      backgroundColor: "transparent",
    },
    ghost: { backgroundColor: "transparent", paddingHorizontal: 0, minHeight: 32 },
    disabled: { opacity: 0.5 },
    label: { fontSize: theme.fontSize.body, fontWeight: "700" },
    primaryLabel: { color: theme.color.onAccent },
    secondaryLabel: { color: theme.color.accent },
    ghostLabel: { color: theme.color.accent },
  });
