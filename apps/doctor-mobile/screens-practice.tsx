import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { appointments, slots } from './data';
import type { Appointment, Navigation } from './types';
import { BackHeader, Button, Card, Chip, Eyebrow, Frame, Heading, Row, Toggle, colors, mono, serif } from './ui';

function StatusPill({ status }: { status: Appointment['status'] }) {
  const active = status === 'Next';
  return <View style={[practiceStyles.statusPill, active && practiceStyles.statusPillActive]}><Text style={[practiceStyles.statusText, active && practiceStyles.statusTextActive]}>{status}</Text></View>;
}

function AppointmentRow({ item, onPress }: { item: Appointment; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={practiceStyles.appointmentRow}>
      <Text style={practiceStyles.appointmentTime}>{item.time}</Text>
      <View style={practiceStyles.verticalLine} />
      <View style={{ flex: 1 }}><Text style={practiceStyles.patientName}>{item.patient}</Text><Text style={practiceStyles.reason}>{item.reason}</Text></View>
      <StatusPill status={item.status} />
    </Card>
  );
}

export function TodayScreen({ nav }: { nav: Navigation }) {
  return (
    <Frame dark tab="today" onTab={nav.tab}>
      <View style={practiceStyles.todayHeader}>
        <View><Text style={practiceStyles.dateLabel}>THURSDAY · 3 SEP</Text><Text style={practiceStyles.doctorName}>Dr. Kavya Nair</Text></View>
        <Pressable accessibilityLabel="Notifications" onPress={() => nav.go('notifications')} style={practiceStyles.bell}><Text style={practiceStyles.bellGlyph}>♧</Text><View style={practiceStyles.unreadDot} /></Pressable>
      </View>
      <View style={practiceStyles.counts}><View><Text style={practiceStyles.count}>5</Text><Text style={practiceStyles.countLabel}>consults today</Text></View><View style={practiceStyles.countDivider} /><View><Text style={practiceStyles.count}>2</Text><Text style={practiceStyles.countLabel}>prescriptions due</Text></View></View>
      <Card style={practiceStyles.nextCard}>
        <View style={practiceStyles.nextTop}><Eyebrow>NEXT</Eyebrow><View style={practiceStyles.inTime}><Text style={practiceStyles.inTimeText}>in 12 min</Text></View></View>
        <View style={practiceStyles.nextPatient}><View style={practiceStyles.avatar}><Text style={practiceStyles.avatarText}>AP</Text></View><View style={{ flex: 1 }}><Text style={practiceStyles.patientName}>Arun Prasad</Text><Text style={practiceStyles.reason}>52/M · BP review</Text></View></View>
        <View style={practiceStyles.joinRow}><Pressable onPress={() => nav.go('call')} style={practiceStyles.joinButton}><Text style={practiceStyles.joinText}>●  Join call</Text></Pressable><Pressable onPress={() => nav.go('apptDetail')} style={practiceStyles.nextChevron}><Text style={practiceStyles.chevron}>›</Text></Pressable></View>
      </Card>
      <View style={practiceStyles.sectionRow}><Eyebrow>TODAY</Eyebrow><Pressable onPress={() => nav.go('appointments')}><Text style={practiceStyles.allLink}>All</Text></Pressable></View>
      <View style={practiceStyles.list}>{appointments.map(item => <AppointmentRow key={item.patient} item={item} onPress={() => nav.go('apptDetail')} />)}</View>
      <Pressable onPress={() => nav.go('todayEmpty')}><Text style={practiceStyles.prototypeLink}>Preview empty-day state</Text></Pressable>
    </Frame>
  );
}

export function TodayEmptyScreen({ nav }: { nav: Navigation }) {
  return (
    <Frame dark tab="today" onTab={nav.tab} scroll={false}>
      <View style={practiceStyles.emptyHeader}><Text style={practiceStyles.dateLabel}>SUNDAY · 6 SEP</Text><Text style={practiceStyles.doctorName}>Dr. Kavya Nair</Text></View>
      <View style={practiceStyles.emptyBody}><View style={practiceStyles.emptySun} /><Heading size={25}>No consults today</Heading><Text style={practiceStyles.emptyText}>Sunday is closed in your weekly hours. Open it if you want bookings.</Text><View style={{ width: 120, marginTop: 24 }}><Button label="Open hours" variant="outline" onPress={() => nav.go('availability')} /></View></View>
    </Frame>
  );
}

