export type Route =
  | 'login'
  | 'otp'
  | 'applyDetails'
  | 'applyDocs'
  | 'applySubmitted'
  | 'pendingHome'
  | 'aiChat'
  | 'onboarding'
  | 'today'
  | 'todayEmpty'
  | 'notifications'
  | 'calendar'
  | 'appointments'
  | 'apptDetail'
  | 'cancelSheet'
  | 'reschedule'
  | 'call'
  | 'prescription'
  | 'rxPreview'
  | 'upload'
  | 'availability'
  | 'timeSheet'
  | 'block'
  | 'patients'
  | 'history'
  | 'chat'
  | 'profile'
  | 'earnings'
  | 'reviews'
  | 'language'
  | 'support';

export type TabRoute = 'today' | 'appointments' | 'availability' | 'patients' | 'profile';

export type Navigation = {
  go: (route: Route) => void;
  back: () => void;
  tab: (route: TabRoute) => void;
  toast: (message: string) => void;
};

export type Appointment = {
  patient: string;
  initials: string;
  ageSex: string;
  time: string;
  reason: string;
  status: 'Done' | 'Next' | 'Upcoming' | 'Cancelled';
};

export type Medicine = {
  name: string;
  dose: string;
  frequency: string;
  duration: string;
};

export type PrescriptionDraft = {
  diagnosis: string;
  advice: string;
  followUp: string;
  attached: boolean;
  medicines: Medicine[];
};

export type ChatMessage = {
  id: number;
  from: 'doctor' | 'patient' | 'ai';
  text: string;
  time?: string;
};

export type DoctorApplicationDraft = {
  mobileNumber: string;
  fullName: string;
  age: string;
  specialisations: string[];
  aadhaarNumber: string;
  panNumber: string;
  documents: {
    degree: boolean;
    aadhaar: boolean;
    pan: boolean;
  };
  consentAccepted: boolean;
};

export type SubmittedDoctorApplication = {
  id: string;
  referenceCode: string;
  submittedAt: string;
};
