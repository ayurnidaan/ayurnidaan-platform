import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  FileText,
  FlaskConical,
  Heart,
  History,
  LayoutGrid,
  Leaf,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Package,
  Plus,
  Printer,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  Sun,
  Sunrise,
  Trash2,
  Upload,
  Users,
  Wallet,
  X,
  LoaderCircle,
  Pencil,
  Utensils,
  CheckCircle2,
} from "lucide-react";
import { api, send, setCsrf } from "./api";
import {
  Brand,
  Button,
  DataForm,
  Empty,
  Modal,
  Pill,
  type Field,
} from "./components";
import type {
  Assignment,
  CareRecord,
  InventoryItem,
  Patient,
  RecordKind,
  Session,
  Therapy,
  User,
  Vital,
  Workspace,
  Note,
  Practice,
} from "../shared/types";
import { BillingPanel, EstimatesPanel } from "./finance";
import {
  PatientDirectory,
  Dashboard,
  StockPanel,
  TherapyCatalog,
  RoomsPanel,
  RoomAssignmentForm,
  RoomHistory,
  PhysiciansPanel,
  PrescriptionForm,
  PrescriptionList,
  DischargePanel,
  VitalsTrends,
  SettingsPanel,
} from "./operations";
import { patientInput, printCareRecord } from "./workflow-utils";
const sessions: Session[] = ["Morning", "Noon", "Evening"];
const displayDate = (v: string, short = false) =>
  v
    ? new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: short ? "short" : "long",
        ...(!short ? { year: "numeric" } : {}),
      })
    : "Not set";
const money = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v);
const isoToday = () => new Date().toLocaleDateString("en-CA");
function dateRange(from: string, to: string) {
  const result: string[] = [];
  for (
    let d = new Date(`${from}T12:00:00Z`);
    d <= new Date(`${to}T12:00:00Z`) && result.length < 366;
    d.setUTCDate(d.getUTCDate() + 1)
  )
    result.push(d.toISOString().slice(0, 10));
  return result;
}
const tabs = [
  ["basic", "Basic detail", Users],
  ["accommodation", "Accommodation", BedDouble],
  ["history", "IPD history", History],
  ["prescription", "Prescription", ClipboardList],
  ["therapy", "Therapy", Leaf],
  ["diet", "Diet", Utensils],
  ["investigation", "Investigation", FlaskConical],
  ["documents", "Documents", FileText],
  ["discharge", "Discharge summary", ArrowRight],
  ["program", "Daily program", CalendarDays],
  ["vitals", "Vital data", Activity],
] as const;
const patientFields: Field[] = [
  { key: "name", label: "Patient name", required: true },
  {
    key: "age",
    label: "Age",
    type: "number",
    min: 0,
    max: 130,
    required: true,
  },
  { key: "gender", label: "Gender", options: ["Female", "Male", "Other"] },
  { key: "phone", label: "Phone number" },
  {
    key: "admissionDate",
    label: "Admission date",
    type: "date",
    required: true,
  },
  {
    key: "dischargeDate",
    label: "Discharge date",
    type: "date",
    required: true,
  },
  { key: "nextVisit", label: "Next visit", type: "date" },
  { key: "physician", label: "Attending physician", required: true },
  { key: "room", label: "Room / bed" },
  {
    key: "bloodGroup",
    label: "Blood group",
    options: ["Unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
  },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "allergies", label: "Allergies" },
  { key: "address", label: "Address", type: "textarea", full: true },
];
const vitalFields: Field[] = [
  { key: "date", label: "Observation date", type: "date", required: true },
  { key: "session", label: "Session", options: sessions },
  { key: "time", label: "Time (24 hour)", type: "time", required: true },
  {
    key: "temperature",
    label: "Temperature · °C",
    type: "number",
    min: 25,
    max: 45,
  },
  { key: "bp", label: "Blood pressure · mmHg", placeholder: "120/80" },
  { key: "pulse", label: "Pulse · bpm", type: "number", min: 1, max: 300 },
  {
    key: "rr",
    label: "Respiratory rate · /min",
    type: "number",
    min: 1,
    max: 100,
  },
  { key: "spo2", label: "SpO₂ · %", type: "number", min: 0, max: 100 },
  { key: "height", label: "Height · cm", type: "number", min: 20, max: 300 },
  { key: "weight", label: "Weight · kg", type: "number", min: 0.1, max: 600 },
  {
    key: "painScore",
    label: "Pain score · 0–10",
    type: "number",
    min: 0,
    max: 10,
  },
  {
    key: "fbs",
    label: "Fasting glucose · mg/dL",
    type: "number",
    min: 1,
    max: 1500,
  },
  {
    key: "ppbs",
    label: "Post-meal glucose · mg/dL",
    type: "number",
    min: 1,
    max: 1500,
  },
  {
    key: "rbs",
    label: "Random glucose · mg/dL",
    type: "number",
    min: 1,
    max: 1500,
  },
  {
    key: "sleep",
    label: "Sleep",
    options: ["", "Regular", "Disturbed", "Reduced"],
  },
  {
    key: "bowel",
    label: "Bowel",
    options: ["", "Regular", "Constipation", "Loose stools"],
  },
  {
    key: "appetite",
    label: "Appetite",
    options: ["", "Normal", "Reduced", "Increased"],
  },
];
type Dialog = {
  type: string;
  date?: string;
  session?: Session;
  record?: CareRecord;
  item?: InventoryItem;
  data?: unknown;
};