export function NotificationsScreen({ nav }: { nav: Navigation }) {
  const [read, setRead] = useState(false);
  const notifications = [
    ['New booking · Nikita Bose', 'Today 11:00, video consult', '08:12', 'apptDetail'],
    ['Prescription pending', 'Meera Raghavan, consult finished 09:52', '09:52', 'prescription'],
    ['Patient cancelled', 'Latha Suresh, Sat 29 Aug 16:00', 'Yesterday', 'appointments'],
    ['Report uploaded', 'Sana Qureshi shared a thyroid panel', 'Yesterday', 'upload'],
  ] as const;
  return (
    <Frame tab="today" onTab={nav.tab}>
      <View style={practiceStyles.titleActions}><BackHeader title="Notifications" onBack={nav.back} /><Pressable onPress={() => setRead(true)}><Text style={practiceStyles.markRead}>Mark read</Text></Pressable></View>
      <View style={practiceStyles.notificationList}>{notifications.map(([title, subtitle, time, route], index) => <Card key={title} onPress={() => nav.go(route)} style={practiceStyles.notification}><View style={[practiceStyles.notificationDot, (read || index > 1) && practiceStyles.notificationDotRead]} /><View style={{ flex: 1 }}><Text style={practiceStyles.notificationTitle}>{title}</Text><Text style={practiceStyles.notificationSubtitle}>{subtitle}</Text><Text style={practiceStyles.notificationTime}>{time}</Text></View></Card>)}</View>
    </Frame>
  );
}

export function CalendarScreen({ nav }: { nav: Navigation }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selected, setSelected] = useState(3);
  const month = monthOffset === 0 ? 'September 2026' : monthOffset < 0 ? 'August 2026' : 'October 2026';
  return (
    <Frame tab="appointments" onTab={nav.tab}>
      <View style={practiceStyles.calendarHeader}><Heading size={27}>{month}</Heading><View style={practiceStyles.monthButtons}><Pressable onPress={() => setMonthOffset(value => value - 1)} style={practiceStyles.circleButton}><Text>‹</Text></Pressable><Pressable onPress={() => setMonthOffset(value => value + 1)} style={practiceStyles.circleButton}><Text>›</Text></Pressable></View></View>
      <View style={practiceStyles.weekdays}>{['S','M','T','W','T','F','S'].map((value, index) => <Text key={`${value}${index}`} style={practiceStyles.weekday}>{value}</Text>)}</View>
      <View style={practiceStyles.calendarGrid}>{Array.from({ length: 30 }, (_, index) => index + 1).map(day => <Pressable key={day} onPress={() => setSelected(day)} style={[practiceStyles.dateCell, selected === day && practiceStyles.dateCellSelected]}><Text style={[practiceStyles.dateNumber, selected === day && practiceStyles.dateNumberSelected]}>{day}</Text>{[1,2,3,4,5,7,9,10,11,12,14,15,16,17,18,19,21,22,23,24,25,26,28,29,30].includes(day) ? <View style={[practiceStyles.dateDot, [8,11].includes(day) && { backgroundColor: colors.red }]} /> : null}</Pressable>)}</View>
      <View style={practiceStyles.legend}><Text style={practiceStyles.booked}>● Booked</Text><Text style={practiceStyles.blocked}>● Blocked</Text><Text style={practiceStyles.closed}>● Closed</Text></View>
      <Eyebrow>THU 3 SEP</Eyebrow><View style={practiceStyles.list}>{appointments.map(item => <AppointmentRow key={item.patient} item={item} onPress={() => nav.go('apptDetail')} />)}</View>
    </Frame>
  );
}

export function AppointmentsScreen({ nav }: { nav: Navigation }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'Upcoming' | 'Completed' | 'Cancelled'>('Upcoming');
  const visible = useMemo(() => appointments.filter(item => item.patient.toLowerCase().includes(search.toLowerCase()) && (filter === 'Upcoming' ? item.status !== 'Done' && item.status !== 'Cancelled' : filter === 'Completed' ? item.status === 'Done' : item.status === 'Cancelled')), [search, filter]);
  return (
    <Frame tab="appointments" onTab={nav.tab}>
      <Heading size={28}>Appointments</Heading>
      <View style={practiceStyles.searchBox}><Text style={practiceStyles.searchIcon}>⌕</Text><TextInput value={search} onChangeText={setSearch} placeholder="Search patient" placeholderTextColor={colors.faint} style={practiceStyles.searchInput} /></View>
      <View style={practiceStyles.filters}>{(['Upcoming', 'Completed', 'Cancelled'] as const).map(value => <Chip key={value} label={value} selected={filter === value} onPress={() => setFilter(value)} small />)}</View>
      <View style={practiceStyles.list}>{visible.length ? visible.map(item => <AppointmentRow key={item.patient} item={item} onPress={() => nav.go('apptDetail')} />) : <Card><Text style={practiceStyles.nothing}>Nothing here</Text></Card>}</View>
    </Frame>
  );
}

