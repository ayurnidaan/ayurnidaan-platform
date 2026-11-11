import type { PropsWithChildren, ReactNode } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { TabRoute } from './types';

export const colors = {
  green: '#16452F',
  green2: '#22553D',
  mint: '#E6F0E8',
  cream: '#F3F0E8',
  cream2: '#EDE8DC',
  white: '#FFFDFC',
  ink: '#172A20',
  muted: '#718078',
  faint: '#98A29C',
  line: '#DCD7CB',
  gold: '#B98A2D',
  red: '#C55D46',
  pink: '#F5E3DE',
};

export const serif = 'CormorantGaramond_600SemiBold';
export const mono = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' });
export const statusBarTopInset = Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 24) + 8 : 0;

type FrameProps = PropsWithChildren<{
  dark?: boolean;
  scroll?: boolean;
  tab?: TabRoute;
  onTab?: (route: TabRoute) => void;
  contentStyle?: StyleProp<ViewStyle>;
}>;

export function Frame({ children, dark = false, scroll = true, tab, onTab, contentStyle }: FrameProps) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.page, tab && styles.pageWithTab, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fixedPage, tab && styles.fixedWithTab, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.safe, dark && styles.safeDark]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {content}
      {tab && onTab ? <BottomTabs active={tab} onTab={onTab} /> : null}
    </SafeAreaView>
  );
}

export function BackHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <View style={styles.backHeader}>
      <Pressable accessibilityLabel="Go back" accessibilityRole="button" onPress={onBack} style={styles.backButton}>
        <Text style={styles.backGlyph}>‹</Text>
      </Pressable>
      <View style={styles.backCopy}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function Eyebrow({ children, light = false }: PropsWithChildren<{ light?: boolean }>) {
  return <Text style={[styles.eyebrow, light && styles.eyebrowLight]}>{children}</Text>;
}

export function Heading({ children, light = false, size = 28 }: PropsWithChildren<{ light?: boolean; size?: number }>) {
  return <Text style={[styles.heading, { fontSize: size, lineHeight: size + 4 }, light && styles.headingLight]}>{children}</Text>;
}

export function Field({ label, value, onChangeText, placeholder, multiline = false, keyboardType }: {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
}) {
  return (
    <View style={styles.fieldGroup}>
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      <TextInput
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        style={[styles.input, multiline && styles.textarea]}
        value={value}
      />
    </View>
  );
}

export function Button({ label, onPress, variant = 'primary', disabled = false, icon }: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'cream' | 'danger' | 'ghost';
  disabled?: boolean;
  icon?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {icon ? <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>{icon}</Text> : null}
      <Text style={[styles.buttonText, styles[`buttonText_${variant}`], disabled && styles.buttonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected = false, onPress, small = false }: { label: string; selected?: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, selected && styles.chipSelected, small && styles.chipSmall, pressed && styles.pressed]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected, small && styles.chipTextSmall]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, onPress, style }: PropsWithChildren<{ onPress?: () => void; style?: StyleProp<ViewStyle> }>) {
  if (onPress) {
    return <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}>{children}</Pressable>;
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={[styles.toggle, value && styles.toggleOn]}>
      <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} />
    </Pressable>
  );
}

export function Row({ title, subtitle, right, onPress, icon }: { title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; icon?: string }) {
  const inner = (
    <>
      {icon ? <View style={styles.rowIcon}><Text style={styles.rowIconText}>{icon}</Text></View> : null}
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Text style={styles.chevron}>›</Text> : null)}
    </>
  );
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>{inner}</Pressable> : <View style={styles.row}>{inner}</View>;
}

