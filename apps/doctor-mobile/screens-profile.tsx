import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Navigation } from './types';
import { BackHeader, Button, Card, Eyebrow, Frame, Heading, Row, Toggle, colors, mono, serif } from './ui';

function SettingRow({ title, subtitle, value, onChange }: { title: string; subtitle: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={profileStyles.settingRow}><View style={{ flex: 1 }}><Text style={profileStyles.settingTitle}>{title}</Text><Text style={profileStyles.settingSubtitle}>{subtitle}</Text></View><Toggle value={value} onChange={onChange} /></View>;
}

export function ProfileScreen({ nav }: { nav: Navigation }) {
  const [alerts, setAlerts] = useState(true);
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [buffer, setBuffer] = useState(false);
  return (
    <Frame dark tab="profile" onTab={nav.tab}>
      <View style={profileStyles.profileHeader}>
        <View style={profileStyles.profileAvatar}><Text style={profileStyles.profileInitials}>KN</Text></View>
        <View><Text style={profileStyles.profileName}>Dr. Kavya Nair</Text><Text style={profileStyles.profileMeta}>Ayurvedic physician · KA-AYU-20418</Text></View>
      </View>
      <Card style={profileStyles.settingsCard}>
        <SettingRow title="New booking alerts" subtitle="Push when a slot is taken" value={alerts} onChange={setAlerts} />
        <SettingRow title="Auto-confirm bookings" subtitle="Within your open hours" value={autoConfirm} onChange={setAutoConfirm} />
        <SettingRow title="Buffer between consults" subtitle="5 minutes" value={buffer} onChange={setBuffer} />
        <Row title="Consultation hours" onPress={() => nav.go('availability')} />
        <Row title="Calendar" right={<Text style={profileStyles.value}>Sep  ›</Text>} onPress={() => nav.go('calendar')} />
        <Row title="Earnings" right={<Text style={profileStyles.value}>₹48,200  ›</Text>} onPress={() => nav.go('earnings')} />
        <Row title="Feedback" right={<Text style={profileStyles.value}>4.8  ›</Text>} onPress={() => nav.go('reviews')} />
        <Row title="Ayurveda AI" onPress={() => nav.go('aiChat')} />
        <Row title="Language" right={<Text style={profileStyles.value}>English  ›</Text>} onPress={() => nav.go('language')} />
        <Row title="Help" onPress={() => nav.go('support')} />
      </Card>
      <Card style={profileStyles.weekCard}><Eyebrow>THIS WEEK</Eyebrow><View style={profileStyles.weekStats}><View><Text style={profileStyles.weekValue}>34</Text><Text style={profileStyles.statLabel}>consults</Text></View><View><Text style={profileStyles.weekValue}>18h</Text><Text style={profileStyles.statLabel}>open hours</Text></View></View></Card>
      <Button label="Sign out" variant="ghost" onPress={() => nav.go('login')} />
    </Frame>
  );
}

export function EarningsScreen({ nav }: { nav: Navigation }) {
  const bars = [42, 57, 45, 69, 59, 73];
  const settlements = [['₹11,800','29 Aug · 9 consults','Paid'],['₹14,400','22 Aug · 11 consults','Paid'],['₹6,400','15 Sep · 5 consults','Processing'],['₹9,200','15 Aug · 7 consults','Paid']];
  return (
    <Frame dark tab="profile" onTab={nav.tab}>
      <BackHeader title="" onBack={nav.back} />
      <View style={profileStyles.earningsHero}><Eyebrow light>SEPTEMBER</Eyebrow><Text style={profileStyles.earningsValue}>₹48,200</Text><Text style={profileStyles.earningsMeta}>34 consults · ₹6,400 pending payout</Text></View>
      <Card style={profileStyles.chartCard}><Eyebrow>LAST 6 WEEKS</Eyebrow><View style={profileStyles.chart}>{bars.map((height, index) => <View key={index} style={profileStyles.barWrap}><View style={[profileStyles.bar, { height }, index === 5 && profileStyles.barActive]} /><Text style={profileStyles.barLabel}>W{30 + index}</Text></View>)}</View></Card>
      <Eyebrow>SETTLEMENTS</Eyebrow><Card style={profileStyles.settlements}>{settlements.map(([amount, date, status]) => <Pressable key={date} onPress={() => nav.toast(`${amount} settlement breakdown`)} style={profileStyles.settlementRow}><View><Text style={profileStyles.settlementAmount}>{amount}</Text><Text style={profileStyles.settlementDate}>{date}</Text></View><View style={[profileStyles.paidPill, status === 'Processing' && profileStyles.processingPill]}><Text style={[profileStyles.paidText, status === 'Processing' && profileStyles.processingText]}>{status}</Text></View></Pressable>)}</Card>
    </Frame>
  );
}

export function ReviewsScreen({ nav }: { nav: Navigation }) {
  const ratings = [89, 14, 5, 2, 1];
  const reviews = [
    ['Arun P.', 'Explained the readings patiently and did not rush the call.', '2 days ago', 5],
    ['Meera R.', 'Prescription came through to the app within minutes.', '1 week ago', 5],
    ['Harsh V.', 'Helpful consult, though the call started a few minutes late.', '2 weeks ago', 4],
  ] as const;
  return (
    <Frame tab="profile" onTab={nav.tab}>
      <BackHeader title="Feedback" onBack={nav.back} />
      <View style={profileStyles.ratingSummary}><View><Text style={profileStyles.ratingValue}>4.8</Text><Text style={profileStyles.ratingCount}>128 ratings</Text></View><View style={profileStyles.ratingBars}>{ratings.map((width, index) => <View key={index} style={profileStyles.ratingRow}><Text style={profileStyles.ratingNumber}>{5-index}</Text><View style={profileStyles.ratingTrack}><View style={[profileStyles.ratingFill, { width: `${width}%` }]} /></View></View>)}</View></View>
      <View style={profileStyles.reviewList}>{reviews.map(([name, text, date, stars]) => <Card key={name}><View style={profileStyles.reviewTop}><Text style={profileStyles.settingTitle}>{name}</Text><Text style={profileStyles.stars}>{'★'.repeat(stars)}{'☆'.repeat(5-stars)}</Text></View><Text style={profileStyles.reviewText}>{text}</Text><Text style={profileStyles.reviewDate}>{date}</Text></Card>)}</View>
    </Frame>
  );
}

export function LanguageScreen({ nav }: { nav: Navigation }) {
  const [selected, setSelected] = useState('English');
  return (
    <Frame tab="profile" onTab={nav.tab}>
      <BackHeader title="Language" onBack={nav.back} />
      <Card style={profileStyles.languageCard}>{['English','हिन्दी','ಕನ್ನಡ','தமிழ்'].map(value => <Pressable key={value} onPress={() => { setSelected(value); nav.toast(`Language changed to ${value}`); }} style={profileStyles.languageRow}><Text style={profileStyles.languageText}>{value}</Text>{selected === value ? <Text style={profileStyles.languageCheck}>✓</Text> : null}</Pressable>)}</Card>
    </Frame>
  );
}

export function SupportScreen({ nav }: { nav: Navigation }) {
  const [topic, setTopic] = useState<string | null>(null);
  const topics = ['Payouts and fees','Verification status','Call quality issues','Prescription rules','Cancellation policy'];
  return (
    <Frame tab="profile" onTab={nav.tab}>
      <BackHeader title="Help" onBack={nav.back} />
      <Card style={profileStyles.languageCard}>{topics.map(value => <Pressable key={value} onPress={() => setTopic(topic === value ? null : value)} style={profileStyles.topicRow}><View style={{ flex: 1 }}><Text style={profileStyles.languageText}>{value}</Text>{topic === value ? <Text style={profileStyles.topicBody}>This article will contain the current Ayurnidaan policy and step-by-step guidance once support content is connected.</Text> : null}</View><Text style={profileStyles.topicChevron}>{topic === value ? '−' : '›'}</Text></Pressable>)}</Card>
      <View style={profileStyles.supportCard}><Text style={profileStyles.supportTitle}>Still stuck?</Text><Text style={profileStyles.supportText}>Doctor support answers within 2 hours, 8am to 10pm.</Text><Button label="Chat with support" onPress={() => nav.toast('Support conversation opened')} /></View>
    </Frame>
  );
}

const profileStyles = StyleSheet.create({
  profileHeader: { marginHorizontal: -16, marginTop: -16, marginBottom: 13, backgroundColor: colors.green, padding: 16, flexDirection: 'row', alignItems: 'center' },
  profileAvatar: { width: 45, height: 45, borderRadius: 23, backgroundColor: '#557663', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  profileInitials: { color: colors.cream, fontFamily: serif, fontSize: 17 },
  profileName: { color: colors.cream, fontFamily: serif, fontSize: 20 },
  profileMeta: { color: '#A7B9AF', fontSize: 8, marginTop: 3 },
  settingsCard: { padding: 0, overflow: 'hidden' },
  settingRow: { minHeight: 59, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 10, backgroundColor: colors.white },
  settingTitle: { color: colors.ink, fontSize: 11, fontWeight: '600' },
  settingSubtitle: { color: colors.muted, fontSize: 8, marginTop: 3 },
  value: { color: colors.faint, fontSize: 9 },
  weekCard: { marginTop: 13 },
  weekStats: { flexDirection: 'row', gap: 24 },
  weekValue: { color: colors.ink, fontFamily: serif, fontSize: 22 },
  statLabel: { color: colors.muted, fontSize: 8 },
  earningsHero: { marginHorizontal: -16, marginTop: -70, paddingHorizontal: 16, paddingTop: 72, paddingBottom: 16, backgroundColor: colors.green },
  earningsValue: { color: colors.cream, fontFamily: serif, fontSize: 34 },
  earningsMeta: { color: '#AFC0B7', fontSize: 9, marginTop: 4 },
  chartCard: { marginTop: 13, marginBottom: 18 },
  chart: { height: 95, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  barWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: 34, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: '#BED1C3' },
  barActive: { backgroundColor: colors.green },
  barLabel: { color: colors.faint, fontFamily: mono, fontSize: 7, marginTop: 5 },
  settlements: { padding: 0, overflow: 'hidden' },
  settlementRow: { minHeight: 62, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settlementAmount: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  settlementDate: { color: colors.muted, fontFamily: mono, fontSize: 7, marginTop: 3 },
  paidPill: { borderRadius: 9, backgroundColor: colors.mint, paddingHorizontal: 8, paddingVertical: 4 },
  paidText: { color: '#4D9462', fontSize: 7 },
  processingPill: { backgroundColor: '#F4E9CB' },
  processingText: { color: colors.gold },
  ratingSummary: { flexDirection: 'row', alignItems: 'center', gap: 21, marginBottom: 17 },
  ratingValue: { color: colors.ink, fontFamily: serif, fontSize: 40 },
  ratingCount: { color: colors.faint, fontSize: 8 },
  ratingBars: { flex: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 2 },
  ratingNumber: { color: colors.muted, fontSize: 8, width: 7 },
  ratingTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#DDD8CD', overflow: 'hidden' },
  ratingFill: { height: '100%', backgroundColor: '#4D805F' },
  reviewList: { gap: 9 },
  reviewTop: { flexDirection: 'row', justifyContent: 'space-between' },
  stars: { color: colors.gold, fontSize: 10 },
  reviewText: { color: colors.ink, fontSize: 10, lineHeight: 15, marginTop: 8 },
  reviewDate: { color: colors.faint, fontFamily: mono, fontSize: 7, marginTop: 7 },
  languageCard: { padding: 0, overflow: 'hidden' },
  languageRow: { minHeight: 55, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  languageText: { color: colors.ink, fontSize: 11, fontWeight: '500' },
  languageCheck: { color: colors.green, fontSize: 14, fontWeight: '700' },
  topicRow: { minHeight: 55, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  topicChevron: { color: colors.faint, fontSize: 18 },
  topicBody: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 7, paddingRight: 10 },
  supportCard: { borderRadius: 10, backgroundColor: colors.mint, padding: 14, marginTop: 15 },
  supportTitle: { color: colors.green, fontFamily: serif, fontSize: 17 },
  supportText: { color: colors.muted, fontSize: 9, lineHeight: 14, marginVertical: 8 },
});
