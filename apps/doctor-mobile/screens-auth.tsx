import { useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { focusAreas, specialisations } from './data';
import type { ChatMessage, DoctorApplicationDraft, Navigation, SubmittedDoctorApplication } from './types';
import { BackHeader, Button, Card, Chip, Eyebrow, Field, Frame, Heading, colors, mono, serif, statusBarTopInset } from './ui';

export function LoginScreen({ nav, mobileNumber, onMobileNumberChange }: { nav: Navigation; mobileNumber: string; onMobileNumberChange: (value: string) => void }) {
  return (
    <SafeAreaView style={authStyles.loginSafe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={authStyles.loginScreen}>
        <View style={authStyles.loginIntro}>
          <View accessibilityElementsHidden style={authStyles.brandMark} />
          <Text style={authStyles.loginTitle}>For doctors</Text>
          <Text style={authStyles.loginSubtitle}>Manage your consultation hours, patients{`\n`}and prescriptions.</Text>
        </View>
        <View style={authStyles.loginForm}>
          <View style={authStyles.mobileField}>
            <Text style={authStyles.countryCode}>+91</Text><View style={authStyles.countryDivider} />
            <TextInput
              accessibilityLabel="Mobile number"
              autoComplete="tel"
              keyboardType="phone-pad"
              maxLength={10}
              onChangeText={value => onMobileNumberChange(value.replace(/\D/g, '').slice(0, 10))}
              placeholder="Mobile number"
              placeholderTextColor="#788E80"
              returnKeyType="done"
              style={authStyles.mobileInput}
              value={mobileNumber}
            />
          </View>
          <Pressable onPress={() => { Keyboard.dismiss(); nav.go('otp'); }} style={({ pressed }) => [authStyles.sendCode, pressed && authStyles.pressed]}>
            <Text style={authStyles.sendCodeText}>Send code</Text>
          </Pressable>
          <Pressable onPress={() => nav.go('applyDetails')} style={({ pressed }) => [authStyles.applyButton, pressed && authStyles.pressed]}>
            <Text style={authStyles.applyText}>Apply for verification</Text>
          </Pressable>
          <Text style={authStyles.loginHelper}>Verified practitioners sign in · new doctors apply</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function OtpScreen({ nav }: { nav: Navigation }) {
  const [code, setCode] = useState('');
  const inputRef = useRef<TextInput>(null);
  return (
    <Frame dark scroll={false}>
      <View style={authStyles.otpPage}>
        <Pressable accessibilityLabel="Go back" onPress={nav.back} style={authStyles.darkBack}><Text style={authStyles.darkBackText}>‹</Text></Pressable>
        <View style={authStyles.otpBody}>
          <Heading light size={28}>Enter the code</Heading>
          <Text style={authStyles.darkMuted}>Sent to +91 98450 12345</Text>
          <Pressable onPress={() => inputRef.current?.focus()} style={authStyles.codeRow}>
            {Array.from({ length: 6 }, (_, index) => <View key={index} style={[authStyles.codeBox, code[index] && authStyles.codeBoxFilled]}><Text style={authStyles.codeDigit}>{code[index] ?? ''}</Text></View>)}
            <TextInput ref={inputRef} autoFocus keyboardType="number-pad" maxLength={6} onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))} style={authStyles.hiddenCodeInput} value={code} />
          </Pressable>
          <View style={authStyles.codeActions}>
            <Pressable onPress={() => setCode('111111')}><Text style={authStyles.fillCode}>Fill code</Text></Pressable>
            <Text style={authStyles.resend}>· Resend in 0:24</Text>
          </View>
        </View>
        <Button label="Verify" onPress={() => nav.go('onboarding')} variant="cream" disabled={code.length !== 6} />
      </View>
    </Frame>
  );
}

export function ApplyDetailsScreen({ nav, application, onChange }: { nav: Navigation; application: DoctorApplicationDraft; onChange: (next: DoctorApplicationDraft) => void }) {
  const toggle = (value: string) => onChange({ ...application, specialisations: application.specialisations.includes(value) ? application.specialisations.filter(item => item !== value) : [...application.specialisations, value] });
  return (
    <Frame>
      <BackHeader title="" onBack={nav.back} />
      <Eyebrow>STEP 1 OF 2 · ABOUT YOU</Eyebrow>
      <Heading size={27}>Apply to join</Heading>
      <View style={authStyles.divider} />
      <Field label="FULL NAME" value={application.fullName} onChangeText={fullName => onChange({ ...application, fullName })} placeholder="As on your BAMS certificate" />
      <Field label="AGE" value={application.age} onChangeText={age => onChange({ ...application, age: age.replace(/\D/g, '').slice(0, 3) })} placeholder="Years" keyboardType="numeric" />
      <Eyebrow>SPECIALISATION</Eyebrow>
      <View style={authStyles.chips}>{specialisations.map(item => <Chip key={item} label={item} selected={application.specialisations.includes(item)} onPress={() => toggle(item)} small />)}</View>
      <View style={authStyles.actionGap}><Button label="Continue to documents" onPress={() => nav.go('applyDocs')} disabled={!application.fullName.trim() || Number(application.age) < 18 || Number(application.age) > 100 || application.specialisations.length === 0} /></View>
    </Frame>
  );
}

function UploadRow({ title, subtitle, uploaded, onPress }: { title: string; subtitle: string; uploaded: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [authStyles.uploadRow, uploaded && authStyles.uploadedRow, pressed && authStyles.pressed]}>
      <View style={{ flex: 1 }}><Text style={authStyles.uploadTitle}>{title}</Text><Text style={authStyles.uploadSubtitle}>{uploaded ? 'Uploaded successfully' : subtitle}</Text></View>
      <Text style={authStyles.uploadPlus}>{uploaded ? '✓' : '+'}</Text>
    </Pressable>
  );
}