export function App() {
  const initial = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const [practice, setPractice] = useState<Practice>({
    name: "Healthier India",
    tagline: "Ayurveda & wellness",
    phone: "",
    address: "",
  });
  const [selectedDate, setSelectedDate] = useState(initial.get("date") ?? "");
  const [saving, setSaving] = useState(0),
    [lastSync, setLastSync] = useState(""),
    [syncError, setSyncError] = useState(false);
  const [recordSearch, setRecordSearch] = useState(""),
    [recordStatus, setRecordStatus] = useState("All");
  const pending = useRef(new Set<string>());

  const [user, setUser] = useState<User | null>(null),
    [checking, setChecking] = useState(true),
    [ws, setWs] = useState<Workspace | null>(null),
    [patients, setPatients] = useState<Patient[]>([]),
    [catalog, setCatalog] = useState<Therapy[]>([]),
    [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [patientId, setPatientId] = useState(initial.get("patient") ?? ""),
    [tab, setTab] = useState(initial.get("tab") ?? "therapy"),
    [page, setPage] = useState(initial.get("page") ?? "IPD"),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [sideOpen, setSideOpen] = useState(false),
    [view, setView] = useState("all"),
    [offset, setOffset] = useState(0),
    [loading, setLoading] = useState(false);
  const currentPatient = useRef(patientId);
  currentPatient.current = patientId;
  useEffect(() => {
    if (!patientId || !user) return;
    const query = new URLSearchParams({
      patient: patientId,
      page,
      tab,
      ...(selectedDate ? { date: selectedDate } : {}),
    });
    window.history.replaceState(null, "", "?" + query);
  }, [patientId, page, tab, selectedDate, user]);
  const close = useCallback(() => setDialog(null), []);
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    api<{ user: User; csrf: string }>("/auth/me")
      .then((r) => {
        setCsrf(r.csrf);
        setUser(r.user);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
    const expired = () => {
      setUser(null);
      setWs(null);
      setCsrf("");
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  const loadLists = useCallback(async () => {
    const [p, t, i, info] = await Promise.all([
      api<Patient[]>("/patients"),
      api<Therapy[]>("/therapies"),
      api<InventoryItem[]>("/inventory"),
      api<Practice>("/practice"),
    ]);
    setPatients(p);
    setCatalog(t);
    setInventory(i);
    setPractice(info);
    setPatientId((current) => current || p[0]?.id || "");
  }, []);
  const reload = useCallback(async () => {
    if (!patientId) return;
    const result = await api<Workspace>(`/patients/${patientId}/workspace`);
    if (currentPatient.current === patientId) {
      setWs(result);
      setSyncError(false);
      setLastSync(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    }
  }, [patientId]);
  const refreshAll = useCallback(async () => {
    const results = await Promise.allSettled([reload(), loadLists()]);
    if (results.some((r) => r.status === "rejected")) {
      setSyncError(true);
      setError(
        "Changes were saved, but the latest workspace could not be loaded. Refresh to reconnect.",
      );
    }
  }, [reload, loadLists]);
  useEffect(() => {
    if (user) loadLists().catch((e) => setError(e.message));
  }, [user, loadLists]);
  useEffect(() => {
    if (!user || !patientId) return;
    setLoading(true);
    setWs(null);
    reload()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    setOffset(0);
  }, [user, patientId, reload]);
  useEffect(() => {
    if (!user || !patientId) return;
    const sync = () => {
      if (!document.hidden) reload().catch(() => setSyncError(true));
    };
    const timer = setInterval(sync, 30000);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", sync);
    };
  }, [user, patientId, reload]);
  async function mutate(
    path: string,
    method: string,
    data?: unknown,
    message = "Changes saved",
  ) {
    const key = method + path;
    if (pending.current.has(key)) return;
    pending.current.add(key);
    setSaving((v) => v + 1);
    try {
      await api(path, send(method, data));
      await refreshAll();
      notify(message);
    } finally {
      pending.current.delete(key);
      setSaving((v) => v - 1);
    }
  }
  async function action(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const p = ws?.patient;
  const dates = useMemo(
    () => (p ? dateRange(p.admissionDate, p.dischargeDate) : []),
    [p?.admissionDate, p?.dischargeDate],
  );
  const latestObservation = ws?.vitals.find((v) =>
    dates.includes(v.date),
  )?.date;
  const referenceDate = dates.includes(selectedDate)
    ? selectedDate
    : dates.includes(isoToday())
      ? isoToday()
      : (latestObservation ?? dates[0] ?? isoToday());
  useEffect(() => {
    if (p && dates.includes(referenceDate))
      setOffset(Math.floor(dates.indexOf(referenceDate) / 7) * 7);
  }, [patientId, referenceDate]);
  const vitals = useMemo(() => {
    if (!ws) return [];
    if (ws.patient.vitalsMode === "three_session")
      return ws.vitals.filter((v) => v.session !== "Daily");
    return Object.values(
      ws.vitals.reduce<Record<string, Vital>>((acc, v) => {
        if (!acc[v.date] || v.session === "Daily") acc[v.date] = v;
        return acc;
      }, {}),
    );
  }, [ws]);
  const filteredPatients = patients.filter((v) =>
    `${v.name} ${v.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  if (checking)
    return (
      <div className="splash">
        <Brand />
        <LoaderCircle className="spin" />
      </div>
    );
  if (!user)
    return (
      <Login
        onLogin={(u, token) => {
          setUser(u);
          setCsrf(token);
        }}
      />
    );
  const path = `/patients/${patientId}`;
  const visibleDates = dates.slice(offset, offset + 7);
  const recordKind = tab as RecordKind;
  const records = (
    ws?.records.filter(
      (r) =>
        r.kind === recordKind &&
        (tab !== "program" || r.date === referenceDate) &&
        (recordStatus === "All" || r.status === recordStatus) &&
        (r.title + " " + r.detail)
          .toLowerCase()
          .includes(recordSearch.toLowerCase()),
    ) ?? []
  ).sort((a, b) =>
    tab === "program" ? a.session.localeCompare(b.session) : 0,
  );
  const selectedTab = tabs.find((t) => t[0] === tab);
  const todayAssignments =
    ws?.assignments.filter((a) => a.date === referenceDate) ?? [];
  const summaryDate = displayDate(referenceDate, true);

  function openVital(date: string, session: Session = "Morning") {
    setDialog({ type: "vital", date, session });
  }
  function renderProgress(date: string) {
    const entries = vitals.filter((v) => v.date === date);
    if (!entries.length)
      return (
        <button className="add-vitals" onClick={() => openVital(date)}>
          <Activity size={14} /> Record vitals
        </button>
      );
    return (
      <div className="progress-stack">
        {entries.map((v) => (
          <button
            key={v.id}
            className="vital-preview"
            onClick={() =>
              openVital(date, v.session === "Daily" ? "Morning" : v.session)
            }
          >
            <span>
              <i className="status-dot" />
              {p?.vitalsMode === "legacy" ? "Daily" : v.session}
              <small>{v.time}</small>
            </span>
            <strong>
              {v.bp || "—"} <em>mmHg</em>
            </strong>
            <div>
              {v.temperature ?? "—"}°C <b>·</b> {v.spo2 ?? "—"}% SpO₂{" "}
              {v.pulse ? `· ${v.pulse} bpm` : ""}
            </div>
          </button>
        ))}
      </div>
    );
  }
  function renderSession(date: string, session: Session) {
    const assignments = ws!.assignments.filter(
      (a) =>
        a.date === date && a.session === session && a.status !== "Cancelled",
    );
    const notes = ws!.notes.filter(
      (n) => n.date === date && n.session === session,
    );
    return (
      <div className="session-cell">
        <div className="therapy-items">
          {assignments.map((a) => (
            <div
              className={`therapy-item ${a.status === "Completed" ? "completed" : ""}`}
              key={a.id}
            >
              <button
                className="therapy-check"
                title={
                  a.status === "Completed"
                    ? "Mark as scheduled"
                    : "Mark completed"
                }
                aria-label={`${a.status === "Completed" ? "Reopen" : "Complete"} ${a.name} on ${date} ${session}`}
                onClick={() =>
                  action(() =>
                    mutate(
                      `${path}/assignments/${a.id}`,
                      "PATCH",
                      {
                        status:
                          a.status === "Completed" ? "Scheduled" : "Completed",
                      },
                      "Therapy updated",
                    ),
                  )
                }
              >
                {a.status === "Completed" ? <Check size={10} /> : <span />}
              </button>
              <button
                className="therapy-name"
                onClick={() => setDialog({ type: "schedule", date, session })}
              >
                {a.name}
                <small>{a.duration} min</small>
              </button>
              <button
                className="therapy-remove"
                aria-label={`Remove ${a.name} on ${date} ${session}`}
                onClick={() =>
                  setDialog({
                    type: "confirm",
                    data: { path: `${path}/assignments/${a.id}`, name: a.name },
                  })
                }
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="cell-actions">
          <button
            className="text-button"
            onClick={() => setDialog({ type: "schedule", date, session })}
          >
            <Plus size={12} />
            {assignments.length ? "Add" : "Assign therapy"}
          </button>
          <button
            className={`note-button ${notes.length ? "has-note" : ""}`}
            aria-label={`Notes for ${date} ${session}`}
            onClick={() => setDialog({ type: "note", date, session })}
          >
            <MessageCircle size={14} />
            {notes.length || ""}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${sideOpen ? "open" : ""}`}>
        <Brand />
        <div className="hospital-switch">
          <span className="hospital-icon">
            <Stethoscope size={20} />
          </span>
          <div>
            <strong>{practice.name}</strong>
            <small>{practice.tagline}</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <button
          className="sidebar-link physicians-link"
          onClick={() => setDialog({ type: "physicians" })}
        >
          <Stethoscope size={17} /> Physicians <ChevronDown size={13} />
        </button>
        <span className="nav-caption">WORKSPACE</span>
        <nav>
          {[
            ["Overview", LayoutGrid],
            ["Patients", Users],
            ["IPD", BedDouble],
            ["Pharmacy bill", ClipboardList],
            ["Inventory", Package],
            ["Therapy catalog", Leaf],
            ["Rooms & beds", BedDouble],
            ["Settings", Settings2],
            ["Account", Wallet],
          ].map(([name, Icon]) => {
            const NavIcon = Icon as typeof Users;
            return (
              <button
                key={String(name)}
                className={page === name ? "active" : ""}
                onClick={() => {
                  setPage(String(name));
                  setSideOpen(false);
                  setSearch("");
                }}
              >
                <NavIcon size={19} />
                <span>{String(name)}</span>
                {name === "IPD" && (
                  <span className="nav-count">
                    {patients.length.toString().padStart(2, "0")}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="care-card">
            <div className="care-art">
              <img src="/images/clay-botanical.png" alt="" />
            </div>
            <span className="eyebrow">ROOTED IN CARE</span>
            <p>
              A little more balance.
              <br />A little better, every day.
            </p>
            <span className="gold-rule" />
          </div>
          <button
            className="sidebar-link"
            onClick={() => setDialog({ type: "help" })}
          >
            <CircleHelp size={18} /> Help & support <ArrowRight size={14} />
          </button>
          <div className="secure-label">
            <ShieldCheck size={13} /> Your care data stays private
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setSideOpen(!sideOpen)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />{" "}
            <strong>{page === "IPD" ? "Inpatient care" : page}</strong>
          </div>
          <div className="topbar-actions">
            <div className="global-search">
              <Search size={16} />
              <input
                aria-label="Search patients"
                placeholder="Find a patient…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (e.target.value) setPage("Patients");
                }}
              />
              <kbd>⌕</kbd>
            </div>
            <button
              className="notification-button icon-button"
              aria-label="View notifications"
              onClick={() => setDialog({ type: "notifications" })}
            >
              <Bell size={18} />
              <i />
            </button>
            <span className="top-divider" />
            <button
              className="user-profile"
              onClick={() => setDialog({ type: "profile" })}
            >
              <span className="avatar doctor-avatar">
                {user.name
                  .replace("Dr. ", "")
                  .split(" ")
                  .slice(0, 2)
                  .map((s) => s[0])
                  .join("")}
              </span>
              <span>
                <strong>{user.name}</strong>
                <small>Attending physician</small>
              </span>
              <ChevronDown size={14} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "IPD"
                  ? "A THOUGHTFULLY CONNECTED CARE JOURNEY"
                  : "YOUR DAILY CARE WORKSPACE"}
              </div>
              <h1>
                {page === "IPD"
                  ? "Patient workspace"
                  : page === "Overview"
                    ? "A good day for better care."
                    : page === "Pharmacy bill"
                      ? "Patient billing"
                      : page}
              </h1>
              <p>
                {page === "IPD"
                  ? "Every detail, every session. All in one place."
                  : "A clear view of the things that matter."}
              </p>
            </div>
            <div className="heading-actions">
              <span className="date-label">
                <CalendarDays size={15} />
                {new Date().toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <Button
                kind="light"
                onClick={() => setDialog({ type: "newPatient" })}
              >
                <Plus size={16} /> New patient
              </Button>
            </div>
          </div>
          {error && (
            <div className="page-error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Patients" && (
            <PatientDirectory
              search={search}
              onSearch={setSearch}
              onSelect={(id) => {
                setPatientId(id);
                setPage("IPD");
                setSearch("");
                setSelectedDate("");
              }}
            />
          )}
          {page === "Inventory" && (
            <StockPanel inventory={inventory} onSaved={refreshAll} />
          )}
          {page === "Therapy catalog" && (
            <TherapyCatalog onSaved={refreshAll} />
          )}
          {page === "Rooms & beds" && <RoomsPanel />}
          {page === "Settings" && (
            <SettingsPanel
              user={user}
              practice={practice}
              onUser={setUser}
              onPractice={setPractice}
            />
          )}
          {page === "Overview" && (
            <Dashboard
              onOpen={(id, nextTab = "therapy", date) => {
                setPatientId(id);
                setPage("IPD");
                setTab(nextTab);
                setSelectedDate(date ?? "");
              }}
              onInventory={() => setPage("Inventory")}
            />
          )}
          {loading && ["IPD", "Account", "Pharmacy bill"].includes(page) && (
            <div className="loading">
              <LoaderCircle className="spin" /> Loading care record…
            </div>
          )}
          {!p &&
            !loading &&
            ["IPD", "Account", "Pharmacy bill"].includes(page) && (
              <Empty
                title="A new care journey starts here"
                detail="Admit your first patient to open the workspace."
              >
                <Button onClick={() => setDialog({ type: "newPatient" })}>
                  <Plus size={16} /> Admit patient
                </Button>
              </Empty>
            )}
          {p && ws && ["IPD", "Account", "Pharmacy bill"].includes(page) && (
            <>
              <div className="workspace-context">
                <label>
                  Current patient
                  <select
                    aria-label="Current patient"
                    value={patientId}
                    onChange={(e) => {
                      setPatientId(e.target.value);
                      setSelectedDate("");
                      setRecordSearch("");
                      setRecordStatus("All");
                    }}
                  >
                    {!patients.some((item) => item.id === p.id) && (
                      <option value={p.id}>{p.name}</option>
                    )}
                    {patients.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name} · #{item.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Care date
                  <input
                    type="date"
                    aria-label="Care date"
                    min={p.admissionDate}
                    max={p.dischargeDate}
                    value={referenceDate}
                    onChange={(e) => {
                      if (e.target.value) setSelectedDate(e.target.value);
                    }}
                  />
                </label>
                <Button kind="small ghost" onClick={() => setPage("Patients")}>
                  Browse patients <ArrowRight size={13} />
                </Button>
                <a
                  className="button small ghost"
                  href={`/api/patients/${p.id}/export`}
                >
                  <ArrowDownToLine size={14} /> Export case
                </a>
                <span
                  className={`sync-state ${syncError ? "offline" : ""}`}
                  role="status"
                >
                  {saving
                    ? "Saving…"
                    : syncError
                      ? "Connection needs attention"
                      : `Synced ${lastSync}`}
                </span>
              </div>
              <section className="patient-banner">
                <div className="patient-identity">
                  <span className="avatar patient-avatar">
                    {p.name
                      .split(" ")
                      .slice(0, 2)
                      .map((s) => s[0])
                      .join("")}
                    <span>
                      <Leaf size={10} />
                    </span>
                  </span>
                  <div>
                    <div className="patient-title">
                      <h2>{p.name}</h2>
                      <Pill tone="banner-pill">IPD #{p.id.slice(0, 8)}</Pill>
                      <Pill tone="banner-pill">{p.status}</Pill>
                    </div>
                    <p>
                      {p.age} years <i /> {p.gender} <i />{" "}
                      <span>{p.bloodGroup}</span>
                      <i /> {p.room}
                    </p>
                    <span className="diagnosis-label">
                      <span className="status-dot" />
                      {p.diagnosis || "Diagnosis pending"}
                    </span>
                  </div>
                </div>
                <div className="patient-dates">
                  <div>
                    <span>ADMITTED</span>
                    <strong>
                      {displayDate(p.admissionDate, true)},{" "}
                      {p.admissionDate.slice(0, 4)}
                    </strong>
                  </div>
                  <div>
                    <span>DISCHARGE</span>
                    <strong>
                      {displayDate(p.dischargeDate, true)},{" "}
                      {p.dischargeDate.slice(0, 4)}
                    </strong>
                  </div>
                  <div>
                    <span>NEXT VISIT</span>
                    <strong>{displayDate(p.nextVisit, true)}</strong>
                  </div>
                </div>
                <button
                  className={`favourite-button ${p.favourite ? "is-fav" : ""}`}
                  aria-label={
                    p.favourite ? "Remove favourite" : "Mark as favourite"
                  }
                  onClick={() =>
                    action(() =>
                      mutate(
                        path,
                        "PUT",
                        patientPayload(p, { favourite: !p.favourite }),
                        p.favourite
                          ? "Favourite removed"
                          : "Patient marked as favourite",
                      ),
                    )
                  }
                >
                  <Star
                    size={18}
                    fill={p.favourite ? "currentColor" : "none"}
                  />
                </button>
              </section>
              {page === "IPD" && (
                <>
                  <div className="stats">
                    <Stat
                      icon={<CalendarDays />}
                      label="Care journey"
                      value={`Day ${Math.max(1, dates.indexOf(referenceDate) + 1)}`}
                      detail={`of ${dates.length} days · Inpatient care`}
                      tone="sage"
                    />
                    <Stat
                      icon={<Leaf />}
                      label="Therapies on plan"
                      value={String(todayAssignments.length).padStart(2, "0")}
                      detail={`${summaryDate} · ${todayAssignments.filter((a) => a.status === "Completed").length} completed`}
                      tone="gold"
                    />
                    <Stat
                      icon={<Activity />}
                      label="Session vitals"
                      value={`${vitals.filter((v) => v.date === referenceDate).length} / ${p.vitalsMode === "legacy" ? 1 : 3}`}
                      detail={`${summaryDate} · observations recorded`}
                      tone="rose"
                    />
                    <Stat
                      icon={<Stethoscope />}
                      label="Attending physician"
                      value={p.physician.replace("Dr. ", "")}
                      detail="Your dedicated care partner"
                      tone="sage"
                    />
                  </div>
                  <div className="tabs-wrap">
                    <div
                      className="tabs"
                      role="tablist"
                      aria-label="Patient record sections"
                    >
                      {tabs.map(([key, label, Icon]) => (
                        <button
                          key={key}
                          id={`tab-${key}`}
                          role="tab"
                          aria-selected={tab === key}
                          aria-controls="patient-tab-panel"
                          className={tab === key ? "active" : ""}
                          onClick={() => {
                            setTab(key);
                            setView("all");
                            setRecordSearch("");
                            setRecordStatus("All");
                          }}
                        >
                          <Icon size={15} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <section
                    className="panel main-panel"
                    id="patient-tab-panel"
                    role="tabpanel"
                    aria-labelledby={`tab-${tab}`}
                  >
                    <div className="panel-heading">
                      <div>
                        <div className="section-title">
                          <span className="section-icon">
                            {tab === "therapy" ? (
                              <Leaf size={20} />
                            ) : tab === "vitals" ? (
                              <Activity size={20} />
                            ) : (
                              <FileText size={20} />
                            )}
                          </span>
                          <h2>
                            {tab === "therapy"
                              ? "Therapy & daily progress"
                              : tab === "vitals"
                                ? "Vital observations"
                                : selectedTab?.[1]}
                          </h2>
                          {tab === "therapy" && (
                            <span className="count-label">
                              {dates.length} days
                            </span>
                          )}
                        </div>
                        <p>
                          {tab === "therapy"
                            ? "A little progress, every day. Manage sessions and track wellbeing."
                            : tab === "vitals"
                              ? "A connected view of every recorded observation."
                              : "Keep every part of the care journey together."}
                        </p>
                      </div>
                      <div className="panel-actions">
                        <Button
                          kind="ghost small"
                          onClick={() => window.print()}
                        >
                          <Printer size={15} /> Print
                        </Button>
                        {tab === "therapy" ? (
                          <>
                            <Button
                              kind="outline small"
                              disabled={p.status === "Discharged"}
                              onClick={() => setDialog({ type: "estimate" })}
                            >
                              <FileText size={14} /> Create estimate
                            </Button>
                            <Button
                              kind="small"
                              disabled={p.status === "Discharged"}
                              onClick={() =>
                                setDialog({
                                  type: "schedule",
                                  date: referenceDate,
                                  session: "Morning",
                                })
                              }
                            >
                              <Plus size={15} /> Schedule therapy
                            </Button>
                          </>
                        ) : tab === "vitals" ? (
                          <Button
                            kind="small"
                            onClick={() => openVital(referenceDate)}
                          >
                            <Plus size={15} /> Record vitals
                          </Button>
                        ) : tab === "documents" ? (
                          <label className="button small">
                            <Upload size={15} /> Upload document
                            <input
                              className="visually-hidden"
                              aria-label="Upload document"
                              type="file"
                              accept="application/pdf,image/png,image/jpeg"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                action(async () => {
                                  const body = new FormData();
                                  body.append("file", file);
                                  await api(`${path}/documents`, {
                                    method: "POST",
                                    body,
                                  });
                                  await reload();
                                  notify("Document uploaded");
                                });
                                e.target.value = "";
                              }}
                            />
                          </label>
                        ) : tab === "accommodation" ? (
                          <Button
                            kind="small"
                            disabled={p.status === "Discharged"}
                            onClick={() => setDialog({ type: "room" })}
                          >
                            <BedDouble size={14} />
                            {ws.roomStays.some((s) => s.status === "Active")
                              ? "Transfer room"
                              : "Assign room"}
                          </Button>
                        ) : tab === "discharge" ? null : tab === "basic" ? (
                          <Button
                            kind="small"
                            onClick={() => setDialog({ type: "editPatient" })}
                          >
                            <Pencil size={14} /> Edit details
                          </Button>
                        ) : (
                          <Button
                            kind="small"
                            onClick={() =>
                              setDialog({
                                type:
                                  tab === "prescription"
                                    ? "prescription"
                                    : "record",
                              })
                            }
                          >
                            <Plus size={15} /> Add{" "}
                            {tab === "prescription" ? "medicine" : "record"}
                          </Button>
                        )}
                      </div>
                    </div>
                    {tab === "therapy" && (
                      <>
                        <div className="table-toolbar">
                          <div className="toolbar-left">
                            <span className="period-icon">
                              <CalendarDays size={16} />
                            </span>
                            <strong>
                              {displayDate(
                                dates[offset] ?? p.admissionDate,
                                true,
                              )}{" "}
                              –{" "}
                              {displayDate(
                                visibleDates.at(-1) ?? p.dischargeDate,
                                true,
                              )}{" "}
                              {p.admissionDate.slice(0, 4)}
                            </strong>
                            <button
                              className="icon-button compact"
                              aria-label="Previous week"
                              disabled={offset === 0}
                              onClick={() => setOffset(Math.max(0, offset - 7))}
                            >
                              <ChevronLeft size={16} />
                            </button>
                            <button
                              className="icon-button compact"
                              aria-label="Next week"
                              disabled={offset + 7 >= dates.length}
                              onClick={() => setOffset(offset + 7)}
                            >
                              <ChevronRight size={16} />
                            </button>
                            <select
                              aria-label="Filter therapy sessions"
                              className="view-select"
                              value={view}
                              onChange={(e) => setView(e.target.value)}
                            >
                              <option value="all">All sessions</option>
                              {sessions.map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                          <div className="mode-control">
                            <span>Vitals view</span>
                            <div className="segmented">
                              {[
                                ["legacy", "Daily"],
                                ["three_session", "3 sessions"],
                              ].map(([mode, label]) => (
                                <button
                                  key={mode}
                                  className={
                                    p.vitalsMode === mode ? "active" : ""
                                  }
                                  onClick={() =>
                                    action(() =>
                                      mutate(
                                        path,
                                        "PUT",
                                        patientPayload(p, { vitalsMode: mode }),
                                        "Vitals view updated",
                                      ),
                                    )
                                  }
                                >
                                  {mode === "three_session" && (
                                    <LayoutGrid size={12} />
                                  )}{" "}
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="table-scroll">
                          <table className="therapy-table">
                            <thead>
                              <tr>
                                <th>
                                  Date <span>CARE DAY</span>
                                </th>
                                <th>
                                  <Activity size={14} /> Daily progress{" "}
                                  <span>VITAL OBSERVATIONS</span>
                                </th>
                                {sessions
                                  .filter((s) => view === "all" || view === s)
                                  .map((session, i) => {
                                    const Icon = [Sunrise, Sun, Moon][
                                      sessions.indexOf(session)
                                    ];
                                    return (
                                      <th key={session}>
                                        <span
                                          className={`session-heading session-${i}`}
                                        >
                                          <Icon size={17} />
                                          {session}
                                        </span>
                                        <span>
                                          {session === "Morning"
                                            ? "06:00 — 12:00"
                                            : session === "Noon"
                                              ? "12:00 — 16:00"
                                              : "16:00 — 21:00"}
                                        </span>
                                      </th>
                                    );
                                  })}
                              </tr>
                            </thead>
                            <tbody>
                              {visibleDates.map((date) => (
                                <tr
                                  key={date}
                                  className={
                                    date === referenceDate
                                      ? "highlight-row"
                                      : ""
                                  }
                                >
                                  <td
                                    className="date-cell"
                                    onClick={() => setSelectedDate(date)}
                                  >
                                    <button
                                      className="date-select"
                                      aria-label={`Select care date ${date}`}
                                      onClick={() => setSelectedDate(date)}
                                    >
                                      <span className="date-number">
                                        {date.slice(8)}
                                      </span>
                                      <strong>
                                        {new Date(
                                          `${date}T12:00:00`,
                                        ).toLocaleDateString("en-GB", {
                                          weekday: "short",
                                        })}
                                      </strong>
                                      <small>
                                        Day {dates.indexOf(date) + 1}
                                      </small>
                                      {date === referenceDate && (
                                        <span className="current-day">
                                          Selected
                                        </span>
                                      )}
                                    </button>
                                  </td>
                                  <td className="progress-cell">
                                    {renderProgress(date)}
                                  </td>
                                  {sessions
                                    .filter((s) => view === "all" || view === s)
                                    .map((s) => (
                                      <td key={s}>{renderSession(date, s)}</td>
                                    ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="table-footer">
                          <span>
                            <i className="status-dot" /> Connected to the
                            patient’s vital chart
                          </span>
                          <div>
                            <span className="legend-dot completed-dot" />
                            Completed
                            <span className="legend-dot" />
                            Scheduled
                          </div>
                          <span>
                            Showing {offset + 1}–
                            {Math.min(offset + 7, dates.length)} of{" "}
                            {dates.length} days
                          </span>
                        </div>
                        {ws.records.some((r) => r.kind === "estimate") && (
                          <div className="estimates-summary">
                            <FileText size={17} />
                            <div>
                              <strong>Saved therapy estimates</strong>
                              <p>
                                {
                                  ws.records.filter(
                                    (r) => r.kind === "estimate",
                                  ).length
                                }{" "}
                                line items ·{" "}
                                {money(
                                  ws.records
                                    .filter((r) => r.kind === "estimate")
                                    .reduce((sum, r) => sum + r.amount, 0),
                                )}{" "}
                                estimated total
                              </p>
                            </div>
                            <Button
                              kind="small ghost"
                              onClick={() => setDialog({ type: "estimates" })}
                            >
                              View estimates <ArrowRight size={14} />
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                    {tab === "vitals" && (
                      <>
                        <VitalsTrends vitals={vitals} patientId={p.id} />
                        {vitals.length ? (
                          <div className="table-scroll">
                            <table className="data-table vital-data">
                              <thead>
                                <tr>
                                  {[
                                    "Date / session",
                                    "Time",
                                    "Height (cm)",
                                    "Weight (kg)",
                                    "Temp (°C)",
                                    "Pulse (bpm)",
                                    "BP (mmHg)",
                                    "RR (/min)",
                                    "Pain /10",
                                    "FBS",
                                    "PPBS",
                                    "RBS",
                                    "SpO₂ (%)",
                                    "Sleep",
                                    "Bowel",
                                    "Appetite",
                                    "Actions",
                                  ].map((h) => (
                                    <th key={h}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {vitals.map((v) => (
                                  <tr key={v.id}>
                                    <td>
                                      <strong>
                                        {displayDate(v.date, true)}
                                      </strong>
                                      <small>
                                        {p.vitalsMode === "legacy"
                                          ? "Daily"
                                          : v.session}
                                      </small>
                                    </td>
                                    <td>{v.time}</td>
                                    {[
                                      "height",
                                      "weight",
                                      "temperature",
                                      "pulse",
                                      "bp",
                                      "rr",
                                      "painScore",
                                      "fbs",
                                      "ppbs",
                                      "rbs",
                                      "spo2",
                                      "sleep",
                                      "bowel",
                                      "appetite",
                                    ].map((k) => (
                                      <td key={k}>
                                        {String(v[k as keyof Vital] ?? "—") ||
                                          "—"}
                                      </td>
                                    ))}
                                    <td>
                                      <div className="inline-actions">
                                        <button
                                          className="icon-button"
                                          aria-label={`Edit vital ${v.date} ${v.session}`}
                                          onClick={() =>
                                            openVital(
                                              v.date,
                                              v.session === "Daily"
                                                ? "Morning"
                                                : v.session,
                                            )
                                          }
                                        >
                                          <Pencil size={14} />
                                        </button>
                                        <button
                                          className="icon-button danger"
                                          aria-label={`Delete vital ${v.date} ${v.session}`}
                                          onClick={() =>
                                            setDialog({
                                              type: "confirm",
                                              data: {
                                                path: `${path}/vitals/${v.id}`,
                                                name: "this vital observation",
                                              },
                                            })
                                          }
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <Empty
                            title="Every observation matters"
                            detail="Record vitals from a therapy session or add an observation here."
                          />
                        )}
                        <div className="table-footer">
                          Temperature is recorded in Celsius. Glucose
                          measurements are in mg/dL. Changes sync with Therapy.
                        </div>
                      </>
                    )}
                    {tab === "basic" && (
                      <div className="details-grid">
                        {[
                          ["Patient name", p.name],
                          ["Case ID", p.id],
                          ["Age / gender", `${p.age} years · ${p.gender}`],
                          ["Contact", p.phone || "Not recorded"],
                          ["Address", p.address || "Not recorded"],
                          ["Blood group", p.bloodGroup],
                          ["Admission", displayDate(p.admissionDate)],
                          ["Discharge", displayDate(p.dischargeDate)],
                          ["Next visit", displayDate(p.nextVisit)],
                          ["Physician", p.physician],
                          ["Diagnosis", p.diagnosis || "Pending"],
                          ["Allergies", p.allergies],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <span>{label}</span>
                            <strong>{value}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                    {tab === "documents" && (
                      <div className="records-area">
                        <p className="helper-text">
                          PDF, PNG or JPEG · Up to 10 MB per file · Downloads
                          require sign-in
                        </p>
                        {ws.documents.length ? (
                          ws.documents.map((d) => (
                            <div className="document-row" key={d.id}>
                              <span className="record-icon">
                                <FileText size={22} />
                              </span>
                              <div>
                                <strong>{d.name}</strong>
                                <small>
                                  {(d.size / 1024).toFixed(1)} KB ·{" "}
                                  {displayDate(d.createdAt, true)}
                                </small>
                              </div>
                              <a
                                className="icon-button"
                                href={`/api${path}/documents/${d.id}`}
                                aria-label={`Download ${d.name}`}
                              >
                                <ArrowDownToLine size={17} />
                              </a>
                              <button
                                className="icon-button danger"
                                aria-label={`Delete ${d.name}`}
                                onClick={() =>
                                  setDialog({
                                    type: "confirm",
                                    data: {
                                      path: `${path}/documents/${d.id}`,
                                      name: d.name,
                                    },
                                  })
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))
                        ) : (
                          <Empty
                            title="A home for every care document"
                            detail="Upload reports, referral letters, or patient documents."
                          />
                        )}
                      </div>
                    )}
                    {tab === "prescription" && (
                      <PrescriptionList
                        ws={ws}
                        inventory={inventory}
                        onSaved={refreshAll}
                        onEdit={(record) =>
                          setDialog({ type: "prescription", record })
                        }
                      />
                    )}
                    {tab === "accommodation" && <RoomHistory ws={ws} />}
                    {tab === "discharge" && (
                      <DischargePanel
                        ws={ws}
                        practice={practice}
                        onSaved={refreshAll}
                      />
                    )}
                    {["history", "diet", "investigation", "program"].includes(
                      tab,
                    ) && (
                      <>
                        <div className="record-filters">
                          <div className="input-with-icon">
                            <Search size={14} />
                            <input
                              aria-label="Search care records"
                              placeholder="Search records"
                              value={recordSearch}
                              onChange={(e) => setRecordSearch(e.target.value)}
                            />
                          </div>
                          <select
                            aria-label="Care record status"
                            value={recordStatus}
                            onChange={(e) => setRecordStatus(e.target.value)}
                          >
                            {[
                              "All",
                              "Active",
                              "Pending",
                              "Scheduled",
                              "Completed",
                              "Recorded",
                              "Cancelled",
                            ].map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                          {tab === "program" && (
                            <span>{displayDate(referenceDate)}</span>
                          )}
                        </div>
                        <div className="records-area">
                          {records.length ? (
                            records.map((r) => (
                              <RecordCard
                                key={r.id}
                                record={r}
                                onPrint={() => printCareRecord(r, p, practice)}
                                onComplete={
                                  ["program", "investigation", "diet"].includes(
                                    r.kind,
                                  ) && r.status !== "Completed"
                                    ? () =>
                                        action(() =>
                                          mutate(
                                            `${path}/records/${r.id}/status`,
                                            "PATCH",
                                            { status: "Completed" },
                                            "Care task completed",
                                          ),
                                        )
                                    : undefined
                                }
                                onEdit={() =>
                                  setDialog({ type: "record", record: r })
                                }
                                onDelete={() =>
                                  setDialog({
                                    type: "confirm",
                                    data: {
                                      path: `${path}/records/${r.id}`,
                                      name: r.title,
                                    },
                                  })
                                }
                              />
                            ))
                          ) : (
                            <Empty
                              title={
                                tab === "discharge"
                                  ? "A thoughtful handover"
                                  : "Ready for the next detail"
                              }
                              detail={
                                tab === "discharge"
                                  ? "Add a discharge summary, follow-up instructions, and the final care plan."
                                  : "Add a record to keep this part of the patient’s journey up to date."
                              }
                            />
                          )}
                        </div>
                      </>
                    )}
                  </section>
                  <div className="care-footer">
                    <span>
                      <Leaf size={13} /> Thoughtful care. Connected.
                    </span>
                    <span>
                      {practice.name} <b>·</b> Patient #{p.id.slice(0, 8)}{" "}
                      <b>·</b> <span className="status-dot" />{" "}
                      {saving
                        ? "Saving…"
                        : syncError
                          ? "Reconnect to see the latest changes"
                          : `Synced with server at ${lastSync}`}
                    </span>
                  </div>
                </>
              )}
              {["Account", "Pharmacy bill"].includes(page) && (
                <BillingPanel
                  ws={ws}
                  practice={practice}
                  onSaved={refreshAll}
                />
              )}
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {dialog && (
        <Modal
          title={dialogTitle(dialog)}
          subtitle={
            dialog.type === "vital"
              ? `${p?.name} · Explicit units for every observation`
              : undefined
          }
          onClose={close}
          wide={["schedule", "vital", "editPatient", "newPatient"].includes(
            dialog.type,
          )}
        >
          {dialog.type === "vital" && p && (
            <VitalEditor
              initialDate={dialog.date!}
              initialSession={dialog.session ?? "Morning"}
              vitals={vitals}
              mode={p.vitalsMode}
              onCancel={close}
              onSave={async (data) => {
                setSelectedDate(String(data.date));
                await mutate(
                  `${path}/vitals`,
                  "POST",
                  data,
                  "Vital observation saved",
                );
                close();
              }}
            />
          )}
          {dialog.type === "schedule" && p && (
            <ScheduleForm
              catalog={catalog}
              dates={dates}
              date={dialog.date ?? referenceDate}
              session={dialog.session ?? "Morning"}
              onSave={async (data) => {
                await mutate(
                  `${path}/assignments`,
                  "POST",
                  data,
                  "Therapies scheduled",
                );
                close();
              }}
            />
          )}
          {dialog.type === "estimate" && (
            <EstimateForm
              catalog={catalog}
              onSave={async (data) => {
                await mutate(
                  `${path}/estimates`,
                  "POST",
                  data,
                  "Therapy estimate saved",
                );
                close();
              }}
            />
          )}
          {dialog.type === "estimates" && ws && (
            <EstimatesPanel
              ws={ws}
              onSaved={refreshAll}
              onScheduled={(date) => {
                setSelectedDate(date);
                setTab("therapy");
                close();
              }}
            />
          )}
          {dialog.type === "prescription" && ws && (
            <PrescriptionForm
              record={dialog.record}
              inventory={inventory}
              patientId={patientId}
              date={referenceDate}
              onSaved={refreshAll}
              onClose={close}
            />
          )}
          {dialog.type === "room" && ws && (
            <RoomAssignmentForm ws={ws} onSaved={refreshAll} onClose={close} />
          )}
          {dialog.type === "note" && (
            <>
              <div className="notes-list">
                {ws?.notes
                  .filter(
                    (n) =>
                      n.date === dialog.date && n.session === dialog.session,
                  )
                  .map((n) => (
                    <article key={n.id}>
                      <p>{n.text}</p>
                      <Button
                        kind="small ghost"
                        onClick={() =>
                          setDialog({
                            type: "editNote",
                            date: dialog.date,
                            session: dialog.session,
                            data: n,
                          })
                        }
                      >
                        <Pencil size={12} /> Edit note
                      </Button>
                      <small>
                        {n.author} ·{" "}
                        {new Date(n.createdAt).toLocaleString("en-GB")}
                      </small>
                    </article>
                  ))}
              </div>
              <DataForm
                fields={[
                  {
                    key: "text",
                    label: `${displayDate(dialog.date!)} · ${dialog.session} session note`,
                    type: "textarea",
                    required: true,
                    full: true,
                  },
                ]}
                submitLabel="Save note"
                onCancel={close}
                onSubmit={async (data) => {
                  await mutate(
                    `${path}/notes`,
                    "POST",
                    { ...data, date: dialog.date, session: dialog.session },
                    "Session note saved",
                  );
                  close();
                }}
              />
            </>
          )}
          {dialog.type === "editNote" && (
            <DataForm
              fields={[
                {
                  key: "text",
                  label: "Corrected session note",
                  type: "textarea",
                  required: true,
                  full: true,
                },
              ]}
              initial={{ text: (dialog.data as Note).text }}
              submitLabel="Save correction"
              onCancel={() =>
                setDialog({
                  type: "note",
                  date: dialog.date,
                  session: dialog.session,
                })
              }
              onSubmit={async (data) => {
                await mutate(
                  `${path}/notes/${(dialog.data as Note).id}`,
                  "PATCH",
                  data,
                  "Session note corrected",
                );
                setDialog({
                  type: "note",
                  date: dialog.date,
                  session: dialog.session,
                });
              }}
            />
          )}
          {["newPatient", "editPatient"].includes(dialog.type) && (
            <DataForm
              fields={patientFields.filter((f) => f.key !== "room")}
              initial={
                dialog.type === "editPatient"
                  ? { ...p }
                  : {
                      age: 30,
                      admissionDate: isoToday(),
                      dischargeDate: isoToday(),
                      physician: user.name,
                      bloodGroup: "Unknown",
                      allergies: "None reported",
                    }
              }
              submitLabel={
                dialog.type === "newPatient"
                  ? "Admit patient"
                  : "Save patient details"
              }
              onCancel={close}
              onSubmit={async (data) => {
                if (dialog.type === "editPatient") {
                  await mutate(path, "PUT", {
                    ...data,
                    room: p!.room,
                    favourite: p!.favourite,
                    vitalsMode: p!.vitalsMode,
                  });
                } else {
                  const created = await api<Patient>(
                    "/patients",
                    send("POST", data),
                  );
                  await loadLists();
                  setPatientId(created.id);
                  setPage("IPD");
                  setTab("basic");
                  notify("Patient admitted");
                }
                close();
              }}
            />
          )}
          {dialog.type === "record" && (
            <DataForm
              fields={recordFields(dialog.record?.kind ?? recordKind)}
              initial={
                dialog.record
                  ? { ...dialog.record }
                  : {
                      date: referenceDate,
                      status:
                        tab === "discharge"
                          ? "Draft"
                          : tab === "investigation"
                            ? "Pending"
                            : "Active",
                      quantity: 1,
                      amount: 0,
                    }
              }
              onCancel={close}
              submitLabel="Save care record"
              onSubmit={async (data) => {
                await mutate(
                  `${path}/records${dialog.record ? `/${dialog.record.id}` : ""}`,
                  dialog.record ? "PUT" : "POST",
                  { ...data, kind: dialog.record?.kind ?? recordKind },
                );
                close();
              }}
            />
          )}
          {dialog.type === "confirm" && (
            <ConfirmDelete
              data={dialog.data as { path: string; name: string }}
              onCancel={close}
              onDelete={async (target) => {
                await mutate(target, "DELETE", undefined, "Record deleted");
                close();
              }}
            />
          )}
          {dialog.type === "notifications" && (
            <div className="activity-feed">
              {ws?.audit.length ? (
                ws.audit.map((a) => (
                  <article key={a.id}>
                    <span className="record-icon">
                      <Activity size={16} />
                    </span>
                    <div>
                      <strong>{a.action}</strong>
                      <p>{a.entity}</p>
                      <small>
                        {a.author} ·{" "}
                        {new Date(a.createdAt).toLocaleString("en-GB")}
                      </small>
                    </div>
                  </article>
                ))
              ) : (
                <Empty
                  title="You’re up to date"
                  detail="Care updates will appear here as your team records them."
                />
              )}
            </div>
          )}
          {dialog.type === "profile" && (
            <div className="profile-panel">
              <span className="avatar doctor-avatar large">
                <Stethoscope size={30} />
              </span>
              <h3>{user.name}</h3>
              <p>{user.email}</p>
              <Pill>Attending physician</Pill>
              <div className="profile-details">
                <ShieldCheck size={18} /> Your session is protected and expires
                after 12 hours.
              </div>
              <Button
                kind="outline"
                onClick={() => {
                  setPage("Settings");
                  close();
                }}
              >
                <Settings2 size={15} /> Edit profile & practice
              </Button>
              <Button
                kind="outline"
                onClick={() =>
                  action(async () => {
                    await api("/auth/logout", send("POST"));
                    setUser(null);
                    setWs(null);
                    setCsrf("");
                    close();
                  })
                }
              >
                <LogOut size={16} /> Sign out
              </Button>
            </div>
          )}
          {dialog.type === "physicians" && (
            <PhysiciansPanel ws={ws} onSaved={refreshAll} />
          )}
          {dialog.type === "help" && (
            <div className="help-content">
              <p>
                <strong>Therapy:</strong> choose a session to schedule
                treatments across multiple dates. Use the circle beside a
                therapy to mark it completed.
              </p>
              <p>
                <strong>Vitals:</strong> record observations in Celsius, cm, kg,
                mmHg and mg/dL. Switch between Daily and 3 sessions without
                deleting past records.
              </p>
              <p>
                <strong>Care records:</strong> manage prescriptions, diet,
                investigations, accommodation, daily programs and discharge
                summaries in the patient tabs.
              </p>
              <p>
                <strong>Documents:</strong> upload PDF, PNG or JPEG files up to
                10 MB. Records persist on the server and sync every 30 seconds.
              </p>
              <p className="helper-text">
                This installation includes the supplied reference case. Review
                sample records before using the workspace for your own practice.
              </p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
function patientPayload(p: Patient, patch: Record<string, unknown> = {}) {
  return patientInput(p, patch);
}
function Stat({
  icon,
  label,
  value,
  detail,
  tone = "",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <article className="stat-card">
      <span className={`stat-icon ${tone}`}>{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}
function RecordCard({
  record: r,
  onEdit,
  onDelete,
  onComplete,
  onPrint,
}: {
  record: CareRecord;
  onEdit?: () => void;
  onDelete: () => void;
  onComplete?: () => void;
  onPrint?: () => void;
}) {
  return (
    <article className="record-card">
      <span className="record-icon">
        {r.kind === "prescription" ? (
          <Package size={21} />
        ) : r.kind === "program" ? (
          <Clock3 size={21} />
        ) : (
          <FileText size={21} />
        )}
      </span>
      <div className="record-body">
        <div>
          <h3>{r.title}</h3>
          <Pill
            tone={
              ["Pending", "Draft", "Scheduled"].includes(r.status) ? "gold" : ""
            }
          >
            {r.status}
          </Pill>
        </div>
        <p>{r.detail || "No additional notes"}</p>
        <small>
          {displayDate(r.date, true)} {r.session && `· ${r.session}`}{" "}
          {r.kind === "prescription" && `· Qty ${r.quantity}`}{" "}
          {r.amount > 0 &&
            `· ${money(r.amount)}${r.kind === "accommodation" ? " / day" : ""}`}
        </small>
      </div>
      <div className="inline-actions">
        {onComplete && (
          <Button kind="small outline" onClick={onComplete}>
            <Check size={13} /> Complete
          </Button>
        )}
        {onPrint && (
          <button
            className="icon-button"
            aria-label={`Print ${r.title}`}
            onClick={onPrint}
          >
            <Printer size={14} />
          </button>
        )}
        {onEdit && (
          <button
            className="icon-button"
            aria-label={`Edit ${r.title}`}
            onClick={onEdit}
          >
            <Pencil size={15} />
          </button>
        )}
        <button
          className="icon-button danger"
          aria-label={`Delete ${r.title}`}
          onClick={onDelete}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}
function recordFields(kind: RecordKind): Field[] {
  const statuses: Record<string, string[]> = {
    history: ["Recorded", "Active"],
    diet: ["Active", "Completed", "Cancelled"],
    investigation: ["Pending", "Completed", "Cancelled"],
    program: ["Scheduled", "Completed", "Cancelled"],
    discharge: ["Draft"],
  };
  return [
    {
      key: "title",
      label:
        kind === "program"
          ? "Activity / appointment"
          : kind === "investigation"
            ? "Investigation / test name"
            : "Title",
      required: true,
      full: true,
    },
    {
      key: "detail",
      label:
        kind === "investigation"
          ? "Result / laboratory notes"
          : kind === "diet"
            ? "Meal plan and dietary instructions"
            : "Details / notes",
      type: "textarea",
      full: true,
    },
    { key: "date", label: "Record date", type: "date", required: true },
    {
      key: "status",
      label: "Status",
      options: statuses[kind] ?? ["Active", "Completed"],
    },
    ...(kind === "program"
      ? [{ key: "session", label: "Time", type: "time", required: true }]
      : []),
  ];
}
function dialogTitle(d: Dialog) {
  return (
    (
      {
        vital: "Record vital observations",
        schedule: "Plan a therapy session",
        estimate: "Create therapy estimate",
        estimates: "Saved estimates",
        note: "Session notes",
        editNote: "Correct a session note",
        newPatient: "Welcome a new patient",
        editPatient: "Patient details",
        record: d.record ? "Edit care record" : "Add care record",
        prescription: d.record ? "Edit prescription" : "Write a prescription",
        room: "Assign or transfer a room",
        inventory: d.item ? "Update inventory" : "Add inventory item",
        bill: "Create a patient bill",
        confirm: "Delete this record?",
        notifications: "Care activity",
        profile: "Your profile",
        physicians: "Physicians",
        help: "A little guidance",
      } as Record<string, string>
    )[d.type] ?? "Patient care"
  );
}
function ConfirmDelete({
  data,
  onCancel,
  onDelete,
}: {
  data: { path: string; name: string };
  onCancel: () => void;
  onDelete: (path: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div>
      <p className="delete-description">
        Delete <strong>{data.name}</strong>? This removes it from the patient
        workspace. The action will remain in the activity log.
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <Button kind="ghost" onClick={onCancel}>
          Keep record
        </Button>
        <Button
          kind="danger-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onDelete(data.path);
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          <Trash2 size={15} />
          {busy ? "Deleting…" : "Delete record"}
        </Button>
      </div>
    </div>
  );
}
function Login({ onLogin }: { onLogin: (user: User, csrf: string) => void }) {
  return (
    <div className="login-page">
      <div className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">ROOTED IN CARE. BUILT AROUND YOU.</span>
          <h1>
            A gentler way
            <br />
            to manage care.
          </h1>
          <p>
            From the first consultation to the last session,
            <br />
            keep every part of your patient’s journey connected.
          </p>
          <img
            src="/images/clay-botanical.png"
            alt="Green clay mortar and pestle with botanical leaves"
          />
        </div>
        <span className="login-caption">
          <Leaf size={15} /> HEALTHIER INDIA · AYURVEDA & WELLNESS
        </span>
      </div>
      <section className="login-form">
        <span className="login-leaf">
          <Leaf size={28} />
        </span>
        <span className="eyebrow">WELCOME TO VAIDYA</span>
        <h2>Good care starts here.</h2>
        <p>Sign in to your practice workspace.</p>
        <DataForm
          fields={[
            {
              key: "email",
              label: "Email address",
              type: "email",
              required: true,
              full: true,
              placeholder: "doctor@vaidya.local",
            },
            {
              key: "password",
              label: "Password",
              type: "password",
              required: true,
              full: true,
            },
          ]}
          submitLabel="Enter workspace"
          onSubmit={async (data) => {
            const r = await api<{ user: User; csrf: string }>(
              "/auth/login",
              send("POST", data),
            );
            onLogin(r.user, r.csrf);
          }}
        />
        <span className="login-security">
          <ShieldCheck size={15} /> A private space for thoughtful care.
        </span>
      </section>
    </div>
  );
}
function ScheduleForm({
  catalog,
  dates,
  date,
  session,
  onSave,
}: {
  catalog: Therapy[];
  dates: string[];
  date: string;
  session: Session;
  onSave: (data: unknown) => Promise<void>;
}) {
  const [selectedDates, setDates] = useState<string[]>([date]),
    [selectedSessions, setSessions] = useState<Session[]>([session]),
    [therapyIds, setTherapies] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("All tariffs"),
    [letter, setLetter] = useState("All"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const toggle = <T,>(items: T[], value: T, set: (next: T[]) => void) =>
    set(
      items.includes(value)
        ? items.filter((x) => x !== value)
        : [...items, value],
    );
  const visible = catalog.filter(
    (t) =>
      (category === "All tariffs" || t.category === category) &&
      (letter === "All" || t.name.toUpperCase().startsWith(letter)) &&
      t.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          !selectedDates.length ||
          !selectedSessions.length ||
          !therapyIds.length
        ) {
          setError("Select at least one date, session, and therapy.");
          return;
        }
        setBusy(true);
        setError("");
        try {
          await onSave({
            dates: selectedDates,
            sessions: selectedSessions,
            therapyIds,
          });
        } catch (e) {
          setError((e as Error).message);
          setBusy(false);
        }
      }}
    >
      <div className="schedule-top">
        <div>
          <span className="field-label">1. Choose care dates</span>
          <div className="calendar-caption">
            <span>
              {displayDate(dates[0], true)} – {displayDate(dates.at(-1)!, true)}
            </span>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setDates(selectedDates.length === dates.length ? [] : dates)
              }
            >
              {selectedDates.length === dates.length ? "Clear" : "Select all"}
            </button>
          </div>
          <div className="calendar-grid">
            {dates.map((d) => (
              <button
                type="button"
                key={d}
                title={displayDate(d)}
                aria-pressed={selectedDates.includes(d)}
                className={selectedDates.includes(d) ? "selected" : ""}
                onClick={() => toggle(selectedDates, d, setDates)}
              >
                {d.slice(8)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="field-label">2. Choose sessions</span>
          <div className="session-options">
            {sessions.map((s, i) => {
              const Icon = [Sunrise, Sun, Moon][i];
              return (
                <button
                  type="button"
                  key={s}
                  aria-pressed={selectedSessions.includes(s)}
                  className={selectedSessions.includes(s) ? "selected" : ""}
                  onClick={() => toggle(selectedSessions, s, setSessions)}
                >
                  <Icon size={17} />
                  {s}
                  {selectedSessions.includes(s) && <Check size={14} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <span className="field-label">
        3. Select therapies <small>{therapyIds.length} selected</small>
      </span>
      <div className="catalog-controls">
        <div className="input-with-icon">
          <Search size={16} />
          <input
            aria-label="Search therapy catalog"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a therapy…"
          />
        </div>
        <select
          aria-label="Tariff category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {["All tariffs", "CGHS", "NON-NABH"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="alphabet">
        {["All", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((l) => (
          <button
            type="button"
            className={l === letter ? "active" : ""}
            onClick={() => setLetter(l)}
            key={l}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="catalog-list">
        {visible.map((t) => (
          <label
            key={t.id}
            className={therapyIds.includes(t.id) ? "selected" : ""}
          >
            <input
              type="checkbox"
              checked={therapyIds.includes(t.id)}
              onChange={() => toggle(therapyIds, t.id, setTherapies)}
            />
            <div>
              <strong>{t.name}</strong>
              <small>
                {t.category} · {t.duration} min
              </small>
            </div>
            <span>{money(t.price)}</span>
          </label>
        ))}
        {!visible.length && (
          <p className="helper-text">No therapies match these filters.</p>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <span className="helper-text">
          {selectedDates.length} dates · {selectedSessions.length} sessions ·{" "}
          {therapyIds.length} therapies
        </span>
        <Button type="submit" disabled={busy}>
          <Plus size={16} />
          {busy ? "Scheduling…" : "Schedule therapies"}
        </Button>
      </div>
    </form>
  );
}
function EstimateForm({
  catalog,
  onSave,
}: {
  catalog: Therapy[];
  onSave: (data: unknown) => Promise<void>;
}) {
  const [items, setItems] = useState<{ therapyId: string; days: number }[]>([]),
    [search, setSearch] = useState(""),
    [session, setSession] = useState("Morning"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const total = items.reduce(
    (sum, i) =>
      sum +
      (catalog.find((t) => t.id === i.therapyId)?.price ?? 0) *
        i.days *
        (session === "All" ? 3 : 1),
    0,
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!items.length) {
          setError("Add at least one therapy.");
          return;
        }
        setBusy(true);
        try {
          await onSave({ session, items });
        } catch (e) {
          setError((e as Error).message);
          setBusy(false);
        }
      }}
    >
      <label className="standalone-label">
        Session
        <select
          aria-label="Estimate session"
          value={session}
          onChange={(e) => setSession(e.target.value)}
        >
          {[...sessions, "All"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <div className="input-with-icon">
        <Search size={16} />
        <input
          aria-label="Search estimate therapies"
          placeholder="Search therapies to add…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="estimate-options">
        {catalog
          .filter(
            (t) =>
              !items.some((i) => i.therapyId === t.id) &&
              t.name.toLowerCase().includes(search.toLowerCase()),
          )
          .map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => {
                setItems([...items, { therapyId: t.id, days: 1 }]);
                setSearch("");
              }}
            >
              <Plus size={14} />
              {t.name}
              <span>{money(t.price)}</span>
            </button>
          ))}
      </div>
      {items.map((item, index) => (
        <div className="estimate-row" key={item.therapyId}>
          <strong>{catalog.find((t) => t.id === item.therapyId)?.name}</strong>
          <label>
            Days
            <input
              type="number"
              aria-label={`Days for ${catalog.find((t) => t.id === item.therapyId)?.name}`}
              min={1}
              max={366}
              step={1}
              required
              value={item.days}
              onChange={(e) =>
                setItems(
                  items.map((v, i) =>
                    i === index ? { ...v, days: Number(e.target.value) } : v,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label="Remove estimate item"
            onClick={() => setItems(items.filter((_, i) => i !== index))}
          >
            <X size={15} />
          </button>
        </div>
      ))}
      <div className="estimate-total">
        <span>Estimated total</span>
        <strong>{money(total)}</strong>
      </div>
      <p className="helper-text">
        {session === "All"
          ? "All sessions multiplies the daily rate by three. "
          : ""}
        An estimate does not create a bill or schedule therapies.
      </p>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <Button type="submit" disabled={busy}>
          <Check size={16} />
          {busy ? "Saving…" : "Save estimate"}
        </Button>
      </div>
    </form>
  );
}

function VitalEditor({
  initialDate,
  initialSession,
  vitals,
  mode,
  onCancel,
  onSave,
}: {
  initialDate: string;
  initialSession: Session;
  vitals: Vital[];
  mode: string;
  onCancel: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [date, setDate] = useState(initialDate),
    [session, setSession] = useState<string>(
      mode === "legacy" ? "Daily" : initialSession,
    );
  const existing = vitals.find(
    (v) => v.date === date && (mode === "legacy" || v.session === session),
  );
  return (
    <DataForm
      key={`${date}-${session}`}
      fields={vitalFields.map((f) =>
        f.key === "session" && mode === "legacy"
          ? { ...f, options: ["Daily"] }
          : f,
      )}
      initial={{
        ...existing,
        date,
        session,
        time: new Date().toTimeString().slice(0, 5),
      }}
      onFieldChange={(key, value) => {
        if (key === "date" && value) setDate(value);
        if (key === "session") setSession(value);
      }}
      submitLabel="Save observation"
      onCancel={onCancel}
      onSubmit={onSave}
    />
  );
}
