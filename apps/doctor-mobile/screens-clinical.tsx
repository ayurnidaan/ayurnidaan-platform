import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { patients, quickReplies, weekSchedule } from './data';
import type { ChatMessage, Medicine, Navigation, PrescriptionDraft } from './types';
import { BackHeader, Button, Card, Chip, Eyebrow, Field, Frame, Heading, Row, Toggle, colors, mono, serif } from './ui';

export function CallScreen({ nav }: { nav: Navigation }) {
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  return (
    <Frame dark scroll={false}>
      <View style={clinicalStyles.callPage}>
        <View style={clinicalStyles.callTop}><View><Text style={clinicalStyles.callName}>Arun Prasad</Text><Text style={clinicalStyles.callTimer}>08:32</Text></View><View style={clinicalStyles.selfVideo}><Text style={clinicalStyles.selfVideoText}>{cameraOff ? 'OFF' : 'YOU'}</Text></View></View>
        <View style={clinicalStyles.patientVideo}><View style={clinicalStyles.callAvatar}><Text style={clinicalStyles.callAvatarText}>AP</Text></View><Eyebrow light>PATIENT VIDEO</Eyebrow></View>
        <Button label="Write prescription" variant="outline" onPress={() => nav.go('prescription')} />
        <View style={clinicalStyles.callControls}>
          <Pressable onPress={() => setMuted(!muted)} style={[clinicalStyles.callControl, muted && clinicalStyles.callControlOff]}><Text style={clinicalStyles.callControlIcon}>{muted ? '×' : '↟'}</Text></Pressable>
          <Pressable onPress={() => setCameraOff(!cameraOff)} style={[clinicalStyles.callControl, cameraOff && clinicalStyles.callControlOff]}><Text style={clinicalStyles.callControlIcon}>▣</Text></Pressable>
          <Pressable onPress={() => { nav.toast('Call ended · 08:32'); nav.go('prescription'); }} style={[clinicalStyles.callControl, clinicalStyles.endCall]}><Text style={clinicalStyles.callControlIcon}>×</Text></Pressable>
        </View>
      </View>
    </Frame>
  );
}

function MedicineEditor({ medicine, onChange, onRemove, canRemove }: { medicine: Medicine; onChange: (next: Medicine) => void; onRemove: () => void; canRemove: boolean }) {
  return (
    <Card style={clinicalStyles.medicineCard}>
      <View style={clinicalStyles.medicineTop}><TextInput value={medicine.name} onChangeText={name => onChange({ ...medicine, name })} placeholder="Medicine" placeholderTextColor={colors.faint} style={clinicalStyles.medicineName} />{canRemove ? <Pressable onPress={onRemove}><Text style={clinicalStyles.minus}>−</Text></Pressable> : null}</View>
      <View style={clinicalStyles.medicineFields}>{([['Dose','dose'],['1-0-1','frequency'],['5 days','duration']] as const).map(([placeholder, key]) => <TextInput key={key} value={medicine[key]} onChangeText={value => onChange({ ...medicine, [key]: value })} placeholder={placeholder} placeholderTextColor={colors.faint} style={clinicalStyles.medicineSmall} />)}</View>
    </Card>
  );
}

