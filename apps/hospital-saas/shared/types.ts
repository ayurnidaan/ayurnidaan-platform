export type Session = "Morning" | "Noon" | "Evening";
export type Mode = "legacy" | "three_session";
export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  address: string;
  admissionDate: string;
  dischargeDate: string;
  nextVisit: string;
  diagnosis: string;
  physician: string;
  room: string;
  bloodGroup: string;
  allergies: string;
  favourite: boolean;
  vitalsMode: Mode;
  createdAt: string;
  status: "Admitted" | "Discharged";
  dischargedAt: string;
}
export interface Vital {
  id: string;
  patientId: string;
  date: string;
  session: Session | "Daily";
  time: string;
  height?: number | null;
  weight?: number | null;
  temperature?: number | null;
  pulse?: number | null;
  bp: string;
  rr?: number | null;
  painScore?: number | null;
  fbs?: number | null;
  ppbs?: number | null;
  rbs?: number | null;
  spo2?: number | null;
  sleep: string;
  bowel: string;
  appetite: string;
}
export interface Therapy {
  id: string;
  name: string;
  category: string;
  price: number;
  duration: number;
  active: boolean;
}
export interface Assignment {
  id: string;
  patientId: string;
  date: string;
  session: Session;
  therapyId: string;
  status: "Scheduled" | "Completed" | "Cancelled";
  estimateId: string | null;
  name: string;
  duration: number;
  price: number;
}
export interface Note {
  id: string;
  patientId: string;
  date: string;
  session: Session;
  text: string;
  author: string;
  createdAt: string;
}
export type RecordKind =
  | "history"
  | "prescription"
  | "diet"
  | "investigation"
  | "discharge"
  | "program"
  | "accommodation"
  | "estimate";
export interface CareRecord {
  id: string;
  patientId: string;
  kind: RecordKind;
  title: string;
  detail: string;
  date: string;
  status: string;
  quantity: number;
  amount: number;
  session: string;
  createdAt: string;
  prescription?: PrescriptionDetails;
}
export interface DocumentRecord {
  id: string;
  patientId: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
}
export interface InventoryItem {
  id: string;
  name: string;
  stock: number;
  unit: string;
  price: number;
  reorderLevel: number;
}
export interface Bill {
  id: string;
  patientId: string;
  title: string;
  amount: number;
  status: string;
  createdAt: string;
  number: string;
  paidAmount: number;
  balance: number;
  items: BillItem[];
  payments: Payment[];
}
export interface Audit {
  id: string;
  action: string;
  entity: string;
  author: string;
  createdAt: string;
}
export interface Workspace {
  patient: Patient;
  vitals: Vital[];
  assignments: Assignment[];
  notes: Note[];
  records: CareRecord[];
  documents: DocumentRecord[];
  bills: Bill[];
  audit: Audit[];
  estimates: TherapyEstimate[];
  roomStays: RoomStay[];
}
export interface User {
  id: string;
  name: string;
  email: string;
}
export interface BillItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  source: string | null;
}
export interface Payment {
  id: string;
  amount: number;
  method: string;
  reference: string;
  date: string;
  createdAt: string;
}
export interface PrescriptionDetails {
  inventoryId: string;
  dose: string;
  frequency: string;
  days: number;
  instructions: string;
  dispensedQuantity: number;
}
export interface TherapyEstimate {
  id: string;
  patientId: string;
  session: string;
  status: string;
  scheduledAt: string;
  invoiceId: string | null;
  createdAt: string;
  total: number;
  items: {
    id: string;
    therapyId: string;
    name: string;
    days: number;
    unitPrice: number;
    amount: number;
  }[];
}
export interface Room {
  id: string;
  name: string;
  type: string;
  capacity: number;
  rate: number;
  active: boolean;
  occupied: number;
  available: number;
}
export interface RoomStay {
  id: string;
  patientId: string;
  roomId: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  rate: number;
  status: string;
  recordId: string;
}
export interface Physician {
  id: string;
  name: string;
  speciality: string;
  phone: string;
  email: string;
  active: boolean;
}
export interface StockMovement {
  id: string;
  inventoryId: string;
  patientId: string | null;
  delta: number;
  reason: string;
  author: string;
  createdAt: string;
}
export interface Practice {
  name: string;
  tagline: string;
  phone: string;
  address: string;
}
export interface Directory {
  items: Patient[];
  total: number;
  page: number;
  pageSize: number;
}
export interface DashboardData {
  date: string;
  activePatients: number;
  dischargedPatients: number;
  outstanding: number;
  collected: number;
  completed: number;
  scheduled: number;
  lowStock: InventoryItem[];
  queue: (Assignment & { patientName: string })[];
  followUps: Patient[];
  activity: Audit[];
}
