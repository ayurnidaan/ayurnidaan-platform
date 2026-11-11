import { CormorantGaramond_600SemiBold } from '@expo-google-fonts/cormorant-garamond/600SemiBold';
import { useFonts } from 'expo-font';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { createDoctorApplication } from './doctor-applications';
import {
  AiChatScreen,
  ApplyDetailsScreen,
  ApplyDocsScreen,
  ApplySubmittedScreen,
  LoginScreen,
  OnboardingScreen,
  OtpScreen,
  PendingHomeScreen,
} from './screens-auth';
import {
  AvailabilityScreen,
  BlockTimeScreen,
  CallScreen,
  HistoryScreen,
  PatientChatScreen,
  PatientsScreen,
  PrescriptionScreen,
  RxPreviewScreen,
  TimeSheetScreen,
  UploadScreen,
} from './screens-clinical';
import {
  AppointmentDetailScreen,
  AppointmentsScreen,
  CalendarScreen,
  CancelSheetScreen,
  NotificationsScreen,
  RescheduleScreen,
  TodayEmptyScreen,
  TodayScreen,
} from './screens-practice';
import { EarningsScreen, LanguageScreen, ProfileScreen, ReviewsScreen, SupportScreen } from './screens-profile';
import type { DoctorApplicationDraft, Navigation, PrescriptionDraft, Route, SubmittedDoctorApplication, TabRoute } from './types';
import { Toast, colors } from './ui';

export default function App() {
  const [fontsLoaded] = useFonts({ CormorantGaramond_600SemiBold });
  const [stack, setStack] = useState<Route[]>(['login']);
  const [toast, setToast] = useState<string | null>(null);
  const [doctorApplication, setDoctorApplication] = useState<DoctorApplicationDraft>({
    mobileNumber: '',
    fullName: '',
    age: '',
    specialisations: ['Kayachikitsa'],
    aadhaarNumber: '',
    panNumber: '',
    documents: { degree: false, aadhaar: false, pan: false },
    consentAccepted: false,
  });
  const [submittedApplication, setSubmittedApplication] = useState<SubmittedDoctorApplication | null>(null);
  const [prescriptionDraft, setPrescriptionDraft] = useState<PrescriptionDraft>({ diagnosis: '', advice: '', followUp: '1 week', attached: false, medicines: [{ name: '', dose: '', frequency: '', duration: '' }] });
  const route = stack[stack.length - 1];

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const nav = useMemo<Navigation>(() => ({
    go: (next: Route) => setStack(current => [...current, next]),
    back: () => setStack(current => current.length > 1 ? current.slice(0, -1) : ['login']),
    tab: (next: TabRoute) => setStack([next]),
    toast: (message: string) => setToast(message),
  }), []);

  if (!fontsLoaded) return <View style={styles.loading} />;

  let screen;
  switch (route) {
    case 'login': screen = <LoginScreen nav={nav} mobileNumber={doctorApplication.mobileNumber} onMobileNumberChange={mobileNumber => setDoctorApplication(current => ({ ...current, mobileNumber }))} />; break;
    case 'otp': screen = <OtpScreen nav={nav} />; break;
    case 'applyDetails': screen = <ApplyDetailsScreen nav={nav} application={doctorApplication} onChange={setDoctorApplication} />; break;
    case 'applyDocs': screen = <ApplyDocsScreen nav={nav} application={doctorApplication} onChange={setDoctorApplication} onSubmit={async application => { const submitted = await createDoctorApplication(application); setSubmittedApplication(submitted); return submitted; }} />; break;
    case 'applySubmitted': screen = <ApplySubmittedScreen nav={nav} submission={submittedApplication} />; break;
    case 'pendingHome': screen = <PendingHomeScreen nav={nav} application={doctorApplication} submission={submittedApplication} />; break;
    case 'aiChat': screen = <AiChatScreen nav={nav} />; break;
    case 'onboarding': screen = <OnboardingScreen nav={nav} />; break;
    case 'today': screen = <TodayScreen nav={nav} />; break;
    case 'todayEmpty': screen = <TodayEmptyScreen nav={nav} />; break;
    case 'notifications': screen = <NotificationsScreen nav={nav} />; break;
    case 'calendar': screen = <CalendarScreen nav={nav} />; break;
    case 'appointments': screen = <AppointmentsScreen nav={nav} />; break;
    case 'apptDetail': screen = <AppointmentDetailScreen nav={nav} />; break;
    case 'cancelSheet': screen = <CancelSheetScreen nav={nav} />; break;
    case 'reschedule': screen = <RescheduleScreen nav={nav} />; break;
    case 'call': screen = <CallScreen nav={nav} />; break;
    case 'prescription': screen = <PrescriptionScreen nav={nav} draft={prescriptionDraft} onChange={setPrescriptionDraft} />; break;
    case 'rxPreview': screen = <RxPreviewScreen nav={nav} draft={prescriptionDraft} onSent={() => setPrescriptionDraft({ diagnosis: '', advice: '', followUp: '1 week', attached: false, medicines: [{ name: '', dose: '', frequency: '', duration: '' }] })} />; break;
    case 'upload': screen = <UploadScreen nav={nav} />; break;
    case 'availability': screen = <AvailabilityScreen nav={nav} />; break;
    case 'timeSheet': screen = <TimeSheetScreen nav={nav} />; break;
    case 'block': screen = <BlockTimeScreen nav={nav} />; break;
    case 'patients': screen = <PatientsScreen nav={nav} />; break;
    case 'history': screen = <HistoryScreen nav={nav} />; break;
    case 'chat': screen = <PatientChatScreen nav={nav} />; break;
    case 'profile': screen = <ProfileScreen nav={nav} />; break;
    case 'earnings': screen = <EarningsScreen nav={nav} />; break;
    case 'reviews': screen = <ReviewsScreen nav={nav} />; break;
    case 'language': screen = <LanguageScreen nav={nav} />; break;
    case 'support': screen = <SupportScreen nav={nav} />; break;
    default: screen = <LoginScreen nav={nav} mobileNumber={doctorApplication.mobileNumber} onMobileNumberChange={mobileNumber => setDoctorApplication(current => ({ ...current, mobileNumber }))} />;
  }

  return <View style={styles.root}>{screen}<Toast message={toast} /></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  loading: { flex: 1, backgroundColor: colors.green },
});