export function ApplyDocsScreen({ nav, application, onChange, onSubmit }: { nav: Navigation; application: DoctorApplicationDraft; onChange: (next: DoctorApplicationDraft) => void; onSubmit: (application: DoctorApplicationDraft) => Promise<SubmittedDoctorApplication> }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const toggleUpload = (key: keyof DoctorApplicationDraft['documents']) => onChange({ ...application, documents: { ...application.documents, [key]: !application.documents[key] } });
  const ready = application.documents.degree && application.documents.aadhaar && application.documents.pan && /^\d{12}$/.test(application.aadhaarNumber) && /^[A-Z]{5}\d{4}[A-Z]$/.test(application.panNumber) && application.consentAccepted;
  const submit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true); setError('');
    try {
      await onSubmit(application);
      nav.go('applySubmitted');
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'The application could not be submitted. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Frame>
      <BackHeader title="" onBack={nav.back} />
      <Eyebrow>STEP 2 OF 2 · DOCUMENTS</Eyebrow>
      <Heading size={27}>Proof of practice</Heading>
      <View style={authStyles.divider} />
      <UploadRow title="BAMS degree certificate" subtitle="PDF or photo, under 5 MB" uploaded={application.documents.degree} onPress={() => toggleUpload('degree')} />
      <UploadRow title="Aadhaar card" subtitle="Front side, name clearly visible" uploaded={application.documents.aadhaar} onPress={() => toggleUpload('aadhaar')} />
      <UploadRow title="PAN card" subtitle="For payouts and tax records" uploaded={application.documents.pan} onPress={() => toggleUpload('pan')} />
      <Field label="AADHAAR NUMBER" value={application.aadhaarNumber} onChangeText={value => onChange({ ...application, aadhaarNumber: value.replace(/\D/g, '').slice(0, 12) })} placeholder="1234 5678 9012" keyboardType="numeric" />
      <Field label="PAN" value={application.panNumber} onChangeText={value => onChange({ ...application, panNumber: value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) })} placeholder="ABCDE1234F" />
      <Pressable onPress={() => onChange({ ...application, consentAccepted: !application.consentAccepted })} style={authStyles.consentRow}>
        <View style={[authStyles.checkbox, application.consentAccepted && authStyles.checkboxOn]}>{application.consentAccepted ? <Text style={authStyles.check}>✓</Text> : null}</View>
        <Text style={authStyles.consentText}>I confirm these documents are mine and consent to verification by the Ayurnidaan team.</Text>
      </Pressable>
      {error ? <Text style={authStyles.submissionError}>{error}</Text> : null}
      <Button label={submitting ? 'Submitting application…' : ready ? 'Submit application' : 'Complete all details to submit'} onPress={submit} disabled={!ready || submitting} />
    </Frame>
  );
}