export function PrescriptionScreen({ nav, draft, onChange }: { nav: Navigation; draft: PrescriptionDraft; onChange: (draft: PrescriptionDraft) => void }) {
  const { diagnosis, advice, followUp, attached, medicines } = draft;
  const changeMedicine = (index: number, next: Medicine) => onChange({ ...draft, medicines: medicines.map((item, itemIndex) => itemIndex === index ? next : item) });
  return (
    <Frame>
      <BackHeader title="Prescription" subtitle="Arun Prasad · Today · 10:15" onBack={nav.back} />
      <Field label="DIAGNOSIS" value={diagnosis} onChangeText={value => onChange({ ...draft, diagnosis: value })} placeholder="e.g. Acute gastritis" />
      <View style={clinicalStyles.labelAction}><Eyebrow>MEDICINES</Eyebrow><Pressable onPress={() => onChange({ ...draft, medicines: [...medicines, { name: '', dose: '', frequency: '', duration: '' }] })}><Text style={clinicalStyles.addLink}>+ Add</Text></Pressable></View>
      <View style={clinicalStyles.medicines}>{medicines.map((medicine, index) => <MedicineEditor key={index} medicine={medicine} onChange={next => changeMedicine(index, next)} onRemove={() => onChange({ ...draft, medicines: medicines.filter((_, itemIndex) => itemIndex !== index) })} canRemove={medicines.length > 1} />)}</View>
      <Field label="ADVICE" value={advice} onChangeText={value => onChange({ ...draft, advice: value })} placeholder="Diet, rest, warnings" multiline />
      <Eyebrow>FOLLOW-UP</Eyebrow><View style={clinicalStyles.chips}>{['3 days','1 week','1 month','None'].map(value => <Chip key={value} label={value} selected={followUp === value} onPress={() => onChange({ ...draft, followUp: value })} small />)}</View>
      <Pressable onPress={() => onChange({ ...draft, attached: !attached })} style={[clinicalStyles.attachRow, attached && clinicalStyles.attached]}><View><Text style={clinicalStyles.attachTitle}>{attached ? 'lab-report-sep.pdf' : 'Attach a file'}</Text><Text style={clinicalStyles.attachSubtitle}>{attached ? 'Attached to this prescription' : 'Lab report or signed scan'}</Text></View><Text style={clinicalStyles.addLink}>{attached ? '✓' : '+'}</Text></Pressable>
      <Button label="Review and send" onPress={() => nav.go('rxPreview')} disabled={!diagnosis || !medicines[0].name} />
      <Text style={clinicalStyles.signed}>Signed as Dr. Kavya Nair, KA-AYU-20418</Text>
    </Frame>
  );
}

export function RxPreviewScreen({ nav, draft, onSent }: { nav: Navigation; draft: PrescriptionDraft; onSent: () => void }) {
  return (
    <Frame>
      <BackHeader title="Preview" onBack={nav.back} />
      <Card style={clinicalStyles.rxPaper}>
        <View style={clinicalStyles.rxTop}><View><Text style={clinicalStyles.rxDoctor}>Dr. Kavya Nair</Text><Text style={clinicalStyles.rxMeta}>Ayurvedic physician · KA-AYU-20418</Text></View><Text style={clinicalStyles.rxMark}>Rx</Text></View>
        <View style={clinicalStyles.rxPatient}><Text style={clinicalStyles.rxTextBold}>Arun Prasad · 52/M · 7 visits</Text><Text style={clinicalStyles.rxMeta}>3 Sep 2026</Text></View>
        <Eyebrow>DIAGNOSIS</Eyebrow><Text style={clinicalStyles.rxText}>{draft.diagnosis || 'Essential hypertension, uncontrolled'}</Text>
        <View style={clinicalStyles.rxRule} />
        {draft.medicines.filter(item => item.name).map((item, index) => <Text key={`${item.name}-${index}`} style={clinicalStyles.rxText}>{index + 1}. {item.name}{`\n`}   {item.dose || 'Dose'} · {item.frequency || 'Frequency'} · {item.duration || 'Duration'}</Text>)}
        <View style={clinicalStyles.rxRule} />
        <Eyebrow>ADVICE</Eyebrow><Text style={clinicalStyles.rxText}>{draft.advice || 'Diet, rest and warning signs discussed.'}</Text>
        <View style={clinicalStyles.signature}><Text style={clinicalStyles.rxMeta}>Follow-up: {draft.followUp}</Text><View><Text style={clinicalStyles.signatureName}>Kavya Nair</Text><Text style={clinicalStyles.rxMeta}>DIGITALLY SIGNED</Text></View></View>
      </Card>
      <View style={clinicalStyles.previewActions}><View style={{ flex: 1 }}><Button label="Edit" variant="outline" onPress={nav.back} /></View><View style={{ flex: 2 }}><Button label="Send to patient" onPress={() => { onSent(); nav.toast('Prescription sent to Arun Prasad'); nav.go('apptDetail'); }} /></View></View>
    </Frame>
  );
}