export function BottomTabs({ active, onTab }: { active: TabRoute; onTab: (route: TabRoute) => void }) {
  const tabs: Array<{ route: TabRoute; label: string; icon: string }> = [
    { route: 'today', label: 'Today', icon: '□' },
    { route: 'appointments', label: 'Consults', icon: '□' },
    { route: 'availability', label: 'Hours', icon: '○' },
    { route: 'patients', label: 'Patients', icon: '○' },
    { route: 'profile', label: 'Profile', icon: '⌂' },
  ];
  return (
    <View style={styles.tabs}>
      {tabs.map(tab => (
        <Pressable key={tab.route} onPress={() => onTab(tab.route)} style={styles.tab}>
          <Text style={[styles.tabIcon, active === tab.route && styles.tabActive]}>{tab.icon}</Text>
          <Text style={[styles.tabLabel, active === tab.route && styles.tabActive]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return <View style={styles.toast}><Text style={styles.toastText}>{message}</Text></View>;
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream, paddingTop: Platform.OS === 'web' ? 59 : statusBarTopInset, paddingBottom: Platform.OS === 'web' ? 34 : 0 },
  safeDark: { backgroundColor: colors.green },
  page: { flexGrow: 1, backgroundColor: colors.cream, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 },
  pageWithTab: { paddingBottom: 24 },
  fixedPage: { flex: 1 },
  fixedWithTab: { paddingBottom: 0 },
  backHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  backButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  backGlyph: { color: colors.green, fontSize: 24, lineHeight: 25, marginTop: -2 },
  backCopy: { flex: 1 },
  headerTitle: { color: colors.ink, fontFamily: serif, fontSize: 24, lineHeight: 27 },
  headerSubtitle: { color: colors.muted, fontSize: 10, marginTop: 1 },
  eyebrow: { color: colors.muted, fontFamily: mono, fontSize: 9, letterSpacing: 1.5, marginBottom: 7 },
  eyebrowLight: { color: '#9DB1A6' },
  heading: { color: colors.ink, fontFamily: serif, letterSpacing: -0.4 },
  headingLight: { color: colors.cream },
  fieldGroup: { marginBottom: 14 },
  input: { height: 43, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.white, color: colors.ink, paddingHorizontal: 12, fontSize: 13 },
  textarea: { minHeight: 86, height: 86, paddingTop: 12, textAlignVertical: 'top' },
  button: { minHeight: 45, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 15 },
  button_primary: { backgroundColor: colors.green },
  button_outline: { borderWidth: 1, borderColor: colors.green, backgroundColor: 'transparent' },
  button_cream: { backgroundColor: colors.cream },
  button_danger: { backgroundColor: colors.red },
  button_ghost: { backgroundColor: 'transparent' },
  buttonDisabled: { backgroundColor: '#D9D5CA', borderColor: '#D9D5CA' },
  buttonText: { fontSize: 12, fontWeight: '700' },
  buttonText_primary: { color: colors.white },
  buttonText_outline: { color: colors.green },
  buttonText_cream: { color: colors.green },
  buttonText_danger: { color: colors.white },
  buttonText_ghost: { color: colors.red },
  buttonTextDisabled: { color: '#969A94' },
  chip: { minHeight: 31, borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
  chipSelected: { borderColor: colors.green, backgroundColor: colors.green },
  chipSmall: { minHeight: 27, paddingHorizontal: 10 },
  chipText: { color: colors.ink, fontSize: 11 },
  chipTextSelected: { color: colors.white, fontWeight: '700' },
  chipTextSmall: { fontSize: 10 },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.white, padding: 13 },
  toggle: { width: 40, height: 24, borderRadius: 12, backgroundColor: '#D3CFC4', padding: 3 },
  toggleOn: { backgroundColor: colors.green },
  toggleKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.white },
  toggleKnobOn: { alignSelf: 'flex-end' },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.white },
  rowIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  rowIconText: { color: colors.green, fontSize: 11, fontWeight: '700' },
  rowCopy: { flex: 1 },
  rowTitle: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  rowSubtitle: { color: colors.muted, fontSize: 9, marginTop: 3 },
  chevron: { color: colors.green, fontSize: 21 },
  tabs: { height: 62, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.white, flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { color: '#9AA29D', fontSize: 18, lineHeight: 20 },
  tabLabel: { color: '#8D9690', fontSize: 8, marginTop: 3 },
  tabActive: { color: colors.green, fontWeight: '700' },
  toast: { position: 'absolute', left: 20, right: 20, bottom: 92, borderRadius: 8, backgroundColor: colors.ink, paddingHorizontal: 14, paddingVertical: 12, zIndex: 20 },
  toastText: { color: colors.white, textAlign: 'center', fontSize: 11, fontWeight: '600' },
  pressed: { opacity: 0.72 },
});