export function ApplySubmittedScreen({ nav, submission }: { nav: Navigation; submission: SubmittedDoctorApplication | null }) {
  return (
    <Frame dark scroll={false}>
      <View style={authStyles.submittedPage}>
        <View style={authStyles.submittedCopy}>
          <View style={authStyles.successCircle}><Text style={authStyles.successCheck}>✓</Text></View>
          <Heading light size={29}>Application submitted</Heading>
          <Text style={authStyles.submittedText}>The Ayurnidaan team reviews documents within 48 hours.{`\n`}You will get a notification the moment you are verified.</Text>
          <View style={authStyles.referenceCard}><Eyebrow light>REFERENCE</Eyebrow><Text style={authStyles.referenceValue}>{submission?.referenceCode ?? 'REFERENCE PENDING'}</Text></View>
        </View>
        <View style={authStyles.submittedActions}>
          <Button label="Explore the AI meanwhile" variant="cream" onPress={() => nav.go('aiChat')} />
          <Button label="Go to home" variant="outline" onPress={() => nav.go('pendingHome')} />
        </View>
      </View>
    </Frame>
  );
}

export function PendingHomeScreen({ nav, application, submission }: { nav: Navigation; application: DoctorApplicationDraft; submission: SubmittedDoctorApplication | null }) {
  const submittedDate = submission ? new Date(submission.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Today';
  return (
    <Frame dark>
      <View style={authStyles.pendingHeader}>
        <View><Text style={authStyles.pendingName}>{application.fullName}</Text><Text style={authStyles.pendingMeta}>{submission?.referenceCode ?? 'Application'} · applied {submittedDate}</Text></View>
        <View style={authStyles.reviewBadge}><Text style={authStyles.reviewText}>Under review</Text></View>
      </View>
      <Heading size={27}>Your application is being reviewed by the Ayurnidaan team</Heading>
      <Text style={authStyles.lightBody}>Meanwhile you can explore the AI</Text>
      <Card onPress={() => nav.go('aiChat')} style={authStyles.aiCard}>
        <View style={{ flex: 1 }}><Text style={authStyles.aiCardTitle}>Ayurveda AI</Text><Text style={authStyles.aiCardBody}>Ask about formulations, dosing,{`\n`}classical references and contraindications.</Text><Text style={authStyles.aiPill}>FREE WHILE PENDING</Text></View><Text style={authStyles.aiArrow}>›</Text>
      </Card>
      <Eyebrow>PROGRESS</Eyebrow>
      <View style={authStyles.timeline}>
        {[['Application submitted', submittedDate, true], ['Document check', 'In progress · usually within 48 hours', true], ['Profile goes live', 'Patients can start booking', false]].map(([title, subtitle, active], index) => (
          <View key={String(title)} style={authStyles.timelineRow}>
            <View style={[authStyles.timelineDot, active && authStyles.timelineDotOn]} />
            {index < 2 ? <View style={authStyles.timelineLine} /> : null}
            <View><Text style={authStyles.timelineTitle}>{title}</Text><Text style={authStyles.timelineSubtitle}>{subtitle}</Text></View>
          </View>
        ))}
      </View>
      <Card style={authStyles.summaryCard}>
        {[['Name', application.fullName], ['Age', `${application.age} years`], ['Specialisation', application.specialisations.join(', ')], ['Documents', '3 provided']].map(([label, value]) => <View key={label} style={authStyles.summaryRow}><Text style={authStyles.summaryLabel}>{label}</Text><Text style={authStyles.summaryValue}>{value}</Text></View>)}
      </Card>
    </Frame>
  );
}

export function AiChatScreen({ nav }: { nav: Navigation }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, from: 'doctor', text: 'Safe dose of Arjuna churna for a hypertensive patient on amlodipine?' },
    { id: 2, from: 'ai', text: 'Classical texts place Arjuna (Terminalia arjuna) churna at 3–6g twice daily with warm water. Alongside amlodipine, start at the lower end and watch for additive hypotension in the first two weeks.' },
  ]);
  const send = (text = input) => {
    const value = text.trim(); if (!value) return;
    setMessages(current => [...current, { id: Date.now(), from: 'doctor', text: value }, { id: Date.now() + 1, from: 'ai', text: 'Reference noted. This prototype response will be connected to the clinical AI service later.' }]);
    setInput('');
  };
  return (
    <Frame dark scroll={false}>
      <View style={authStyles.aiHeader}><Pressable onPress={nav.back} style={authStyles.darkBack}><Text style={authStyles.darkBackText}>‹</Text></Pressable><View><Text style={authStyles.aiHeaderTitle}>Ayurveda AI</Text><Text style={authStyles.aiHeaderSubtitle}>REFERENCE ONLY · NOT A PRESCRIPTION</Text></View></View>
      <ScrollView contentContainerStyle={authStyles.aiMessages}>
        {messages.map(message => <View key={message.id} style={[authStyles.message, message.from === 'doctor' ? authStyles.doctorMessage : authStyles.aiMessage]}><Text style={[authStyles.messageText, message.from === 'doctor' && { color: colors.white }]}>{message.text}</Text>{message.from === 'ai' ? <Text style={authStyles.source}>Bhavaprakasha Nighantu · Sharangadhara Samhita</Text> : null}</View>)}
      </ScrollView>
      <View style={authStyles.suggestions}>{['Panchakarma before monsoon?', 'Guduchi in autoimmune cases?'].map(value => <Chip key={value} label={value} small onPress={() => send(value)} />)}</View>
      <View style={authStyles.composer}><TextInput value={input} onChangeText={setInput} onSubmitEditing={() => send()} placeholder="Ask about a formulation" placeholderTextColor={colors.faint} style={authStyles.composerInput} /><Pressable onPress={() => send()} style={authStyles.sendCircle}><Text style={authStyles.sendArrow}>➜</Text></Pressable></View>
    </Frame>
  );
}