export function UploadScreen({ nav }: { nav: Navigation }) {
  const [file, setFile] = useState(false);
  return (
    <Frame>
      <BackHeader title="Upload" onBack={nav.back} />
      <Card style={clinicalStyles.uploadCard}>
        <View style={clinicalStyles.scanPreview}>{file ? <><Text style={clinicalStyles.scanIcon}>▤</Text><Text style={clinicalStyles.scanName}>signed-sheet.jpg</Text></> : <Text style={clinicalStyles.scanPlaceholder}>scan or photo of signed sheet</Text>}</View>
        <View style={clinicalStyles.previewActions}><View style={{ flex: 1 }}><Button label="Camera" onPress={() => setFile(true)} /></View><View style={{ flex: 1 }}><Button label="Files" variant="outline" onPress={() => setFile(true)} /></View></View>
      </Card>
      {file ? <View style={clinicalStyles.uploadSend}><Button label="Send to Arun Prasad" onPress={() => { nav.toast('Scan sent to Arun Prasad'); nav.go('apptDetail'); }} /></View> : null}
    </Frame>
  );
}

export function AvailabilityScreen({ nav }: { nav: Navigation }) {
  const [openDays, setOpenDays] = useState<Record<string, boolean>>(Object.fromEntries(weekSchedule.map(day => [day.day, true])));
  const [extra, setExtra] = useState<Record<string, boolean>>({});
  return (
    <Frame tab="availability" onTab={nav.tab}>
      <Heading size={29}>Availability</Heading><Text style={clinicalStyles.pageSubtitle}>Weekly hours patients can book</Text>
      <View style={clinicalStyles.days}>{weekSchedule.map(day => <Card key={day.day} style={clinicalStyles.dayCard}>
        <View style={clinicalStyles.dayHeader}><Text style={clinicalStyles.dayName}>{day.day}</Text><Toggle value={!!openDays[day.day]} onChange={value => setOpenDays(current => ({ ...current, [day.day]: value }))} /></View>
        {openDays[day.day] ? <>{day.ranges.map((range, index) => <View key={index} style={clinicalStyles.rangeRow}><Pressable onPress={() => nav.go('timeSheet')} style={clinicalStyles.timeBox}><Text style={clinicalStyles.timeText}>{range[0]}</Text></Pressable><Text style={clinicalStyles.to}>to</Text><Pressable onPress={() => nav.go('timeSheet')} style={clinicalStyles.timeBox}><Text style={clinicalStyles.timeText}>{range[1]}</Text></Pressable><Pressable onPress={() => nav.toast(index === 0 && !extra[day.day] ? `${day.day} closed` : 'Range removed')}><Text style={clinicalStyles.minus}>−</Text></Pressable></View>)}{extra[day.day] ? <View style={clinicalStyles.rangeRow}><Pressable onPress={() => nav.go('timeSheet')} style={clinicalStyles.timeBox}><Text style={clinicalStyles.timeText}>17:00</Text></Pressable><Text style={clinicalStyles.to}>to</Text><Pressable onPress={() => nav.go('timeSheet')} style={clinicalStyles.timeBox}><Text style={clinicalStyles.timeText}>20:00</Text></Pressable><Pressable onPress={() => setExtra(current => ({ ...current, [day.day]: false }))}><Text style={clinicalStyles.minus}>−</Text></Pressable></View> : null}<Pressable onPress={() => setExtra(current => ({ ...current, [day.day]: true }))}><Text style={clinicalStyles.addLink}>+ Add hours</Text></Pressable></> : <Text style={clinicalStyles.closedDay}>Closed · switch on to seed 09:00–13:00</Text>}
      </Card>)}</View>
      <Button label="+ Block time" variant="outline" onPress={() => nav.go('block')} />
    </Frame>
  );
}

