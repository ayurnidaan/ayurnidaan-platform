import { useEffect, useState, useCallback, type ReactNode } from "react";
import {
  Plus,
  Pencil,
  Package,
  History,
  Search,
  ArrowRight,
  Check,
  CalendarDays,
  Printer,
  Activity,
  Download,
  RefreshCw,
  BedDouble,
  Stethoscope,
  Settings2,
} from "lucide-react";
import { api, send } from "./api";
import { Button, DataForm, Modal, Empty, Pill, type Field } from "./components";
import type {
  Workspace,
  InventoryItem,
  CareRecord,
  Room,
  Physician,
  Practice,
  User,
  Therapy,
  Directory,
  DashboardData,
  StockMovement,
  Vital,
  Patient,
} from "../shared/types";
import {
  money,
  dateLabel,
  today,
  patientInput,
  printCareRecord,
  downloadCsv,
} from "./workflow-utils";
import type { Refresh } from "./finance";

function useRemote<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);
  return { data, error, loading, reload };
}
function RemoteError({ error, retry }: { error: string; retry: () => void }) {
  return error ? (
    <div className="page-error" role="alert">
      {error}
      <Button kind="small outline" onClick={retry}>
        Try again
      </Button>
    </div>
  ) : null;
}

export function PatientDirectory({
  search,
  onSearch,
  onSelect,
}: {
  search: string;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState(search),
    [status, setStatus] = useState("All"),
    [sort, setSort] = useState("Newest"),
    [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const params = new URLSearchParams({
    search: query,
    status,
    sort,
    page: String(page),
    pageSize: "12",
  });
  const remote = useRemote<Directory>("/patients/directory?" + params);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>
            Patient directory{" "}
            <span className="count-label">{remote.data?.total ?? 0}</span>
          </h2>
          <p>
            Find an active admission, revisit a discharged case, or open a
            favourite.
          </p>
        </div>
        <a
          className="button small outline"
          href={"/api/patients/directory.csv?" + params}
        >
          <Download size={14} /> Export directory
        </a>
      </div>
      <div className="directory-toolbar">
        <div className="input-with-icon">
          <Search size={16} />
          <input
            aria-label="Filter patient directory"
            placeholder="Name, case ID or phone"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Patient status filter"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {["All", "Admitted", "Discharged", "Favourites"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label="Sort patients"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          {["Newest", "Name", "Admission"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </div>
      <RemoteError error={remote.error} retry={remote.reload} />
      {remote.loading ? (
        <p className="inline-loading" role="status">
          Loading patients…
        </p>
      ) : remote.data?.items.length ? (
        <div className="patient-list">
          {remote.data.items.map((p) => (
            <button key={p.id} onClick={() => onSelect(p.id)}>
              <span className="avatar">
                {p.name
                  .split(" ")
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join("")}
              </span>
              <div>
                <strong>{p.name}</strong>
                <small>
                  {p.age} years · {p.gender} · {p.phone || "No phone recorded"}
                </small>
              </div>
              <Pill tone={p.status === "Discharged" ? "gold" : ""}>
                {p.status}
              </Pill>
              <small>
                {dateLabel(p.admissionDate)}
                <br />
                {p.room}
              </small>
              <ArrowRight size={18} />
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="No patients found"
          detail="Try another name or change the status filter."
        />
      )}
      {remote.data && remote.data.total > 12 && (
        <div className="pagination">
          <Button
            kind="small outline"
            disabled={remote.data.page <= 1}
            onClick={() => setPage((v) => v - 1)}
          >
            Previous
          </Button>
          <span>
            Page {remote.data.page} of {Math.ceil(remote.data.total / 12)}
          </span>
          <Button
            kind="small outline"
            disabled={remote.data.page * 12 >= remote.data.total}
            onClick={() => setPage((v) => v + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </section>
  );
}
export function Dashboard({
  onOpen,
  onInventory,
}: {
  onOpen: (id: string, tab?: string, date?: string) => void;
  onInventory: () => void;
}) {
  const [date, setDate] = useState(today());
  const remote = useRemote<DashboardData>("/dashboard?date=" + date);
  const d = remote.data;
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Your daily care desk</h2>
            <p>
              Current admissions, scheduled sessions, follow-ups and pharmacy
              needs.
            </p>
          </div>
          <div className="dashboard-controls">
            <input
              aria-label="Dashboard date"
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
            />
            <Button kind="small ghost" onClick={remote.reload}>
              <RefreshCw size={14} /> Refresh
            </Button>
          </div>
        </div>
        <RemoteError error={remote.error} retry={remote.reload} />
        {d && (
          <>
            <div className="finance-stats dashboard-stats">
              <div>
                <span>Active admissions</span>
                <strong>{d.activePatients}</strong>
              </div>
              <div>
                <span>Sessions on this date</span>
                <strong>{d.scheduled + d.completed}</strong>
                <small>
                  {d.completed} completed · {d.scheduled} scheduled
                </small>
              </div>
              <div>
                <span>Outstanding balance</span>
                <strong>{money(d.outstanding)}</strong>
                <small>{money(d.collected)} received on this date</small>
              </div>
            </div>
            <div className="dashboard-columns">
              <div>
                <h3 className="subheading">Therapy work queue</h3>
                {d.queue.length ? (
                  d.queue.map((a) => (
                    <button
                      className="queue-row"
                      key={a.id}
                      onClick={() => onOpen(a.patientId, "therapy", a.date)}
                    >
                      <span className="record-icon">
                        <Activity size={17} />
                      </span>
                      <div>
                        <strong>{a.patientName}</strong>
                        <small>
                          {a.name} · {a.session}
                        </small>
                      </div>
                      <Pill tone={a.status === "Completed" ? "" : "gold"}>
                        {a.status}
                      </Pill>
                      <ArrowRight size={14} />
                    </button>
                  ))
                ) : (
                  <Empty
                    title="No sessions on this date"
                    detail="Choose a care date above or schedule a therapy from a patient workspace."
                  />
                )}
              </div>
              <div>
                <h3 className="subheading">Follow-ups due</h3>
                {d.followUps.length ? (
                  d.followUps.map((p) => (
                    <button
                      className="queue-row"
                      key={p.id}
                      onClick={() => onOpen(p.id, "basic")}
                    >
                      <span className="record-icon">
                        <CalendarDays size={17} />
                      </span>
                      <div>
                        <strong>{p.name}</strong>
                        <small>Follow-up {dateLabel(p.nextVisit)}</small>
                      </div>
                      <ArrowRight size={14} />
                    </button>
                  ))
                ) : (
                  <p className="helper-text section-note">
                    No follow-ups are due for this date.
                  </p>
                )}
                <h3 className="subheading">Low-stock medicines</h3>
                {d.lowStock.length ? (
                  d.lowStock.map((i) => (
                    <button
                      className="queue-row"
                      key={i.id}
                      onClick={onInventory}
                    >
                      <span className="record-icon">
                        <Package size={17} />
                      </span>
                      <div>
                        <strong>{i.name}</strong>
                        <small>
                          {i.stock} {i.unit} remaining · reorder at{" "}
                          {i.reorderLevel}
                        </small>
                      </div>
                      <ArrowRight size={14} />
                    </button>
                  ))
                ) : (
                  <p className="helper-text section-note">
                    Stock levels are above configured reorder points.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
export function PrescriptionForm({
  record,
  inventory,
  patientId,
  date,
  onSaved,
  onClose,
}: {
  record?: CareRecord;
  inventory: InventoryItem[];
  patientId: string;
  date: string;
  onSaved: Refresh;
  onClose: () => void;
}) {
  const [medicine, setMedicine] = useState(
    record?.prescription?.inventoryId
      ? (inventory.find((i) => i.id === record.prescription?.inventoryId)
          ?.name ?? "Not in inventory")
      : "Not in inventory",
  );
  const details = record?.prescription;
  const fields: Field[] = [
    {
      key: "medicine",
      label: "Medicine from inventory",
      options: ["Not in inventory", ...inventory.map((i) => i.name)],
      full: true,
    },
    ...(medicine === "Not in inventory"
      ? [{ key: "name", label: "Medicine name", required: true, full: true }]
      : []),
    {
      key: "dose",
      label: "Dose",
      required: true,
      placeholder: "Enter the clinician-prescribed dose",
    },
    {
      key: "frequency",
      label: "Frequency",
      options: [
        "Morning",
        "Noon",
        "Evening",
        "Morning / Evening",
        "Three times daily",
        "As directed",
      ],
    },
    {
      key: "days",
      label: "Duration · days",
      type: "number",
      min: 1,
      max: 366,
      step: "1",
      required: true,
    },
    {
      key: "quantity",
      label: "Total quantity to dispense",
      type: "number",
      min: 0.001,
      required: true,
    },
    { key: "date", label: "Prescription date", type: "date", required: true },
    {
      key: "instructions",
      label: "Administration instructions",
      type: "textarea",
      full: true,
    },
  ];
  return (
    <>
      <p className="helper-text section-note">
        Selecting an inventory medicine connects dispensing, stock and billing.
        Prescribing does not deduct stock.
      </p>
      <DataForm
        fields={fields}
        initial={{
          medicine,
          name: record?.title ?? "",
          dose: details?.dose ?? record?.detail ?? "",
          frequency: details?.frequency || "As directed",
          days: details?.days ?? 1,
          quantity: record?.quantity ?? 1,
          date: record?.date ?? date,
          instructions: details?.instructions ?? "",
        }}
        onFieldChange={(key, value) => {
          if (key === "medicine") setMedicine(value);
        }}
        submitLabel={record ? "Save prescription" : "Add prescription"}
        onCancel={onClose}
        onSubmit={async (data) => {
          const { medicine, ...rest } = data;
          const selected = inventory.find((i) => i.name === medicine);
          await api(
            `/patients/${patientId}/prescriptions${record ? "/" + record.id : ""}`,
            send(record ? "PUT" : "POST", {
              ...rest,
              name: selected?.name ?? rest.name,
              inventoryId: selected?.id ?? "",
            }),
          );
          await onSaved();
          onClose();
        }}
      />
    </>
  );
}
export function PrescriptionList({
  ws,
  inventory,
  onEdit,
  onSaved,
}: {
  ws: Workspace;
  inventory: InventoryItem[];
  onEdit: (record: CareRecord) => void;
  onSaved: Refresh;
}) {
  const [dispense, setDispense] = useState<CareRecord | null>(null),
    [search, setSearch] = useState(""),
    [requestId, setRequestId] = useState("");
  const records = ws.records.filter(
    (r) =>
      r.kind === "prescription" &&
      r.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="records-area">
      <div className="record-filters">
        <div className="input-with-icon">
          <Search size={14} />
          <input
            aria-label="Search prescriptions"
            placeholder="Search medicines"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span>{records.length} prescriptions</span>
      </div>
      {records.map((r) => {
        const item = inventory.find(
            (i) => i.id === r.prescription?.inventoryId,
          ),
          issued = r.prescription?.dispensedQuantity ?? 0,
          remaining = Math.max(0, r.quantity - issued);
        return (
          <article className="record-card prescription-card" key={r.id}>
            <span className="record-icon">
              <Package size={20} />
            </span>
            <div className="record-body">
              <div>
                <h3>{r.title}</h3>
                <Pill>
                  {issued >= r.quantity
                    ? "Dispensed"
                    : issued > 0
                      ? "Partially dispensed"
                      : "Prescribed"}
                </Pill>
              </div>
              <p>{r.detail}</p>
              <small>
                {dateLabel(r.date)} · Prescribed {r.quantity}{" "}
                {item?.unit ?? "units"} · Issued {issued} · Remaining{" "}
                {remaining}
              </small>
              <small>
                {item
                  ? `${item.stock} ${item.unit} in stock · ${money(item.price)} per ${item.unit}`
                  : "Link to an inventory medicine to enable dispensing"}
              </small>
              <div className="record-actions">
                <Button kind="small ghost" onClick={() => onEdit(r)}>
                  <Pencil size={13} /> Edit prescription
                </Button>
                {remaining > 0 && (
                  <Button
                    kind="small outline"
                    disabled={!item}
                    onClick={() => {
                      setRequestId(crypto.randomUUID());
                      setDispense(r);
                    }}
                  >
                    Dispense medicine
                  </Button>
                )}
              </div>
            </div>
          </article>
        );
      })}
      {!records.length && (
        <Empty
          title="No prescriptions found"
          detail="Add a medicine to create the patient’s prescription."
        />
      )}
      {dispense && (
        <Modal
          title="Dispense prescribed medicine"
          subtitle={dispense.title}
          onClose={() => setDispense(null)}
        >
          <p className="helper-text section-note">
            This records the medicine as issued, deducts stock and creates an
            unpaid invoice in one step.
          </p>
          <DataForm
            key={requestId}
            fields={[
              {
                key: "quantity",
                label: "Quantity to issue",
                type: "number",
                min: 0.001,
                max:
                  dispense.quantity -
                  (dispense.prescription?.dispensedQuantity ?? 0),
                required: true,
              },
            ]}
            initial={{
              quantity: Math.min(
                dispense.quantity -
                  (dispense.prescription?.dispensedQuantity ?? 0),
                inventory.find(
                  (i) => i.id === dispense.prescription?.inventoryId,
                )?.stock ?? 0,
              ),
            }}
            submitLabel="Dispense & create invoice"
            onCancel={() => setDispense(null)}
            onSubmit={async (data) => {
              await api(
                `/patients/${ws.patient.id}/prescriptions/${dispense.id}/dispense`,
                send("POST", { ...data, requestId }),
              );
              await onSaved();
              setDispense(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
export function StockPanel({
  inventory,
  onSaved,
}: {
  inventory: InventoryItem[];
  onSaved: Refresh;
}) {
  const [search, setSearch] = useState(""),
    [low, setLow] = useState(false),
    [dialog, setDialog] = useState<{
      type: string;
      item?: InventoryItem;
    } | null>(null),
    [requestId, setRequestId] = useState("");
  const filtered = inventory.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) &&
      (!low || i.stock <= i.reorderLevel),
  );
  const movement = useRemote<StockMovement[]>(
    dialog?.type === "history"
      ? `/inventory/${dialog.item!.id}/movements`
      : null,
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Pharmacy inventory</h2>
          <p>
            Receive stock, reconcile counts and review every dispensing
            movement.
          </p>
        </div>
        <Button kind="small" onClick={() => setDialog({ type: "edit" })}>
          <Plus size={15} /> Add item
        </Button>
      </div>
      <div className="directory-toolbar">
        <div className="input-with-icon">
          <Search size={15} />
          <input
            aria-label="Search inventory"
            placeholder="Search medicines"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={low}
            onChange={(e) => setLow(e.target.checked)}
          />{" "}
          Low stock only
        </label>
        <span>{filtered.length} items</span>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Medicine / item</th>
              <th>Available stock</th>
              <th>Unit price</th>
              <th>Stock actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id}>
                <td>
                  <strong>{i.name}</strong>
                  <small>
                    Reorder at {i.reorderLevel} {i.unit}
                  </small>
                </td>
                <td>
                  <Pill tone={i.stock <= i.reorderLevel ? "gold" : ""}>
                    {i.stock} {i.unit}
                  </Pill>
                </td>
                <td>{money(i.price)}</td>
                <td>
                  <div className="stock-actions">
                    <Button
                      kind="small ghost"
                      onClick={() => setDialog({ type: "edit", item: i })}
                    >
                      <Pencil size={13} /> Edit item
                    </Button>
                    <Button
                      kind="small outline"
                      onClick={() => {
                        setRequestId(crypto.randomUUID());
                        setDialog({ type: "adjust", item: i });
                      }}
                    >
                      Receive / adjust
                    </Button>
                    <button
                      className="icon-button"
                      aria-label={`Stock history for ${i.name}`}
                      onClick={() => setDialog({ type: "history", item: i })}
                    >
                      <History size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <Empty
          title="No inventory matches"
          detail="Add a medicine or change the search filter."
        />
      )}
      {dialog && (
        <Modal
          title={
            dialog.type === "history"
              ? "Stock movement history"
              : dialog.type === "adjust"
                ? "Receive or adjust stock"
                : dialog.item
                  ? "Edit inventory item"
                  : "Add an inventory medicine"
          }
          subtitle={dialog.item?.name}
          onClose={() => setDialog(null)}
        >
          {dialog.type === "edit" && (
            <DataForm
              fields={[
                {
                  key: "name",
                  label: "Medicine / item",
                  required: true,
                  full: true,
                },
                {
                  key: "stock",
                  label: dialog.item
                    ? "Reconciled stock count"
                    : "Opening stock",
                  type: "number",
                  min: 0,
                  required: true,
                },
                { key: "unit", label: "Stock unit", required: true },
                {
                  key: "price",
                  label: "Price per stock unit · ₹",
                  type: "number",
                  min: 0,
                  step: "0.01",
                  required: true,
                },
                {
                  key: "reorderLevel",
                  label: "Low-stock threshold",
                  type: "number",
                  min: 0,
                  required: true,
                },
              ]}
              initial={
                dialog.item
                  ? { ...dialog.item }
                  : { stock: 0, unit: "units", price: 0, reorderLevel: 10 }
              }
              onCancel={() => setDialog(null)}
              onSubmit={async (data) => {
                await api(
                  "/inventory" + (dialog.item ? "/" + dialog.item.id : ""),
                  send(dialog.item ? "PUT" : "POST", data),
                );
                await onSaved();
                setDialog(null);
              }}
            />
          )}
          {dialog.type === "adjust" && (
            <DataForm
              key={requestId}
              fields={[
                {
                  key: "delta",
                  label: "Stock change (+ received, − removed)",
                  type: "number",
                  required: true,
                },
                {
                  key: "reason",
                  label: "Reason / supplier reference",
                  type: "textarea",
                  required: true,
                  full: true,
                },
              ]}
              initial={{ delta: 1 }}
              submitLabel="Save stock movement"
              onCancel={() => setDialog(null)}
              onSubmit={async (data) => {
                await api(
                  `/inventory/${dialog.item!.id}/adjustments`,
                  send("POST", { ...data, requestId }),
                );
                await onSaved();
                setDialog(null);
              }}
            />
          )}
          {dialog.type === "history" && (
            <>
              <RemoteError error={movement.error} retry={movement.reload} />
              {movement.loading ? (
                <p className="inline-loading">Loading movements…</p>
              ) : movement.data?.length ? (
                movement.data.map((m) => (
                  <div className="payment-row" key={m.id}>
                    <span>
                      {m.reason}
                      <small>
                        {m.author} ·{" "}
                        {new Date(m.createdAt).toLocaleString("en-GB")}
                      </small>
                    </span>
                    <strong className={m.delta < 0 ? "negative" : ""}>
                      {m.delta > 0 ? "+" : ""}
                      {m.delta}
                    </strong>
                  </div>
                ))
              ) : (
                <Empty
                  title="No stock movements yet"
                  detail="Opening stock is recorded in the item. Receipts, corrections and dispensing appear here."
                />
              )}
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
export function TherapyCatalog({ onSaved }: { onSaved: Refresh }) {
  const remote = useRemote<Therapy[]>("/therapies?all=true");
  const [editing, setEditing] = useState<Therapy | null | undefined>(undefined),
    [search, setSearch] = useState("");
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Therapy catalog & tariffs</h2>
          <p>
            Changes apply to new bookings. Existing booked prices remain
            unchanged.
          </p>
        </div>
        <Button kind="small" onClick={() => setEditing(null)}>
          <Plus size={15} /> Add therapy
        </Button>
      </div>
      <div className="records-area">
        <div className="input-with-icon">
          <Search size={15} />
          <input
            aria-label="Find catalog therapy"
            placeholder="Search catalog"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <RemoteError error={remote.error} retry={remote.reload} />
        {remote.data
          ?.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
          .map((t) => (
            <div className="document-row" key={t.id}>
              <div>
                <strong>{t.name}</strong>
                <small>
                  {t.category} · {t.duration} min · {money(t.price)}
                </small>
              </div>
              <Pill tone={t.active ? "" : "gold"}>
                {t.active ? "Active" : "Archived"}
              </Pill>
              <Button kind="small outline" onClick={() => setEditing(t)}>
                Edit therapy
              </Button>
            </div>
          ))}
      </div>
      {editing !== undefined && (
        <Modal
          title={editing ? "Edit therapy" : "Add a therapy"}
          onClose={() => setEditing(undefined)}
        >
          <DataForm
            fields={[
              {
                key: "name",
                label: "Therapy name",
                required: true,
                full: true,
              },
              {
                key: "category",
                label: "Tariff category",
                options: ["CGHS", "NON-NABH"],
              },
              {
                key: "duration",
                label: "Duration · minutes",
                type: "number",
                min: 5,
                max: 480,
                step: "1",
                required: true,
              },
              {
                key: "price",
                label: "Price per session · ₹",
                type: "number",
                min: 0,
                step: "0.01",
                required: true,
              },
              {
                key: "active",
                label: "Availability",
                options: ["Active", "Archived"],
              },
            ]}
            initial={
              editing
                ? { ...editing, active: editing.active ? "Active" : "Archived" }
                : { duration: 30, price: 0, active: "Active" }
            }
            onCancel={() => setEditing(undefined)}
            onSubmit={async (data) => {
              await api(
                "/therapies" + (editing ? "/" + editing.id : ""),
                send(editing ? "PUT" : "POST", {
                  ...data,
                  active: data.active === "Active",
                }),
              );
              await onSaved();
              remote.reload();
              setEditing(undefined);
            }}
          />
        </Modal>
      )}
    </section>
  );
}
export function RoomsPanel() {
  const remote = useRemote<Room[]>("/rooms");
  const [editing, setEditing] = useState<Room | null | undefined>(undefined);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Rooms & beds</h2>
          <p>
            Bed availability is connected to admission, transfers and discharge.
          </p>
        </div>
        <Button kind="small" onClick={() => setEditing(null)}>
          <Plus size={15} /> Add room
        </Button>
      </div>
      <RemoteError error={remote.error} retry={remote.reload} />
      <div className="room-grid">
        {remote.data?.map((r) => (
          <article className="room-card" key={r.id}>
            <span className="record-icon">
              <BedDouble size={22} />
            </span>
            <h3>{r.name}</h3>
            <p>
              {r.type} · {money(r.rate)} / day
            </p>
            <Pill tone={r.available > 0 ? "" : "gold"}>
              {r.active
                ? `${r.available} of ${r.capacity} beds available`
                : "Inactive"}
            </Pill>
            <Button kind="small ghost" onClick={() => setEditing(r)}>
              <Pencil size={13} /> Edit room
            </Button>
          </article>
        ))}
      </div>
      {editing !== undefined && (
        <Modal
          title={editing ? "Edit room" : "Add a room"}
          onClose={() => setEditing(undefined)}
        >
          <DataForm
            fields={[
              { key: "name", label: "Room name / number", required: true },
              {
                key: "type",
                label: "Room type",
                options: ["Private", "Shared", "General"],
              },
              {
                key: "capacity",
                label: "Bed capacity",
                type: "number",
                min: 1,
                max: 100,
                step: "1",
                required: true,
              },
              {
                key: "rate",
                label: "Daily rate · ₹",
                type: "number",
                min: 0,
                step: "0.01",
                required: true,
              },
              {
                key: "active",
                label: "Availability",
                options: ["Active", "Inactive"],
              },
            ]}
            initial={
              editing
                ? { ...editing, active: editing.active ? "Active" : "Inactive" }
                : { capacity: 1, rate: 0 }
            }
            onCancel={() => setEditing(undefined)}
            onSubmit={async (data) => {
              await api(
                "/rooms" + (editing ? "/" + editing.id : ""),
                send(editing ? "PUT" : "POST", {
                  ...data,
                  active: data.active === "Active",
                }),
              );
              remote.reload();
              setEditing(undefined);
            }}
          />
        </Modal>
      )}
    </section>
  );
}
export function RoomAssignmentForm({
  ws,
  onSaved,
  onClose,
}: {
  ws: Workspace;
  onSaved: Refresh;
  onClose: () => void;
}) {
  const remote = useRemote<Room[]>("/rooms?patientId=" + ws.patient.id);
  const rooms = remote.data?.filter((r) => r.active) ?? [];
  return (
    <>
      <RemoteError error={remote.error} retry={remote.reload} />
      {rooms.length ? (
        <DataForm
          fields={[
            {
              key: "room",
              label: "Room / bed",
              options: rooms.map(
                (r) =>
                  `${r.name} · ${r.type} · ${r.available} available · ${money(r.rate)}/day`,
              ),
              full: true,
            },
            {
              key: "startDate",
              label: "Assignment / transfer date",
              type: "date",
              required: true,
            },
          ]}
          initial={{ startDate: ws.patient.admissionDate }}
          submitLabel="Assign room"
          onCancel={onClose}
          onSubmit={async (data) => {
            const room = rooms.find((r) =>
              String(data.room).startsWith(r.name + " · "),
            )!;
            await api(
              `/patients/${ws.patient.id}/room`,
              send("POST", { roomId: room.id, startDate: data.startDate }),
            );
            await onSaved();
            onClose();
          }}
        />
      ) : (
        <p className="helper-text">
          Add an active room from Rooms & beds first.
        </p>
      )}
    </>
  );
}
export function RoomHistory({ ws }: { ws: Workspace }) {
  return (
    <div className="records-area">
      {ws.roomStays.length ? (
        ws.roomStays.map((r) => (
          <article className="record-card" key={r.id}>
            <span className="record-icon">
              <BedDouble size={22} />
            </span>
            <div className="record-body">
              <div>
                <h3>
                  {r.name} · {r.type}
                </h3>
                <Pill>{r.status === "Active" ? "Occupied" : r.status}</Pill>
              </div>
              <p>
                {dateLabel(r.startDate)} – {dateLabel(r.endDate)}
              </p>
              <small>
                {money(r.rate)} / day · Charges are available from Invoice
                completed care.
              </small>
            </div>
          </article>
        ))
      ) : (
        <Empty
          title="Choose a comfortable place to heal"
          detail="Assign a room to connect bed occupancy and accommodation charges."
        />
      )}
    </div>
  );
}
export function PhysiciansPanel({
  ws,
  onSaved,
}: {
  ws: Workspace | null;
  onSaved: Refresh;
}) {
  const remote = useRemote<Physician[]>("/physicians");
  const [editing, setEditing] = useState<Physician | null | undefined>(
      undefined,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  return (
    <>
      <div className="panel-heading compact-heading">
        <p>Manage your physician directory and assign the current patient.</p>
        <Button kind="small outline" onClick={() => setEditing(null)}>
          <Plus size={14} /> Add physician
        </Button>
      </div>
      <RemoteError error={remote.error} retry={remote.reload} />
      {remote.data?.map((p) => (
        <div className="document-row" key={p.id}>
          <span className="record-icon">
            <Stethoscope size={20} />
          </span>
          <div>
            <strong>{p.name}</strong>
            <small>
              {p.speciality} · {p.phone || p.email || "No contact recorded"}
            </small>
            <small>{p.active ? "Active" : "Inactive"}</small>
          </div>
          <Button kind="small ghost" onClick={() => setEditing(p)}>
            Edit
          </Button>
          {ws && p.active && (
            <Button
              kind="small outline"
              disabled={busy === p.id || ws.patient.physician === p.name}
              onClick={async () => {
                setBusy(p.id);
                setError("");
                try {
                  await api(
                    "/patients/" + ws.patient.id,
                    send(
                      "PUT",
                      patientInput(ws.patient, { physician: p.name }),
                    ),
                  );
                  await onSaved();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy("");
                }
              }}
            >
              {ws.patient.physician === p.name ? "Assigned" : "Assign"}
            </Button>
          )}
        </div>
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {editing !== undefined && (
        <Modal
          title={editing ? "Edit physician" : "Add a physician"}
          onClose={() => setEditing(undefined)}
        >
          <DataForm
            fields={[
              {
                key: "name",
                label: "Physician name",
                required: true,
                full: true,
              },
              { key: "speciality", label: "Speciality" },
              { key: "phone", label: "Phone" },
              { key: "email", label: "Email", type: "email" },
              {
                key: "active",
                label: "Availability",
                options: ["Active", "Inactive"],
              },
            ]}
            initial={
              editing
                ? { ...editing, active: editing.active ? "Active" : "Inactive" }
                : { speciality: "Ayurveda" }
            }
            onCancel={() => setEditing(undefined)}
            onSubmit={async (data) => {
              await api(
                "/physicians" + (editing ? "/" + editing.id : ""),
                send(editing ? "PUT" : "POST", {
                  ...data,
                  active: data.active === "Active",
                }),
              );
              remote.reload();
              setEditing(undefined);
            }}
          />
        </Modal>
      )}
    </>
  );
}
export function DischargePanel({
  ws,
  practice,
  onSaved,
}: {
  ws: Workspace;
  practice: Practice;
  onSaved: Refresh;
}) {
  const [open, setOpen] = useState(false);
  const summaries = ws.records.filter((r) => r.kind === "discharge");
  const pending = ws.assignments.filter((a) => a.status === "Scheduled").length,
    outstanding = ws.bills.reduce((sum, b) => sum + b.balance, 0);
  return (
    <div className="records-area">
      <div className="discharge-status">
        <div>
          <Pill>{ws.patient.status}</Pill>
          <h3>
            {ws.patient.status === "Discharged"
              ? "The care handover is complete"
              : "Prepare a complete care handover"}
          </h3>
          <p>
            {pending} scheduled sessions · {money(outstanding)} outstanding ·
            Follow-up {dateLabel(ws.patient.nextVisit)}
          </p>
        </div>
        {ws.patient.status !== "Discharged" && (
          <Button onClick={() => setOpen(true)}>Finalize discharge</Button>
        )}
      </div>
      {summaries.map((r) => (
        <article className="record-card" key={r.id}>
          <div className="record-body">
            <div>
              <h3>{r.title}</h3>
              <Pill>{r.status}</Pill>
            </div>
            <p>{r.detail}</p>
            <small>{dateLabel(r.date)}</small>
          </div>
          <Button
            kind="small outline"
            onClick={() => printCareRecord(r, ws.patient, practice)}
          >
            <Printer size={14} /> Print summary
          </Button>
        </article>
      ))}
      {open && (
        <Modal
          title="Finalize patient discharge"
          subtitle="The summary is retained, the room is released, and later scheduled sessions are cancelled."
          onClose={() => setOpen(false)}
          wide
        >
          <DataForm
            fields={[
              {
                key: "date",
                label: "Actual discharge date",
                type: "date",
                required: true,
              },
              { key: "nextVisit", label: "Follow-up date", type: "date" },
              {
                key: "summary",
                label: "Clinical summary",
                type: "textarea",
                required: true,
                full: true,
              },
              {
                key: "instructions",
                label: "Home care and follow-up instructions",
                type: "textarea",
                required: true,
                full: true,
              },
            ]}
            initial={{
              date:
                ws.patient.dischargeDate < today()
                  ? ws.patient.dischargeDate
                  : today(),
              nextVisit:
                ws.patient.nextVisit >= ws.patient.dischargeDate
                  ? ws.patient.nextVisit
                  : "",
              summary: summaries[0]?.detail ?? "",
            }}
            submitLabel="Discharge patient"
            onCancel={() => setOpen(false)}
            onSubmit={async (data) => {
              await api(
                `/patients/${ws.patient.id}/discharge`,
                send("POST", data),
              );
              await onSaved();
              setOpen(false);
            }}
          />
          <p className="helper-text">
            Outstanding invoices remain in the patient account after discharge.
          </p>
        </Modal>
      )}
    </div>
  );
}
export function VitalsTrends({
  vitals,
  patientId,
}: {
  vitals: Vital[];
  patientId: string;
}) {
  const [metric, setMetric] = useState("pulse");
  const fields: Record<string, { label: string; unit: string }> = {
    pulse: { label: "Pulse", unit: "bpm" },
    temperature: { label: "Temperature", unit: "°C" },
    spo2: { label: "SpO₂", unit: "%" },
    painScore: { label: "Pain score", unit: "/10" },
    weight: { label: "Weight", unit: "kg" },
  };
  const points = vitals
    .filter((v) => typeof v[metric as keyof Vital] === "number")
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const values = points.map((p) => Number(p[metric as keyof Vital]));
  const min = values.length ? Math.min(...values) : 0,
    max = values.length ? Math.max(...values) : 1,
    padding = Math.max((max - min) * 0.15, 1),
    bottom = min - padding,
    top = max + padding;
  const x = (i: number) =>
      points.length === 1 ? 320 : 45 + (i * 550) / (points.length - 1),
    y = (v: number) => 145 - ((v - bottom) / (top - bottom)) * 115;
  return (
    <div className="vital-trends">
      <div className="vital-trends-heading">
        <div>
          <h3>Observation trends</h3>
          <p>
            Recorded measurements across the admission. Graph range adjusts to
            the observations.
          </p>
        </div>
        <div className="panel-actions">
          <select
            aria-label="Trend metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            {Object.entries(fields).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label} · {value.unit}
              </option>
            ))}
          </select>
          <Button
            kind="small ghost"
            onClick={() =>
              downloadCsv(
                `patient-${patientId}-vitals.csv`,
                [
                  "Date",
                  "Session",
                  "Time",
                  "Height (cm)",
                  "Weight (kg)",
                  "Temperature (C)",
                  "Pulse (bpm)",
                  "BP (mmHg)",
                  "RR (/min)",
                  "Pain (0-10)",
                  "FBS (mg/dL)",
                  "PPBS (mg/dL)",
                  "RBS (mg/dL)",
                  "SpO2 (%)",
                  "Sleep",
                  "Bowel",
                  "Appetite",
                ],
                vitals.map((v) => [
                  v.date,
                  v.session,
                  v.time,
                  v.height,
                  v.weight,
                  v.temperature,
                  v.pulse,
                  v.bp,
                  v.rr,
                  v.painScore,
                  v.fbs,
                  v.ppbs,
                  v.rbs,
                  v.spo2,
                  v.sleep,
                  v.bowel,
                  v.appetite,
                ]),
              )
            }
          >
            <Download size={14} /> Export vitals
          </Button>
        </div>
      </div>
      {points.length ? (
        <svg
          className="trend-chart"
          viewBox="0 0 640 180"
          role="img"
          aria-label={`${fields[metric].label} observations: ${points.map((p, i) => dateLabel(p.date) + " " + p.session + " " + values[i] + " " + fields[metric].unit).join("; ")}`}
        >
          <line x1="45" x2="595" y1="145" y2="145" stroke="#dde6d4" />
          <line x1="45" x2="595" y1="30" y2="30" stroke="#eef2e8" />
          {points.length > 1 && (
            <polyline
              points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke="#426b43"
              strokeWidth="2"
            />
          )}
          {values.map((v, i) => (
            <g key={points[i].id}>
              <circle cx={x(i)} cy={y(v)} r="4" fill="#b19850">
                <title>
                  {dateLabel(points[i].date)} · {points[i].session} · {v}{" "}
                  {fields[metric].unit}
                </title>
              </circle>
              <text
                x={x(i)}
                y={y(v) - 10}
                textAnchor="middle"
                fontSize="10"
                fill="#416344"
              >
                {v}
              </text>
              {(i === 0 || i === points.length - 1) && (
                <text
                  x={x(i)}
                  y="168"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#718367"
                >
                  {dateLabel(points[i].date)}
                </text>
              )}
            </g>
          ))}
        </svg>
      ) : (
        <p className="helper-text section-note">
          Record {fields[metric].label.toLowerCase()} to see this trend.
        </p>
      )}
    </div>
  );
}
export function SettingsPanel({
  user,
  practice,
  onUser,
  onPractice,
}: {
  user: User;
  practice: Practice;
  onUser: (user: User) => void;
  onPractice: (practice: Practice) => void;
}) {
  const [saved, setSaved] = useState("");
  return (
    <div className="settings-columns">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Practice details</h2>
            <p>Shown on the workspace and printed invoices.</p>
          </div>
        </div>
        <div className="settings-form">
          <DataForm
            key={JSON.stringify(practice)}
            fields={[
              {
                key: "name",
                label: "Practice name",
                required: true,
                full: true,
              },
              { key: "tagline", label: "Practice description", full: true },
              { key: "phone", label: "Contact phone", full: true },
              {
                key: "address",
                label: "Address",
                type: "textarea",
                full: true,
              },
            ]}
            initial={{ ...practice }}
            onSubmit={async (data) => {
              const result = await api<Practice>(
                "/practice",
                send("PUT", data),
              );
              onPractice(result);
              setSaved("Practice details saved.");
            }}
          />
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Clinician profile & password</h2>
            <p>
              Changing your email or password requires your current password.
            </p>
          </div>
        </div>
        <div className="settings-form">
          <DataForm
            fields={[
              { key: "name", label: "Your name", required: true, full: true },
              {
                key: "email",
                label: "Sign-in email",
                type: "email",
                required: true,
                full: true,
              },
              {
                key: "currentPassword",
                label: "Current password",
                type: "password",
                full: true,
              },
              {
                key: "newPassword",
                label: "New password (at least 12 characters)",
                type: "password",
                full: true,
              },
            ]}
            initial={{ name: user.name, email: user.email }}
            onSubmit={async (data) => {
              onUser(await api<User>("/auth/profile", send("PUT", data)));
              setSaved(
                "Profile saved. Other sessions are signed out after a password or email change.",
              );
            }}
          />
        </div>
      </section>
      {saved && (
        <p className="inline-success" role="status">
          <Check size={15} />
          {saved}
        </p>
      )}
    </div>
  );
}
