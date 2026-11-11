import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { IncomingMessage, ServerResponse } from "node:http";

type Request = IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> };
type Response = ServerResponse & { status: (code: number) => Response; json: (value: unknown) => void };
type Row = Record<string, any>;

const allowedUpdates: Record<string, { table: string; fields: string[] }> = {
  applications: { table: "doctor_applications", fields: ["status", "review_notes", "reviewed_at", "reviewed_by"] },
  doctors: { table: "verified_doctors", fields: ["is_active", "consultation_fee", "about", "focus_areas", "experience_years", "registration_number"] },
  appointments: { table: "appointments", fields: ["status", "appointment_date", "appointment_time", "consultation_type"] },
  inventory: { table: "shop_products", fields: ["name", "weight", "price", "mrp", "categories", "tags", "description", "active", "sort_order"] },
  orders: { table: "shop_orders", fields: ["status"] },
};

function send(res: Response, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
}

function routeParts(req: Request) {
  const raw = req.query?.path;
  const value = Array.isArray(raw) ? raw.join("/") : raw || "";
  return value.split("/").filter(Boolean);
}

async function readBody(req: Request): Promise<Row> {
  if (req.body && typeof req.body === "object") return req.body as Row;
  let text = "";
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : {};
}

async function requireAdmin(req: Request, admin: SupabaseClient) {
  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) throw Object.assign(new Error("Sign in to continue."), { status: 401 });
  const { data, error } = await admin.auth.getUser(bearer);
  if (error || !data.user) throw Object.assign(new Error("Your session is no longer valid."), { status: 401 });
  const allowedEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const role = data.user.app_metadata?.role;
  const isAdmin = role === "admin" || role === "super_admin" || data.user.app_metadata?.is_admin === true || allowedEmails.includes((data.user.email || "").toLowerCase());
  if (!isAdmin) throw Object.assign(new Error("This account does not have administrator access."), { status: 403 });
  return data.user;
}

async function rows<T = Row[]>(promise: PromiseLike<{ data: any; error: any }>, fallback: T): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return fallback;
    throw error;
  }
  return (data ?? fallback) as T;
}

async function count(admin: SupabaseClient, table: string, apply?: (query: any) => any) {
  let query: any = admin.from(table).select("*", { count: "exact", head: true });
  if (apply) query = apply(query);
  const { count: total, error } = await query;
  if (error && (error.code === "42P01" || error.code === "PGRST205")) return 0;
  if (error) throw error;
  return total || 0;
}

async function overview(admin: SupabaseClient) {
  const [customers, activeDoctors, pendingDoctors, appointments, activeProducts, openOrders, recentAppointments, recentOrders, pendingApplications, payments] = await Promise.all([
    count(admin, "profiles"),
    count(admin, "verified_doctors", (q) => q.eq("is_active", true)),
    count(admin, "doctor_applications", (q) => q.in("status", ["submitted", "under_review"])),
    count(admin, "appointments"),
    count(admin, "shop_products", (q) => q.eq("active", true)),
    count(admin, "shop_orders", (q) => q.in("status", ["placed", "packed", "shipped"])),
    rows(admin.from("appointments").select("*").order("created_at", { ascending: false }).limit(5), []),
    rows(admin.from("shop_orders").select("*").order("created_at", { ascending: false }).limit(5), []),
    rows(admin.from("doctor_applications").select("id,reference_code,full_name,specialisations,status,submitted_at").in("status", ["submitted", "under_review"]).order("submitted_at", { ascending: false }).limit(5), []),
    rows(admin.from("payment_transactions").select("amount_paise,status").eq("status", "paid"), []),
  ]);
  return {
    metrics: {
      customers,
      activeDoctors,
      pendingDoctors,
      appointments,
      activeProducts,
      openOrders,
      revenue: payments.reduce((sum: number, payment: Row) => sum + Number(payment.amount_paise || 0), 0) / 100,
    },
    recentAppointments,
    recentOrders,
    pendingApplications,
  };
}