export function TimeSheetScreen({ nav }: { nav: Navigation }) {
  const [selected, setSelected] = useState('09:00');
  const times = Array.from({ length: 32 }, (_, index) => {
    const totalMinutes = 360 + index * 30; const hour = Math.floor(totalMinutes / 60); const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  });
  return (
    <Frame scroll={false}>
      <View style={clinicalStyles.sheetBackdrop}><Pressable style={{ flex: 1 }} onPress={nav.back} /><View style={clinicalStyles.timeSheet}><View style={clinicalStyles.sheetHandle} /><Heading size={25}>Choose a time</Heading><Text style={clinicalStyles.pageSubtitle}>06:00 to 21:30 · 30-minute steps</Text><ScrollView style={clinicalStyles.timeScroll}>{times.map(time => <Pressable key={time} onPress={() => { setSelected(time); nav.toast(`Time set to ${time}`); nav.back(); }} style={[clinicalStyles.timeOption, selected === time && clinicalStyles.timeOptionSelected]}><Text style={[clinicalStyles.timeOptionText, selected === time && clinicalStyles.timeOptionTextSelected]}>{time}</Text></Pressable>)}</ScrollView></View></View>
    </Frame>
  );
}

export function BlockTimeScreen({ nav }: { nav: Navigation }) {
  const [date, setDate] = useState(7);
  const [wholeDay, setWholeDay] = useState(true);
  const [reason, setReason] = useState('Personal');
  return (
    <Frame tab="availability" onTab={nav.tab}>
      <BackHeader title="Block time" onBack={nav.back} />
      <Eyebrow>DATE</Eyebrow><View style={clinicalStyles.dateStrip}>{[['Thu',3],['Fri',4],['Sat',5],['Sun',6],['Mon',7],['Tue',8]].map(([day, value]) => <Pressable key={value} onPress={() => setDate(Number(value))} style={[clinicalStyles.stripDate, date === value && clinicalStyles.stripDateSelected]}><Text style={[clinicalStyles.stripDay, date === value && { color: colors.white }]}>{day}</Text><Text style={[clinicalStyles.stripNumber, date === value && { color: colors.white }]}>{value}</Text></Pressable>)}</View>
      <Eyebrow>EXTENT</Eyebrow><Card style={clinicalStyles.extentRow}><Text style={clinicalStyles.dayName}>Whole day</Text><Toggle value={wholeDay} onChange={setWholeDay} /></Card>
      {!wholeDay ? <View style={clinicalStyles.previewActions}><Pressable onPress={() => nav.go('timeSheet')} style={clinicalStyles.timeBox}><Text style={clinicalStyles.timeText}>09:00</Text></Pressable><Pressable onPress={() => nav.go('timeSheet')} style={clinicalStyles.timeBox}><Text style={clinicalStyles.timeText}>13:00</Text></Pressable></View> : null}
      <Eyebrow>REASON</Eyebrow><View style={clinicalStyles.chips}>{['Personal','Conference','Leave','Emergency'].map(value => <Chip key={value} label={value} selected={reason === value} onPress={() => setReason(value)} small />)}</View>
      <View style={clinicalStyles.clash}><Text style={clinicalStyles.clashText}>2 booked consults fall in this window. Patients will be asked to rebook.</Text></View>
      <Button label="Block this time" onPress={() => { nav.toast('Time blocked'); nav.go('availability'); }} />
    </Frame>
  );
}

