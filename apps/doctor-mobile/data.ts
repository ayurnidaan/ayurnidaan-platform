import type { Appointment } from './types';

export const appointments: Appointment[] = [
  { patient: 'Meera Raghavan', initials: 'MR', ageSex: '34/F', time: '09:30', reason: 'Acidity, 3 weeks', status: 'Done' },
  { patient: 'Arun Prasad', initials: 'AP', ageSex: '52/M', time: '10:15', reason: 'BP review', status: 'Next' },
  { patient: 'Nikita Bose', initials: 'NB', ageSex: '27/F', time: '11:00', reason: 'Sleep trouble', status: 'Upcoming' },
  { patient: 'Ramesh Iyer', initials: 'RI', ageSex: '61/M', time: '11:45', reason: 'Knee pain follow-up', status: 'Upcoming' },
  { patient: 'Sana Qureshi', initials: 'SQ', ageSex: '41/F', time: '18:00', reason: 'Thyroid report', status: 'Upcoming' },
];

export const patients = [
  ['Meera Raghavan', 'MR', '34/F', 'today'],
  ['Arun Prasad', 'AP', '52/M', 'today'],
  ['Nikita Bose', 'NB', '27/F', 'today'],
  ['Ramesh Iyer', 'RI', '61/M', 'today'],
  ['Sana Qureshi', 'SQ', '41/F', 'today'],
  ['Devika Menon', 'DM', '38/F', '1 Sep'],
  ['Harsh Vora', 'HV', '45/M', '31 Aug'],
  ['Latha Suresh', 'LS', '56/F', '29 Aug'],
] as const;

export const specialisations = ['Kayachikitsa', 'Panchakarma', 'Shalya', 'Prasuti & Stri', 'Balaroga', 'Rasayana'];
export const focusAreas = ['Cardio-metabolic', 'Digestive', 'Sleep & stress', 'Skin', 'Joints', "Women's health"];
export const quickReplies = ['Continue same dose', 'Send me a photo', 'Book a follow-up'];
export const slots = [
  ['FRI 4 SEP', ['09:00', '09:30', '11:00', '12:00']],
  ['SAT 5 SEP', ['10:00', '10:30', '11:30', '12:00']],
  ['MON 7 SEP', ['09:00', '10:00', '17:30', '18:00']],
] as const;

export const weekSchedule = [
  { day: 'Monday', ranges: [['09:00', '13:00'], ['17:00', '20:00']] },
  { day: 'Tuesday', ranges: [['09:00', '13:00']] },
  { day: 'Wednesday', ranges: [['09:00', '13:00'], ['17:00', '20:00']] },
  { day: 'Thursday', ranges: [['10:00', '14:00']] },
] as const;