async function customers(admin: SupabaseClient) {
  const profiles = await rows<Row[]>(admin.from("profiles").select("*").order("created_at", { ascending: false }).limit(500), []);
  const { data: authData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authById = new Map((authData?.users || []).map((user) => [user.id, user]));
  return profiles.map((profile) => {
    const authUser = authById.get(profile.user_id);
    return {
      ...profile,
      email: authUser?.email || null,
      phone: authUser?.phone || null,
      last_sign_in_at: authUser?.last_sign_in_at || null,
      auth_created_at: authUser?.created_at || null,
    };
  });
}

async function getPage(page: string, admin: SupabaseClient, user: Row) {
  if (page === "overview") return overview(admin);
  if (page === "customers") return { customers: await customers(admin) };
  if (page === "doctors") {
    const [applications, doctors] = await Promise.all([
      rows(admin.from("doctor_applications").select("*").order("submitted_at", { ascending: false }).limit(500), []),
      rows(admin.from("verified_doctors").select("*").order("verified_at", { ascending: false }).limit(500), []),
    ]);
    return { applications, doctors };
  }
  if (page === "appointments") return { appointments: await rows(admin.from("appointments").select("*").order("appointment_date", { ascending: false }).limit(500), []) };
  if (page === "inventory") return { products: await rows(admin.from("shop_products").select("*").order("sort_order").limit(1000), []) };
  if (page === "orders") return { orders: await rows(admin.from("shop_orders").select("*,shop_order_items(*)").order("created_at", { ascending: false }).limit(500), []) };
  if (page === "settings") {
    return {
      admin: { email: user.email, id: user.id, role: user.app_metadata?.role || "allowlisted admin" },
      database: { host: new URL(process.env.SUPABASE_URL!).hostname, connected: true },
      environment: { vercel: Boolean(process.env.VERCEL), region: process.env.VERCEL_REGION || "local" },
    };
  }
  throw Object.assign(new Error("Unknown admin resource."), { status: 404 });
}

async function mutate(req: Request, admin: SupabaseClient, user: Row, resource: string, id?: string) {
  const config = allowedUpdates[resource];
  if (!config) throw Object.assign(new Error("This resource cannot be changed here."), { status: 405 });
  const input = await readBody(req);
  if (req.method === "POST" && resource === "inventory") {
    const product = {
      id: String(input.id || input.name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      name: String(input.name || "").trim(),
      weight: String(input.weight || "").trim(),
      price: Number(input.price || 0),
      mrp: Number(input.mrp || input.price || 0),
      categories: Array.isArray(input.categories) ? input.categories : [],
      tags: Array.isArray(input.tags) ? input.tags : [],
      description: String(input.description || "").trim(),
      icon: String(input.name || "A").trim().charAt(0).toUpperCase(),
      active: input.active !== false,
      sort_order: Number(input.sort_order || 999),
    };
    if (!product.id || !product.name || !product.weight) throw Object.assign(new Error("Name and pack size are required."), { status: 400 });
    const { data, error } = await admin.from(config.table).insert(product).select().single();
    if (error) throw error;
    return data;
  }
  if (req.method !== "PATCH" || !id) throw Object.assign(new Error("Unsupported operation."), { status: 405 });
  const update = Object.fromEntries(Object.entries(input).filter(([key]) => config.fields.includes(key)));
  if (!Object.keys(update).length) throw Object.assign(new Error("No supported fields were supplied."), { status: 400 });
  if (resource === "applications") {
    update.reviewed_by = user.id;
    update.reviewed_at = new Date().toISOString();
  }
  const { data, error } = await admin.from(config.table).update(update).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export default async function handler(req: Request, res: Response) {
  try {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return send(res, 503, { error: "Supabase server credentials are not configured." });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const user = await requireAdmin(req, admin);
    const [resource = "overview", id] = routeParts(req);
    if (req.method === "GET") return send(res, 200, await getPage(resource, admin, user));
    if (req.method === "PATCH" || req.method === "POST") return send(res, 200, await mutate(req, admin, user, resource, id));
    return send(res, 405, { error: "Method not allowed." });
  } catch (error: any) {
    console.error("admin-api", error?.code || error?.name, error?.message);
    return send(res, Number(error?.status || 500), { error: error?.message || "Unexpected admin service error." });
  }
}