export function PatientsScreen({ nav }: { nav: Navigation }) {
  const [search, setSearch] = useState('');
  const visible = useMemo(() => patients.filter(([name]) => name.toLowerCase().includes(search.toLowerCase())), [search]);
  return (
    <Frame tab="patients" onTab={nav.tab}>
      <Heading size={29}>Patients</Heading>
      <View style={clinicalStyles.searchBox}><Text style={clinicalStyles.searchGlyph}>⌕</Text><TextInput value={search} onChangeText={setSearch} placeholder="Search by name" placeholderTextColor={colors.faint} style={clinicalStyles.searchInput} /></View>
      <View style={clinicalStyles.patientList}>{visible.map(([name, initials, ageSex, last]) => <Pressable key={name} onPress={() => nav.go('history')} style={({ pressed }) => [clinicalStyles.patientRow, pressed && { opacity: .7 }]}><View style={clinicalStyles.patientInitials}><Text style={clinicalStyles.initialsText}>{initials}</Text></View><View style={{ flex: 1 }}><Text style={clinicalStyles.dayName}>{name}</Text><Text style={clinicalStyles.patientMeta}>{ageSex} · last seen {last}</Text></View><Pressable onPress={event => { event.stopPropagation(); nav.go('chat'); }} style={clinicalStyles.messageIcon}><Text style={clinicalStyles.messageIconText}>▭</Text></Pressable></Pressable>)}</View>
    </Frame>
  );
}

export function HistoryScreen({ nav }: { nav: Navigation }) {
  const [open, setOpen] = useState(0);
  const visits = [
    ['Amlapitta (hyperacidity)', '12 Aug 2026', ['Avipattikar churna — 3g — 1-0-1 — 14 d', 'Shatavari ghrita — 5ml — 0-0-1 — 14 d']],
    ['Seasonal allergic rhinitis', '2 Jun 2026', ['Sitopaladi churna — 2g — twice daily']],
    ['General check-up', '19 Feb 2026', ['No medicines prescribed']],
  ] as const;
  return (
    <Frame tab="patients" onTab={nav.tab}>
      <BackHeader title="Arun Prasad" subtitle="52/M · 7 visits" onBack={nav.back} />
      <View style={clinicalStyles.visits}>{visits.map(([title, date, medicines], index) => <Card key={title} onPress={() => setOpen(open === index ? -1 : index)} style={clinicalStyles.visit}><View style={clinicalStyles.visitHeader}><View><Text style={clinicalStyles.dayName}>{title}</Text><Text style={clinicalStyles.patientMeta}>{date}</Text></View><Text style={clinicalStyles.addLink}>{open === index ? '−' : '+'}</Text></View>{open === index ? <View style={clinicalStyles.visitDetails}>{medicines.map(medicine => <Text key={medicine} style={clinicalStyles.visitMedicine}>{medicine}</Text>)}</View> : null}</Card>)}</View>
    </Frame>
  );
}

export function PatientChatScreen({ nav }: { nav: Navigation }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, from: 'patient', text: 'Doctor, should I continue the amlodipine along with the new tablet?', time: '11:04' },
    { id: 2, from: 'doctor', text: 'Yes, continue it. Take the new one after dinner only.', time: '11:09' },
    { id: 3, from: 'patient', text: 'Understood. BP this morning was 138/88.', time: '11:12' },
  ]);
  const send = (text = input) => { const value = text.trim(); if (!value) return; setMessages(current => [...current, { id: Date.now(), from: 'doctor', text: value, time: 'Now' }]); setInput(''); };
  return (
    <Frame scroll={false}>
      <View style={clinicalStyles.chatHeader}><BackHeader title="Arun Prasad" subtitle="Follow-up window open" onBack={nav.back} /></View>
      <ScrollView contentContainerStyle={clinicalStyles.chatMessages}>{messages.map(message => <View key={message.id} style={[clinicalStyles.chatBubble, message.from === 'doctor' ? clinicalStyles.doctorBubble : clinicalStyles.patientBubble]}><Text style={[clinicalStyles.chatText, message.from === 'doctor' && { color: colors.white }]}>{message.text}</Text><Text style={[clinicalStyles.chatTime, message.from === 'doctor' && { color: '#AFC2B7' }]}>{message.time}</Text></View>)}</ScrollView>
      <View style={clinicalStyles.quickReplies}>{quickReplies.map(value => <Chip key={value} label={value} onPress={() => send(value)} small />)}</View>
      <View style={clinicalStyles.chatComposer}><TextInput value={input} onChangeText={setInput} onSubmitEditing={() => send()} placeholder="Message" placeholderTextColor={colors.faint} style={clinicalStyles.chatInput} /><Pressable onPress={() => send()} style={clinicalStyles.chatSend}><Text style={clinicalStyles.chatSendText}>➜</Text></Pressable></View>
    </Frame>
  );
}