export function AppointmentDetailScreen({ nav }: { nav: Navigation }) {
  return (
    <Frame tab="appointments" onTab={nav.tab}>
      <BackHeader title="Arun Prasad" subtitle="52/M · 7 visits" onBack={nav.back} />
      <View style={practiceStyles.detailAvatar}><Text style={practiceStyles.avatarText}>AP</Text></View>
      <Card style={practiceStyles.detailCard}>
        {[['When', 'Today · 10:15'], ['Mode', 'Video consult'], ['Reason', 'BP review']].map(([label, value]) => <View key={label} style={practiceStyles.detailRow}><Text style={practiceStyles.detailLabel}>{label}</Text><Text style={practiceStyles.detailValue}>{value}</Text></View>)}
      </Card>
      <Eyebrow>NOTES FROM PATIENT</Eyebrow><View style={practiceStyles.notes}><Text style={practiceStyles.notesText}>Home readings averaging 148/92 over the last ten days.{`\n`}On amlodipine 5mg.</Text></View>
      <Row title="Patient history" subtitle="7 past consults" onPress={() => nav.go('history')} />
      <View style={practiceStyles.detailActions}><Button label="Join call" icon="●" onPress={() => nav.go('call')} /><Button label="Write prescription" variant="outline" onPress={() => nav.go('prescription')} /><View style={practiceStyles.splitActions}><View style={{ flex: 1 }}><Button label="Upload a scan" variant="outline" onPress={() => nav.go('upload')} /></View><View style={{ flex: 1 }}><Button label="Move slot" variant="outline" onPress={() => nav.go('reschedule')} /></View></View><Button label="Cancel appointment" variant="ghost" onPress={() => nav.go('cancelSheet')} /></View>
    </Frame>
  );
}

export function CancelSheetScreen({ nav }: { nav: Navigation }) {
  const [reason, setReason] = useState('Patient request');
  return (
    <Frame scroll={false}>
      <View style={practiceStyles.sheetBackdrop}><View style={practiceStyles.sheetUnderlay}><BackHeader title="Arun Prasad" onBack={nav.back} /><Card><Text style={practiceStyles.patientName}>Today · 10:15 · Video consult</Text></Card></View><View style={practiceStyles.sheet}><View style={practiceStyles.sheetHandle} /><Heading size={25}>Cancel this consult?</Heading><Text style={practiceStyles.sheetText}>The patient will be refunded automatically. Choose the reason they will see.</Text><View style={practiceStyles.filters}>{['Patient request','Doctor unavailable','Emergency'].map(value => <Chip key={value} label={value} selected={reason === value} onPress={() => setReason(value)} small />)}</View><View style={practiceStyles.sheetActions}><Button label="Keep consult" variant="outline" onPress={nav.back} /><Button label="Cancel consult" variant="danger" onPress={() => { nav.toast('Consult cancelled · patient refunded'); nav.tab('appointments'); }} /></View></View></View>
    </Frame>
  );
}

export function RescheduleScreen({ nav }: { nav: Navigation }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Frame>
      <BackHeader title="Move consult" subtitle="Arun Prasad · now Today · 10:15" onBack={nav.back} />
      {slots.map(([day, values]) => <View key={day} style={practiceStyles.slotSection}><Eyebrow>{day}</Eyebrow><View style={practiceStyles.slotRow}>{values.map(value => <Chip key={value} label={value} selected={selected === `${day}-${value}`} onPress={() => setSelected(`${day}-${value}`)} small />)}</View></View>)}
      <Button label={selected ? `Move to ${selected.split('-').at(-1)}` : 'Pick a slot'} disabled={!selected} onPress={() => { nav.toast('Request sent to Arun Prasad'); nav.go('apptDetail'); }} />
      <Text style={practiceStyles.centerNote}>Patient gets a notification to accept</Text>
    </Frame>
  );
}