export function OnboardingScreen({ nav }: { nav: Navigation }) {
  const [name, setName] = useState('Dr. Kavya Nair');
  const [registration, setRegistration] = useState('KA-AYU-20418');
  const [selected, setSelected] = useState<string[]>(['Cardio-metabolic']);
  const [certificate, setCertificate] = useState(false);
  const toggle = (value: string) => setSelected(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
  return (
    <Frame>
      <Eyebrow>STEP 2 OF 2</Eyebrow><Heading size={28}>Your practice</Heading><View style={authStyles.divider} />
      <Field label="FULL NAME" value={name} onChangeText={setName} />
      <Field label="REGISTRATION NO." value={registration} onChangeText={setRegistration} />
      <Eyebrow>FOCUS AREAS</Eyebrow><View style={authStyles.chips}>{focusAreas.map(item => <Chip key={item} label={item} selected={selected.includes(item)} onPress={() => toggle(item)} small />)}</View>
      <UploadRow title="Council certificate" subtitle="PDF or photo, under 5 MB" uploaded={certificate} onPress={() => setCertificate(!certificate)} />
      <View style={authStyles.actionGap}><Button label="Set my hours" onPress={() => { nav.toast('Sent for verification'); nav.go('availability'); }} disabled={!name || !registration || !selected.length || !certificate} /></View>
      <Text style={authStyles.verificationNote}>Verification takes up to 48 hours</Text>
    </Frame>
  );
}

const authStyles = StyleSheet.create({
  pressed: { opacity: 0.76 },
  loginSafe: { flex: 1, backgroundColor: colors.green, paddingTop: Platform.OS === 'web' ? 59 : statusBarTopInset, paddingBottom: Platform.OS === 'web' ? 34 : 0 },
  loginScreen: { flex: 1, paddingHorizontal: 25 },
  loginIntro: { flex: 1, justifyContent: 'center', paddingBottom: 64 },
  brandMark: { width: 39, height: 39, marginBottom: 21, borderRadius: 20, borderWidth: 1, borderColor: '#7B9385', borderRightColor: 'transparent' },
  loginTitle: { color: colors.cream, fontFamily: serif, fontSize: 31, lineHeight: 34, letterSpacing: -0.7 },
  loginSubtitle: { marginTop: 8, color: '#A6B0A9', fontSize: 12, lineHeight: 18 },
  loginForm: { paddingBottom: 4 },
  mobileField: { height: 52, flexDirection: 'row', alignItems: 'center', borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: '#3D6A54', backgroundColor: '#29533E', overflow: 'hidden' },
  countryCode: { width: 49, color: '#B7C9C0', textAlign: 'center', fontSize: 12 },
  countryDivider: { width: StyleSheet.hairlineWidth, height: 19, backgroundColor: '#557763' },
  mobileInput: { flex: 1, height: '100%', paddingHorizontal: 14, paddingVertical: 0, color: colors.white, fontFamily: mono, fontSize: 12, letterSpacing: 1.1 },
  sendCode: { height: 50, marginTop: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.cream },
  sendCodeText: { color: '#123D2F', fontSize: 12, fontWeight: '600' },
  applyButton: { height: 49, marginTop: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: '#3E6B55' },
  applyText: { color: colors.cream, fontSize: 12, fontWeight: '600' },
  loginHelper: { marginTop: 18, color: '#788C80', textAlign: 'center', fontSize: 9 },
  otpPage: { flex: 1, padding: 20 },
  darkBack: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#5D806E', alignItems: 'center', justifyContent: 'center' },
  darkBackText: { color: colors.cream, fontSize: 23, lineHeight: 24 },
  otpBody: { flex: 1, justifyContent: 'center', transform: [{ translateY: 72 }] },
  darkMuted: { color: '#9DB1A6', fontSize: 11, marginTop: 6 },
  codeRow: { flexDirection: 'row', gap: 7, marginTop: 24 },
  codeBox: { flex: 1, height: 51, borderRadius: 8, borderWidth: 1, borderColor: '#537661', backgroundColor: '#2B5A43', alignItems: 'center', justifyContent: 'center' },
  codeBoxFilled: { backgroundColor: '#37664F' },
  codeDigit: { color: colors.white, fontSize: 18, fontWeight: '700' },
  hiddenCodeInput: { position: 'absolute', inset: 0, opacity: 0.01 },
  codeActions: { flexDirection: 'row', marginTop: 18 },
  fillCode: { color: '#AFC2B8', fontSize: 10, fontWeight: '700' },
  resend: { color: '#7F998B', fontSize: 10 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 14, marginHorizontal: -16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 17 },
  actionGap: { marginTop: 9 },
  uploadRow: { minHeight: 61, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, borderRadius: 9, backgroundColor: '#F8F5EE', padding: 12, marginBottom: 9, flexDirection: 'row', alignItems: 'center' },
  uploadedRow: { borderColor: '#8BB09B', backgroundColor: '#EDF5EF' },
  uploadTitle: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  uploadSubtitle: { color: colors.muted, fontSize: 9, marginTop: 4 },
  uploadPlus: { color: colors.green, fontSize: 18 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  checkbox: { width: 19, height: 19, borderWidth: 1, borderColor: colors.line, borderRadius: 4, marginRight: 9, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.green, borderColor: colors.green },
  check: { color: colors.white, fontSize: 12 },
  consentText: { color: colors.ink, fontSize: 10, lineHeight: 15, flex: 1 },
  submittedPage: { flex: 1, padding: 24 },
  submittedCopy: { flex: 1, justifyContent: 'center' },
  successCircle: { width: 55, height: 55, borderRadius: 28, borderWidth: 1, borderColor: '#8CB29C', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  successCheck: { color: '#C6D8CE', fontSize: 27 },
  submittedText: { color: '#B3C3BA', fontSize: 11, lineHeight: 17, marginTop: 10 },
  referenceCard: { borderWidth: 1, borderColor: '#47735C', borderRadius: 8, backgroundColor: '#2A5A43', padding: 13, marginTop: 24 },
  referenceValue: { color: colors.white, fontFamily: mono, fontSize: 13, fontWeight: '700' },
  submittedActions: { gap: 10 },
  pendingHeader: { marginHorizontal: -16, marginTop: -16, marginBottom: 19, backgroundColor: colors.green, paddingHorizontal: 16, paddingVertical: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pendingName: { color: colors.cream, fontFamily: serif, fontSize: 18 },
  pendingMeta: { color: '#A5B7AD', fontSize: 8, marginTop: 3 },
  reviewBadge: { backgroundColor: '#7A7A2E', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  reviewText: { color: '#F5EFCF', fontSize: 8 },
  lightBody: { color: colors.muted, fontSize: 10, marginTop: 8, marginBottom: 15 },
  aiCard: { backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', marginBottom: 21 },
  aiCardTitle: { color: colors.cream, fontFamily: serif, fontSize: 18 },
  aiCardBody: { color: '#C3D0C9', fontSize: 9, lineHeight: 14, marginVertical: 7 },
  aiPill: { alignSelf: 'flex-start', color: '#AFC2B7', fontFamily: mono, fontSize: 7, borderWidth: 1, borderColor: '#547561', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  aiArrow: { color: colors.white, fontSize: 25 },
  timeline: { marginBottom: 16 },
  timelineRow: { minHeight: 50, flexDirection: 'row', position: 'relative' },
  timelineDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: colors.line, marginRight: 13, marginTop: 3, zIndex: 2, backgroundColor: colors.cream },
  timelineDotOn: { backgroundColor: colors.green, borderColor: colors.green },
  timelineLine: { position: 'absolute', left: 4, top: 12, height: 41, width: 1, backgroundColor: colors.line },
  timelineTitle: { color: colors.ink, fontSize: 11, fontWeight: '600' },
  timelineSubtitle: { color: colors.muted, fontSize: 8, marginTop: 3 },
  summaryCard: { padding: 0, overflow: 'hidden' },
  summaryRow: { minHeight: 38, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  summaryLabel: { color: colors.muted, fontSize: 10 },
  summaryValue: { color: colors.ink, fontSize: 10, fontWeight: '600' },
  aiHeader: { height: 66, backgroundColor: colors.green, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiHeaderTitle: { color: colors.cream, fontFamily: serif, fontSize: 17 },
  aiHeaderSubtitle: { color: '#9DB1A6', fontFamily: mono, fontSize: 7, letterSpacing: .6 },
  aiMessages: { flexGrow: 1, backgroundColor: colors.cream, padding: 14, gap: 12 },
  message: { maxWidth: '84%', borderRadius: 9, padding: 12 },
  doctorMessage: { alignSelf: 'flex-end', backgroundColor: colors.green },
  aiMessage: { alignSelf: 'flex-start', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  messageText: { color: colors.ink, fontSize: 11, lineHeight: 17 },
  source: { color: colors.faint, fontFamily: mono, fontSize: 7, marginTop: 8 },
  suggestions: { flexDirection: 'row', gap: 6, backgroundColor: colors.cream, paddingHorizontal: 12, marginBottom: 7 },
  composer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cream, paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  composerInput: { flex: 1, height: 42, borderWidth: 1, borderColor: colors.line, borderRadius: 21, backgroundColor: '#F8F5EE', paddingHorizontal: 14, color: colors.ink, fontSize: 11 },
  sendCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  sendArrow: { color: colors.white, fontSize: 18 },
  verificationNote: { color: colors.faint, textAlign: 'center', fontSize: 9, marginTop: 12 },
  submissionError: { color: colors.red, fontSize: 10, lineHeight: 15, marginBottom: 10 },
});
