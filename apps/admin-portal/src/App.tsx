import { Component, useEffect, useMemo, useState, type ErrorInfo, type FormEvent, type ReactNode } from "react";
import {
  Activity, Boxes, CalendarDays, Check, ChevronDown, CircleDollarSign, ClipboardCheck, Clock3,
  LayoutDashboard, Leaf, LogOut, Menu, Package, RefreshCw, Search, Settings, ShieldCheck,
  ShoppingBag, Stethoscope, UserCheck, Users, X, XCircle,
} from "lucide-react";
import { adminApi, createResource, patchResource } from "./api";
import { hasSupabaseConfig, supabase } from "./supabase";
import type { AdminPayloads, JsonRecord, Overview, Page } from "./types";

const pages: { name: Page; icon: typeof Leaf }[] = [
  { name: "Overview", icon: LayoutDashboard }, { name: "Customers", icon: Users },
  { name: "Doctors", icon: Stethoscope }, { name: "Appointments", icon: CalendarDays },
  { name: "Inventory", icon: Boxes }, { name: "Orders", icon: ShoppingBag },
  { name: "Settings", icon: Settings },
];
const statusTone: Record<string, string> = {
  verified: "green", active: "green", delivered: "green", completed: "green", captured: "green",
  submitted: "amber", under_review: "amber", placed: "amber", packed: "amber", booked: "amber",
  shipped: "blue", cancelled: "red", rejected: "red", inactive: "muted",
};
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const nameOf = (row: JsonRecord) => row.full_name || row.name || row.doctor_name || row.email || "Unlabelled record";

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("admin-ui", error, info.componentStack); }
  render() {
    if (this.state.failed) return <main className="recovery"><span className="brand-mark"><Leaf /></span><h1>Let’s get you back to your workspace.</h1><p>A dashboard view could not be displayed. Your data and session are safe.</p><button className="primary" onClick={() => window.location.reload()}><RefreshCw />Reload admin console</button></main>;
    return this.props.children;
  }
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "compact" : ""}`}><span className="brand-mark"><Leaf size={22} /></span><span><b>ayurnidaan</b><small>ADMIN CONTROL</small></span></div>;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [firstTime, setFirstTime] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const { error } = firstTime
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
    else if (firstTime) setMessage("Check your inbox to confirm the new administrator account, then sign in.");
  }
  return <main className="login-shell">
    <section className="login-story">
      <Brand />
      <div><span className="eyebrow light">THOUGHTFULLY CONNECTED CARE</span><h1>One calm place to run your care ecosystem.</h1><p>Oversee customers, practitioners, consultations and Ayurvedic inventory with clarity.</p></div>
      <div className="login-points"><span><ShieldCheck />Protected admin access</span><span><Activity />Live Supabase data</span><span><Leaf />Rooted in care</span></div>
    </section>
    <section className="login-panel"><div className="login-card"><Brand compact /><span className="eyebrow">ADMINISTRATION</span><h2>Welcome back</h2><p>Sign in with an authorised Ayurnidaan account.</p>
      {!hasSupabaseConfig && <div className="alert error">The public Supabase settings have not been added yet.</div>}
      <form onSubmit={submit}><label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@ayurnidaan.com" required /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} /></label>{message && <div className={`alert ${message.startsWith("Check") ? "success" : "error"}`}>{message}</div>}<button className="primary wide" disabled={busy || !hasSupabaseConfig}>{busy ? "Please wait…" : firstTime ? "Create administrator account" : "Sign in securely"}</button></form>
      <button className="login-switch" onClick={() => { setFirstTime(!firstTime); setMessage(""); }}>{firstTime ? "Already registered? Sign in" : "First time here? Register the approved admin email"}</button>
      <small className="privacy"><ShieldCheck size={14} /> Access is logged and restricted to approved administrators.</small>
    </div></section>
  </main>;
}

function Pill({ value }: { value: string }) { const normalized = String(value || "unknown").toLowerCase(); return <span className={`pill ${statusTone[normalized] || "muted"}`}>{normalized.replaceAll("_", " ")}</span>; }
function Initials({ name }: { name: string }) { return <span className="avatar">{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "A"}</span>; }
function Empty({ text }: { text: string }) { return <div className="empty"><Leaf /><b>Nothing to review</b><span>{text}</span></div>; }
function Panel({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) { return <section className={`panel ${className}`}><header className="panel-head"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</header>{children}</section>; }

function Metric({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: typeof Leaf; tone: string }) {
  return <div className="metric"><span className={`metric-icon ${tone}`}><Icon size={20} /></span><div><span>{label}</span><strong>{value}</strong></div><span className="metric-trend">Live</span></div>;
}

function OverviewPage({ data, go }: { data: Overview; go: (page: Page) => void }) {
  const m = data.metrics;
  return <>
    <div className="hero-card"><div><span className="eyebrow light">CARE ECOSYSTEM</span><h2>Everything important, in one view.</h2><p>Monitor the health of Ayurnidaan’s customer and doctor experiences.</p></div><div className="hero-orbit"><Leaf /><span>{m.pendingDoctors}<small>reviews</small></span></div></div>
    <div className="metric-grid"><Metric label="Customers" value={m.customers} icon={Users} tone="sage" /><Metric label="Active doctors" value={m.activeDoctors} icon={Stethoscope} tone="mint" /><Metric label="Pending reviews" value={m.pendingDoctors} icon={ClipboardCheck} tone="gold" /><Metric label="Open orders" value={m.openOrders} icon={Package} tone="peach" /><Metric label="Active products" value={m.activeProducts} icon={Boxes} tone="blue" /><Metric label="Captured revenue" value={money(m.revenue)} icon={CircleDollarSign} tone="green" /></div>
    <div className="two-col">
      <Panel title="Doctor applications" subtitle="Applications requiring attention" action={<button className="text-button" onClick={() => go("Doctors")}>View all →</button>}><div className="list">{data.pendingApplications.length ? data.pendingApplications.map((row) => <div className="list-row" key={row.id}><Initials name={row.full_name} /><div className="grow"><b>{row.full_name}</b><span>{row.reference_code} · {(row.specialisations || []).join(", ")}</span></div><Pill value={row.status} /></div>) : <Empty text="New doctor applications will appear here." />}</div></Panel>
      <Panel title="Recent orders" subtitle="Latest customer purchases" action={<button className="text-button" onClick={() => go("Orders")}>Manage →</button>}><div className="list">{data.recentOrders.length ? data.recentOrders.map((row) => <div className="list-row" key={row.id}><span className="soft-icon"><ShoppingBag /></span><div className="grow"><b>Order {String(row.id).slice(0, 8).toUpperCase()}</b><span>{formatDate(row.created_at)} · {money(row.total_amount || 0)}</span></div><Pill value={row.status} /></div>) : <Empty text="New orders will appear here." />}</div></Panel>
    </div>
    <Panel title="Upcoming consultations" subtitle="Recently booked appointments" action={<button className="text-button" onClick={() => go("Appointments")}>Open calendar →</button>}><div className="appointment-strip">{data.recentAppointments.length ? data.recentAppointments.map((row) => <article key={row.id}><span className="date-tile"><b>{new Date(row.appointment_date).getDate()}</b><small>{new Date(row.appointment_date).toLocaleString("en-IN", { month: "short" })}</small></span><div><b>{row.doctor_name}</b><span>{row.appointment_time} · {row.consultation_type}</span></div><Pill value={row.status} /></article>) : <Empty text="Appointments booked in the customer app will appear here." />}</div></Panel>
  </>;
}

function CustomersPage({ rows, query }: { rows: JsonRecord[]; query: string }) {
  const filtered = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
  return <Panel title="Customer directory" subtitle={`${filtered.length} customer profiles`}><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Profile</th><th>Contact</th><th>Last active</th><th>Joined</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.user_id}><td><div className="person"><Initials name={nameOf(row)} /><span><b>{nameOf(row)}</b><small>{String(row.user_id).slice(0, 8)}</small></span></div></td><td>{row.sex || "—"}{row.date_of_birth ? ` · ${formatDate(row.date_of_birth)}` : ""}</td><td><b className="regular">{row.email || "No email"}</b><small>{row.phone || ""}</small></td><td>{formatDate(row.last_sign_in_at)}</td><td>{formatDate(row.created_at)}</td></tr>)}</tbody></table>{!filtered.length && <Empty text="No customers match your search." />}</div></Panel>;
}

function DoctorsPage({ data, mutate, busy }: { data: AdminPayloads["Doctors"]; mutate: (resource: string, id: string, values: JsonRecord) => void; busy: string }) {
  const pendingApplications = data.applications.filter((application) => ["submitted", "under_review"].includes(application.status));
  return <div className="stack">
    <Panel title="Application review" subtitle={`${pendingApplications.length} awaiting a decision`}><div className="review-grid">{pendingApplications.length ? pendingApplications.map((row) => <article className="review-card" key={row.id}><div className="review-top"><Initials name={row.full_name} /><div className="grow"><h4>{row.full_name}</h4><span>{row.reference_code} · Age {row.age}</span></div><Pill value={row.status} /></div><div className="specialities">{(row.specialisations || []).map((item: string) => <span key={item}>{item}</span>)}</div><p>Submitted {formatDate(row.submitted_at)}</p>{row.review_notes && <p className="note">{row.review_notes}</p>}<div className="review-actions"><button className="ghost danger" disabled={busy === row.id} onClick={() => mutate("applications", row.id, { status: "rejected", review_notes: "Application did not meet verification requirements." })}><XCircle />Reject</button><button className="primary" disabled={busy === row.id} onClick={() => mutate("applications", row.id, { status: "verified", review_notes: "Documents verified by administration." })}><UserCheck />Verify doctor</button></div></article>) : <Empty text="There are no doctor applications awaiting review." />}</div></Panel>
    <Panel title="Verified doctors" subtitle="Control practitioner availability"><div className="table-wrap"><table><thead><tr><th>Doctor</th><th>Specialisation</th><th>Experience</th><th>Fee</th><th>Visibility</th></tr></thead><tbody>{data.doctors.map((row) => <tr key={row.id}><td><div className="person"><Initials name={row.full_name} /><span><b>{row.full_name}</b><small>{row.qualification || "Ayurvedic practitioner"}</small></span></div></td><td>{(row.specialisations || []).join(", ") || "—"}</td><td>{row.experience_years == null ? "—" : `${row.experience_years} years`}</td><td>{row.consultation_fee == null ? "—" : money(row.consultation_fee)}</td><td><button className={`toggle ${row.is_active ? "on" : ""}`} aria-label="Toggle doctor visibility" onClick={() => mutate("doctors", row.id, { is_active: !row.is_active })}><span /></button></td></tr>)}</tbody></table></div></Panel>
  </div>;
}

function AppointmentsPage({ rows, mutate, busy }: { rows: JsonRecord[]; mutate: (resource: string, id: string, values: JsonRecord) => void; busy: string }) {
  return <Panel title="Appointments" subtitle="Bookings from the customer app"><div className="table-wrap"><table><thead><tr><th>Date & time</th><th>Doctor</th><th>Customer ID</th><th>Consultation</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><b>{formatDate(row.appointment_date)}</b><small>{row.appointment_time}</small></td><td><div className="person"><Initials name={row.doctor_name} /><span><b>{row.doctor_name}</b><small>{row.doctor_initials}</small></span></div></td><td className="mono">{String(row.user_id).slice(0, 8)}</td><td>{row.consultation_type}</td><td><select className="status-select" value={row.status} disabled={busy === row.id} onChange={(e) => mutate("appointments", row.id, { status: e.target.value })}><option value="booked">Booked</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></td></tr>)}</tbody></table>{!rows.length && <Empty text="Customer bookings will appear here." />}</div></Panel>;
}

function InventoryPage({ rows, mutate, busy, create }: { rows: JsonRecord[]; mutate: (resource: string, id: string, values: JsonRecord) => void; busy: string; create: (values: JsonRecord) => void }) {
  const [open, setOpen] = useState(false); const [form, setForm] = useState({ name: "", weight: "", price: "", mrp: "", category: "" });
  function submit(e: FormEvent) { e.preventDefault(); create({ name: form.name, weight: form.weight, price: Number(form.price), mrp: Number(form.mrp), categories: form.category ? [form.category] : [], active: true }); setOpen(false); setForm({ name: "", weight: "", price: "", mrp: "", category: "" }); }
  return <><Panel title="Store inventory" subtitle={`${rows.filter((r) => r.active).length} active products`} action={<button className="primary" onClick={() => setOpen(true)}><Package />Add product</button>}><div className="product-grid">{rows.map((row) => <article className={`product-card ${!row.active ? "inactive" : ""}`} key={row.id}><div className="product-visual"><span>{row.icon || row.name?.[0]}</span><Leaf /></div><div className="product-copy"><div><h4>{row.name}</h4><span>{row.weight}</span></div><Pill value={row.active ? "active" : "inactive"} /></div><p>{(row.categories || []).join(", ") || "Ayurvedic wellness"}</p><div className="product-bottom"><strong>{money(row.price || 0)}</strong><button className={`toggle ${row.active ? "on" : ""}`} disabled={busy === row.id} onClick={() => mutate("inventory", row.id, { active: !row.active })}><span /></button></div></article>)}</div></Panel>{open && <div className="modal-backdrop" onMouseDown={() => setOpen(false)}><form className="modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}><header><div><span className="eyebrow">CATALOGUE</span><h3>Add a product</h3></div><button type="button" className="icon-button" onClick={() => setOpen(false)}><X /></button></header><label>Product name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><div className="field-row"><label>Pack size<input value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} placeholder="60 tablets" required /></label><label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Immunity" /></label></div><div className="field-row"><label>Selling price<input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} min="0" required /></label><label>MRP<input type="number" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} min="0" required /></label></div><button className="primary wide">Add to catalogue</button></form></div>}</>;
}

function OrdersPage({ rows, mutate, busy }: { rows: JsonRecord[]; mutate: (resource: string, id: string, values: JsonRecord) => void; busy: string }) {
  return <Panel title="Order fulfilment" subtitle={`${rows.length} customer orders`}><div className="table-wrap"><table><thead><tr><th>Order</th><th>Placed</th><th>Items</th><th>Value</th><th>Postcode</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><b>#{String(row.id).slice(0, 8).toUpperCase()}</b><small className="mono">{String(row.user_id).slice(0, 8)}</small></td><td>{formatDate(row.created_at)}</td><td>{(row.shop_order_items || []).reduce((sum: number, item: JsonRecord) => sum + Number(item.quantity || 0), 0)}</td><td><b>{money(row.total_amount || 0)}</b></td><td>{row.delivery_postcode || "—"}</td><td><select className="status-select" value={row.status} disabled={busy === row.id} onChange={(e) => mutate("orders", row.id, { status: e.target.value })}>{["placed", "packed", "shipped", "delivered", "cancelled"].map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></td></tr>)}</tbody></table>{!rows.length && <Empty text="Customer orders will appear here." />}</div></Panel>;
}

function SettingsPage({ data }: { data: AdminPayloads["Settings"] }) { return <div className="settings-grid"><Panel title="Administrator" subtitle="Current authenticated operator"><div className="setting-row"><Initials name={data.admin.email || "Admin"} /><div><b>{data.admin.email}</b><span>{data.admin.role}</span></div><Pill value="verified" /></div></Panel><Panel title="Database" subtitle="Secure server connection"><div className="setting-row"><span className="soft-icon"><Activity /></span><div><b>{data.database.host}</b><span>Supabase service connection</span></div><Pill value={data.database.connected ? "active" : "inactive"} /></div></Panel><Panel title="Hosting" subtitle="Production runtime"><div className="setting-row"><span className="soft-icon"><ShieldCheck /></span><div><b>{data.environment.vercel ? "Vercel production" : "Local preview"}</b><span>Region: {data.environment.region}</span></div><Pill value="active" /></div></Panel><Panel title="Access policy" subtitle="How admin access is granted"><div className="policy"><ShieldCheck /><p>Only a Supabase user with an <b>admin</b> app role or an email listed in the server’s <b>ADMIN_EMAILS</b> setting can use this console.</p></div></Panel></div>; }

export function App() {
  const [session, setSession] = useState<any>(null), [page, setPage] = useState<Page>("Overview"), [data, setData] = useState<any>(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [query, setQuery] = useState(""), [menu, setMenu] = useState(false), [busy, setBusy] = useState("");
  useEffect(() => { supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); }); return supabase.auth.onAuthStateChange((_event, value) => setSession(value)).data.subscription.unsubscribe; }, []);
  async function load(target = page) { setLoading(true); setError(""); setData(null); try { setData(await adminApi(target.toLowerCase())); } catch (e: any) { setError(e.message); } finally { setLoading(false); } }
  useEffect(() => { if (session) load(page); }, [page, session]);
  async function mutate(resource: string, id: string, values: JsonRecord) { setBusy(id); setError(""); try { await patchResource(resource, id, values); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(""); } }
  async function create(values: JsonRecord) { setBusy("create"); try { await createResource("inventory", values); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(""); } }
  const title = useMemo(() => page === "Overview" ? "Good morning, Admin" : page, [page]);
  if (!session && !loading) return <Login />;
  if (!session) return <div className="boot"><Leaf /><span>Preparing your workspace…</span></div>;
  function navigate(next: Page) { setPage(next); setMenu(false); setQuery(""); }
  return <div className="app-shell">
    <aside className={`sidebar ${menu ? "open" : ""}`}><Brand /><button className="org-card"><span className="soft-icon"><Leaf /></span><span><b>Ayurnidaan</b><small>Care ecosystem</small></span><ChevronDown /></button><span className="nav-label">MANAGEMENT</span><nav>{pages.map(({ name, icon: Icon }) => <button key={name} className={page === name ? "active" : ""} onClick={() => navigate(name)}><Icon />{name}{name === "Doctors" && data?.metrics?.pendingDoctors ? <em>{data.metrics.pendingDoctors}</em> : null}</button>)}</nav><div className="sidebar-foot"><div className="care-note"><Leaf /><b>Rooted in care</b><p>Every decision supports a healthier journey.</p></div><button className="logout" onClick={() => supabase.auth.signOut()}><LogOut />Sign out</button></div></aside>
    {menu && <button className="scrim" aria-label="Close menu" onClick={() => setMenu(false)} />}
    <main className="main"><header className="topbar"><button className="menu-button" onClick={() => setMenu(true)}><Menu /></button><div className="crumb"><span>Administration</span><b>›</b><span>{page}</span></div><div className="global-search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${page.toLowerCase()}…`} /></div><button className="icon-button" onClick={() => load()} aria-label="Refresh"><RefreshCw /></button><div className="operator"><Initials name={session.user.email || "Admin"} /><span><b>Administrator</b><small>{session.user.email}</small></span></div></header>
      <div className="content"><div className="page-title"><div><span className="eyebrow">AYURNIDAAN CONTROL</span><h1>{title}</h1><p>{page === "Overview" ? "Here’s what’s happening across your care ecosystem today." : `Manage ${page.toLowerCase()} across the customer and doctor experience.`}</p></div><button className="secondary" onClick={() => load()}><RefreshCw />Refresh data</button></div>{error && <div className="alert error"><XCircle />{error}<button className="text-button" onClick={() => load()}>Try again</button></div>}{loading ? <div className="skeleton-grid">{Array.from({ length: 6 }).map((_, i) => <span key={i} />)}</div> : data && <>{page === "Overview" && <OverviewPage data={data} go={navigate} />}{page === "Customers" && <CustomersPage rows={data.customers ?? []} query={query} />}{page === "Doctors" && <DoctorsPage data={{ applications: data.applications ?? [], doctors: data.doctors ?? [] }} mutate={mutate} busy={busy} />}{page === "Appointments" && <AppointmentsPage rows={data.appointments ?? []} mutate={mutate} busy={busy} />}{page === "Inventory" && <InventoryPage rows={data.products ?? []} mutate={mutate} busy={busy} create={create} />}{page === "Orders" && <OrdersPage rows={data.orders ?? []} mutate={mutate} busy={busy} />}{page === "Settings" && <SettingsPage data={data} />}</>}</div>
      <footer><span><Leaf /> Thoughtful care. Connected.</span><span>Protected admin workspace · <b>Live with Supabase</b></span></footer>
    </main>
  </div>;
}