const practiceStyles = StyleSheet.create({
  todayHeader: { marginHorizontal: -16, marginTop: -16, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 6, backgroundColor: colors.green, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateLabel: { color: '#A8BCB1', fontFamily: mono, fontSize: 9, letterSpacing: 1.2 },
  doctorName: { color: colors.cream, fontFamily: serif, fontSize: 25, lineHeight: 28 },
  bell: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#4C725D', alignItems: 'center', justifyContent: 'center' },
  bellGlyph: { color: colors.cream, fontSize: 20 },
  unreadDot: { position: 'absolute', right: 7, top: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold },
  counts: { marginHorizontal: -16, paddingHorizontal: 16, paddingBottom: 16, backgroundColor: colors.green, flexDirection: 'row', gap: 22 },
  count: { color: colors.cream, fontFamily: serif, fontSize: 24 },
  countLabel: { color: '#A9BAB1', fontSize: 8 },
  countDivider: { width: 1, backgroundColor: '#416A54' },
  nextCard: { marginTop: 14 },
  nextTop: { flexDirection: 'row', justifyContent: 'space-between' },
  inTime: { borderRadius: 10, backgroundColor: colors.mint, paddingHorizontal: 8, paddingVertical: 4 },
  inTimeText: { color: '#4E8B62', fontSize: 8 },
  nextPatient: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarText: { color: '#739381', fontFamily: serif, fontSize: 15 },
  patientName: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  reason: { color: colors.muted, fontSize: 9, marginTop: 3 },
  joinRow: { flexDirection: 'row', gap: 7 },
  joinButton: { flex: 1, minHeight: 40, borderRadius: 7, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  joinText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  nextChevron: { width: 40, borderWidth: 1, borderColor: colors.line, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  chevron: { color: colors.green, fontSize: 22 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 19 },
  allLink: { color: colors.green, fontSize: 10 },
  list: { gap: 8 },
  appointmentRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', padding: 10 },
  appointmentTime: { width: 47, color: colors.ink, fontFamily: mono, fontSize: 10, fontWeight: '700' },
  verticalLine: { width: 1, height: 30, backgroundColor: colors.line, marginRight: 10 },
  statusPill: { borderRadius: 9, backgroundColor: colors.mint, paddingHorizontal: 7, paddingVertical: 4 },
  statusPillActive: { backgroundColor: colors.green },
  statusText: { color: '#5E956E', fontSize: 7 },
  statusTextActive: { color: colors.white },
  prototypeLink: { color: colors.faint, textAlign: 'center', fontSize: 8, marginTop: 16 },
  emptyHeader: { backgroundColor: colors.green, padding: 16, paddingBottom: 18 },
  emptyBody: { flex: 1, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 },
  emptySun: { width: 55, height: 55, borderRadius: 28, borderWidth: 1, borderColor: colors.line, marginBottom: 20 },
  emptyText: { color: colors.muted, textAlign: 'center', fontSize: 10, lineHeight: 16, marginTop: 8 },
  titleActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  markRead: { color: colors.green, fontSize: 10, marginTop: 13 },
  notificationList: { gap: 8 },
  notification: { flexDirection: 'row', gap: 10 },
  notificationDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold, marginTop: 4 },
  notificationDotRead: { backgroundColor: colors.line },
  notificationTitle: { color: colors.ink, fontSize: 11, fontWeight: '600' },
  notificationSubtitle: { color: colors.muted, fontSize: 9, marginTop: 3 },
  notificationTime: { color: colors.faint, fontSize: 8, marginTop: 5 },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  monthButtons: { flexDirection: 'row', gap: 7 },
  circleButton: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  weekdays: { flexDirection: 'row', marginBottom: 6 },
  weekday: { width: '14.285%', textAlign: 'center', color: colors.faint, fontSize: 8 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  dateCell: { width: '14.285%', height: 49, borderRadius: 7, borderWidth: 2, borderColor: colors.cream, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  dateCellSelected: { backgroundColor: colors.green },
  dateNumber: { color: colors.ink, fontFamily: mono, fontSize: 10, fontWeight: '700' },
  dateNumberSelected: { color: colors.white },
  dateDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#59A269', marginTop: 4 },
  legend: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  booked: { color: '#5B9368', fontSize: 8 },
  blocked: { color: colors.red, fontSize: 8 },
  closed: { color: colors.faint, fontSize: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', height: 42, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.white, marginTop: 15 },
  searchIcon: { color: colors.faint, marginLeft: 11, fontSize: 15 },
  searchInput: { flex: 1, height: '100%', paddingHorizontal: 10, color: colors.ink, fontSize: 11 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginVertical: 12 },
  nothing: { color: colors.muted, textAlign: 'center', padding: 20 },
  detailAvatar: { position: 'absolute', right: 16, top: 30, width: 42, height: 42, borderRadius: 21, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  detailCard: { padding: 0, overflow: 'hidden' },
  detailRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 12 },
  detailLabel: { color: colors.muted, fontSize: 9 },
  detailValue: { color: colors.ink, fontSize: 10, fontWeight: '600' },
  notes: { backgroundColor: '#ECE8DD', borderRadius: 8, padding: 12, marginBottom: 12 },
  notesText: { color: colors.ink, fontSize: 10, lineHeight: 15 },
  detailActions: { gap: 8, marginTop: 13 },
  splitActions: { flexDirection: 'row', gap: 8 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(15,30,22,.42)', justifyContent: 'flex-end' },
  sheetUnderlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.cream, padding: 16, opacity: .55 },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.cream, padding: 20, paddingBottom: 26 },
  sheetHandle: { width: 43, height: 4, borderRadius: 2, backgroundColor: '#C6C1B7', alignSelf: 'center', marginBottom: 19 },
  sheetText: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 8 },
  sheetActions: { gap: 8, marginTop: 12 },
  slotSection: { marginBottom: 18 },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  centerNote: { textAlign: 'center', color: colors.faint, fontSize: 9, marginTop: 12 },
});