const clinicalStyles = StyleSheet.create({
  callPage: { flex: 1, padding: 16 },
  callTop: { flexDirection: 'row', justifyContent: 'space-between' },
  callName: { color: colors.cream, fontFamily: serif, fontSize: 18 },
  callTimer: { color: '#B4C5BB', fontFamily: mono, fontSize: 10, marginTop: 3 },
  selfVideo: { width: 62, height: 80, borderRadius: 8, backgroundColor: '#0C2D20', alignItems: 'center', justifyContent: 'center' },
  selfVideoText: { color: '#799486', fontSize: 7 },
  patientVideo: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  callAvatar: { width: 82, height: 82, borderRadius: 41, borderWidth: 1, borderColor: '#597866', backgroundColor: '#315B45', alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  callAvatarText: { color: '#C6D2CB', fontFamily: serif, fontSize: 26 },
  callControls: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 12 },
  callControl: { width: 49, height: 49, borderRadius: 25, backgroundColor: '#315744', alignItems: 'center', justifyContent: 'center' },
  callControlOff: { backgroundColor: '#5B6A62' },
  endCall: { backgroundColor: colors.red },
  callControlIcon: { color: colors.white, fontSize: 19, fontWeight: '700' },
  labelAction: { flexDirection: 'row', justifyContent: 'space-between' },
  addLink: { color: colors.green, fontSize: 10, fontWeight: '600' },
  medicines: { gap: 8, marginBottom: 14 },
  medicineCard: { padding: 8 },
  medicineTop: { flexDirection: 'row', alignItems: 'center' },
  medicineName: { flex: 1, height: 36, color: colors.ink, fontSize: 11, paddingHorizontal: 8 },
  minus: { color: colors.red, fontSize: 18, paddingHorizontal: 8 },
  medicineFields: { flexDirection: 'row', gap: 6 },
  medicineSmall: { flex: 1, height: 34, borderWidth: 1, borderColor: colors.line, borderRadius: 6, color: colors.ink, paddingHorizontal: 8, fontSize: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  attachRow: { minHeight: 59, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, borderRadius: 9, padding: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
  attached: { backgroundColor: colors.mint, borderColor: '#91B09D' },
  attachTitle: { color: colors.ink, fontSize: 11, fontWeight: '600' },
  attachSubtitle: { color: colors.muted, fontSize: 8, marginTop: 3 },
  signed: { color: colors.faint, fontSize: 8, textAlign: 'center', marginTop: 11 },
  rxPaper: { minHeight: 470, padding: 18 },
  rxTop: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.ink, paddingBottom: 10 },
  rxDoctor: { color: colors.ink, fontFamily: serif, fontSize: 16 },
  rxMeta: { color: colors.muted, fontSize: 7, marginTop: 2 },
  rxMark: { color: colors.green, fontFamily: serif, fontStyle: 'italic', fontSize: 29 },
  rxPatient: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11 },
  rxTextBold: { color: colors.ink, fontSize: 9, fontWeight: '700' },
  rxText: { color: colors.ink, fontSize: 9, lineHeight: 16, marginBottom: 11 },
  rxRule: { height: 1, borderTopWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', borderColor: colors.line, marginBottom: 10 },
  signature: { marginTop: 'auto', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  signatureName: { color: colors.green, fontFamily: serif, fontStyle: 'italic', fontSize: 16 },
  previewActions: { flexDirection: 'row', gap: 8, marginTop: 11 },
  uploadCard: { borderStyle: 'dashed' },
  scanPreview: { height: 195, borderRadius: 6, backgroundColor: '#EEE9DF', alignItems: 'center', justifyContent: 'center' },
  scanPlaceholder: { color: colors.faint, fontFamily: mono, fontSize: 8 },
  scanIcon: { color: colors.green, fontSize: 45 },
  scanName: { color: colors.ink, fontSize: 10, marginTop: 8 },
  uploadSend: { marginTop: 14 },
  pageSubtitle: { color: colors.muted, fontSize: 10, marginTop: 4, marginBottom: 15 },
  days: { gap: 9, marginBottom: 14 },
  dayCard: { padding: 11 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  dayName: { color: colors.ink, fontSize: 11, fontWeight: '600' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 7 },
  timeBox: { flex: 1, height: 38, borderRadius: 7, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  timeText: { color: colors.ink, fontFamily: mono, fontSize: 10, fontWeight: '700' },
  to: { color: colors.faint, fontSize: 9 },
  closedDay: { color: colors.faint, fontSize: 9 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,30,22,.42)' },
  timeSheet: { height: '68%', borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.cream, padding: 18 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#C3BFB5', alignSelf: 'center', marginBottom: 15 },
  timeScroll: { marginTop: 6 },
  timeOption: { height: 43, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, justifyContent: 'center', paddingHorizontal: 10 },
  timeOptionSelected: { backgroundColor: colors.green, borderRadius: 7 },
  timeOptionText: { color: colors.ink, fontFamily: mono, fontSize: 11 },
  timeOptionTextSelected: { color: colors.white },
  dateStrip: { flexDirection: 'row', gap: 7, marginBottom: 20 },
  stripDate: { flex: 1, height: 55, borderRadius: 9, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  stripDateSelected: { backgroundColor: colors.green, borderColor: colors.green },
  stripDay: { color: colors.muted, fontSize: 7 },
  stripNumber: { color: colors.ink, fontFamily: mono, fontSize: 11, fontWeight: '700', marginTop: 4 },
  extentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 17 },
  clash: { borderRadius: 8, backgroundColor: colors.pink, padding: 12, marginBottom: 14 },
  clashText: { color: '#A35547', fontSize: 9, lineHeight: 14 },
  searchBox: { flexDirection: 'row', alignItems: 'center', height: 42, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.white, marginVertical: 14 },
  searchGlyph: { color: colors.faint, fontSize: 15, marginLeft: 11 },
  searchInput: { flex: 1, height: '100%', color: colors.ink, paddingHorizontal: 9, fontSize: 11 },
  patientList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  patientRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  patientInitials: { width: 39, height: 39, borderRadius: 20, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  initialsText: { color: '#72907F', fontFamily: serif, fontSize: 12 },
  patientMeta: { color: colors.muted, fontSize: 8, marginTop: 3 },
  messageIcon: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  messageIconText: { color: colors.green, fontSize: 12 },
  visits: { gap: 9 },
  visit: { padding: 12 },
  visitHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  visitDetails: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 9, gap: 7 },
  visitMedicine: { color: colors.muted, fontFamily: mono, fontSize: 8, lineHeight: 13 },
  chatHeader: { height: 65, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.white },
  chatMessages: { flexGrow: 1, padding: 14, gap: 10 },
  chatBubble: { maxWidth: '82%', borderRadius: 9, padding: 11 },
  doctorBubble: { alignSelf: 'flex-end', backgroundColor: colors.green },
  patientBubble: { alignSelf: 'flex-start', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  chatText: { color: colors.ink, fontSize: 11, lineHeight: 16 },
  chatTime: { color: colors.faint, textAlign: 'right', fontSize: 7, marginTop: 5 },
  quickReplies: { flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingBottom: 7 },
  chatComposer: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 9 },
  chatInput: { flex: 1, height: 41, borderWidth: 1, borderColor: colors.line, backgroundColor: '#F8F5EE', borderRadius: 20, paddingHorizontal: 13, color: colors.ink, fontSize: 11 },
  chatSend: { width: 41, height: 41, borderRadius: 21, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  chatSendText: { color: colors.white, fontSize: 17 },
});
