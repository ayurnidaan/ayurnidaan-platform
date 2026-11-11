import { useState } from "react";
import {
  Plus,
  Trash2,
  Printer,
  Wallet,
  Check,
  ArrowRight,
  FileText,
} from "lucide-react";
import { api, send } from "./api";
import { Button, DataForm, Empty, Modal, Pill } from "./components";
import type { Bill, Workspace, Practice, Therapy } from "../shared/types";
import { money, today, dateLabel, printInvoice } from "./workflow-utils";
export type Refresh = () => Promise<void>;

export function InvoiceForm({
  onSaved,
  patientId,
  onCancel,
}: {
  onSaved: Refresh;
  patientId: string;
  onCancel: () => void;
}) {
  const [items, setItems] = useState([
      { description: "", quantity: 1, unitPrice: 0 },
    ]),
    [title, setTitle] = useState("Care invoice"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [requestId] = useState(() => crypto.randomUUID());
  const total =
    items.reduce(
      (sum, i) => sum + Math.round(i.quantity * i.unitPrice * 100),
      0,
    ) / 100;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          await api(
            `/patients/${patientId}/invoices`,
            send("POST", { title, items, requestId }),
          );
          await onSaved();
          onCancel();
        } catch (e) {
          setError((e as Error).message);
          setBusy(false);
        }
      }}
    >
      <label className="standalone-label">
        Bill description
        <input
          aria-label="Bill description"
          required
          minLength={2}
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className="invoice-lines">
        {items.map((item, index) => (
          <div className="invoice-line" key={index}>
            <label>
              Description
              <input
                aria-label={`Line ${index + 1} description`}
                required
                minLength={2}
                maxLength={250}
                value={item.description}
                onChange={(e) =>
                  setItems(
                    items.map((i, n) =>
                      n === index ? { ...i, description: e.target.value } : i,
                    ),
                  )
                }
              />
            </label>
            <label>
              Quantity
              <input
                aria-label={`Line ${index + 1} quantity`}
                type="number"
                required
                min={0.001}
                step="any"
                value={item.quantity}
                onChange={(e) =>
                  setItems(
                    items.map((i, n) =>
                      n === index
                        ? { ...i, quantity: Number(e.target.value) }
                        : i,
                    ),
                  )
                }
              />
            </label>
            <label>
              Unit price · ₹
              <input
                aria-label={`Line ${index + 1} unit price`}
                type="number"
                required
                min={0}
                step="0.01"
                value={item.unitPrice}
                onChange={(e) =>
                  setItems(
                    items.map((i, n) =>
                      n === index
                        ? { ...i, unitPrice: Number(e.target.value) }
                        : i,
                    ),
                  )
                }
              />
            </label>
            <strong>
              {money(Math.round(item.quantity * item.unitPrice * 100) / 100)}
            </strong>
            <button
              type="button"
              className="icon-button danger"
              disabled={items.length === 1}
              aria-label={`Remove line ${index + 1}`}
              onClick={() => setItems(items.filter((_, n) => n !== index))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <Button
        kind="small outline"
        onClick={() =>
          setItems([...items, { description: "", quantity: 1, unitPrice: 0 }])
        }
        disabled={items.length >= 100}
      >
        <Plus size={14} /> Add line item
      </Button>
      <div className="estimate-total">
        <span>Invoice total</span>
        <strong>{money(total)}</strong>
      </div>
      <p className="helper-text">
        This creates an unpaid invoice. Record a receipt after receiving
        payment.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <Button kind="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || total <= 0}>
          <FileText size={15} />
          {busy ? "Creating…" : "Create bill"}
        </Button>
      </div>
    </form>
  );
}
function PaymentForm({
  bill,
  patientId,
  onSaved,
  onCancel,
}: {
  bill: Bill;
  patientId: string;
  onSaved: Refresh;
  onCancel: () => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <>
      <div className="amount-banner">
        <span>Outstanding balance · {bill.number}</span>
        <strong>{money(bill.balance)}</strong>
      </div>
      <DataForm
        fields={[
          {
            key: "amount",
            label: "Payment amount · ₹",
            type: "number",
            min: 0.01,
            max: bill.balance,
            step: "0.01",
            required: true,
          },
          { key: "date", label: "Payment date", type: "date", required: true },
          {
            key: "method",
            label: "Payment method",
            options: ["Cash", "UPI", "Card", "Bank transfer"],
          },
          { key: "reference", label: "Receipt / transaction reference" },
        ]}
        initial={{ amount: bill.balance, date: today() }}
        submitLabel="Record payment"
        onCancel={onCancel}
        onSubmit={async (data) => {
          await api(
            `/patients/${patientId}/invoices/${bill.id}/payments`,
            send("POST", { ...data, requestId }),
          );
          await onSaved();
          onCancel();
        }}
      />
      <p className="helper-text">
        Record money already received. This does not charge a card or initiate a
        transfer.
      </p>
    </>
  );
}
export function BillingPanel({
  ws,
  onSaved,
  practice,
}: {
  ws: Workspace;
  onSaved: Refresh;
  practice: Practice;
}) {
  const [dialog, setDialog] = useState<string | null>(null),
    [filter, setFilter] = useState("All"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const selected = ws.bills.find((b) => b.id === dialog?.replace("pay:", ""));
  const bills = ws.bills.filter(
    (b) =>
      filter === "All" ||
      (filter === "Outstanding" ? b.balance > 0 : b.status === filter),
  );
  const totals = {
    total: ws.bills
      .filter((b) => b.status !== "Cancelled")
      .reduce((s, b) => s + b.amount, 0),
    paid: ws.bills.reduce((s, b) => s + b.paidAmount, 0),
    due: ws.bills.reduce((s, b) => s + b.balance, 0),
  };
  async function voidInvoice(bill: Bill) {
    setBusy(true);
    setError("");
    try {
      await api(
        `/patients/${ws.patient.id}/invoices/${bill.id}/void`,
        send("POST"),
      );
      await onSaved();
      setDialog(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Patient billing & receipts</h2>
          <p>Itemized invoices, recorded payments and a reconciled balance.</p>
        </div>
        <div className="panel-actions">
          <Button kind="outline small" onClick={() => setDialog("care")}>
            <Check size={14} /> Invoice completed care
          </Button>
          <Button kind="small" onClick={() => setDialog("new")}>
            <Plus size={15} /> Create bill
          </Button>
        </div>
      </div>
      <div className="finance-stats">
        <div>
          <span>Total invoiced</span>
          <strong>{money(totals.total)}</strong>
        </div>
        <div>
          <span>Receipts recorded</span>
          <strong>{money(totals.paid)}</strong>
        </div>
        <div>
          <span>Outstanding</span>
          <strong>{money(totals.due)}</strong>
        </div>
      </div>
      <div className="record-filters">
        <label>
          Show
          <select
            aria-label="Invoice status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {["All", "Outstanding", "Paid", "Cancelled"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <span>{bills.length} invoices</span>
      </div>
      <div className="records-area">
        {bills.length ? (
          bills.map((b) => (
            <div className="document-row" key={b.id}>
              <span className="record-icon">
                <Wallet size={19} />
              </span>
              <div>
                <strong>{b.title}</strong>
                <small>
                  {b.number} · {dateLabel(b.createdAt)} · {b.items.length} line
                  items
                </small>
              </div>
              <div className="invoice-amount">
                <strong>{money(b.amount)}</strong>
                <small>
                  {b.balance > 0
                    ? `${money(b.balance)} due`
                    : "Balance settled"}
                </small>
              </div>
              <Pill tone={b.status === "Paid" ? "" : "gold"}>{b.status}</Pill>
              <Button
                kind="small ghost"
                onClick={() => {
                  setError("");
                  setDialog(b.id);
                }}
              >
                View invoice <ArrowRight size={13} />
              </Button>
              {b.balance > 0 && (
                <Button
                  kind="small outline"
                  onClick={() => setDialog("pay:" + b.id)}
                >
                  Record payment
                </Button>
              )}
            </div>
          ))
        ) : (
          <Empty
            title="Everything in balance"
            detail="Create an invoice or bill completed care directly from the patient’s schedule."
          />
        )}
      </div>
      {dialog && (
        <Modal
          title={
            dialog === "new"
              ? "Create an itemized invoice"
              : dialog === "care"
                ? "Invoice completed care"
                : dialog.startsWith("pay:")
                  ? "Record a payment"
                  : (selected?.number ?? "Invoice")
          }
          onClose={() => {
            if (!busy) setDialog(null);
          }}
          wide={dialog === "new" || (!!selected && !dialog.startsWith("pay:"))}
        >
          {dialog === "new" && (
            <InvoiceForm
              patientId={ws.patient.id}
              onSaved={onSaved}
              onCancel={() => setDialog(null)}
            />
          )}
          {dialog === "care" && (
            <DataForm
              fields={[
                {
                  key: "includeAccommodation",
                  label: "Include accommodation charges",
                  options: ["No", "Yes"],
                },
              ]}
              submitLabel="Create care invoice"
              onCancel={() => setDialog(null)}
              onSubmit={async (data) => {
                await api(
                  `/patients/${ws.patient.id}/invoices/from-care`,
                  send("POST", {
                    includeAccommodation: data.includeAccommodation === "Yes",
                    requestId: crypto.randomUUID(),
                  }),
                );
                await onSaved();
                setDialog(null);
              }}
            />
          )}
          {dialog.startsWith("pay:") && selected && (
            <PaymentForm
              bill={selected}
              patientId={ws.patient.id}
              onSaved={onSaved}
              onCancel={() => setDialog(selected.id)}
            />
          )}
          {!dialog.startsWith("pay:") && selected && (
            <div className="invoice-preview">
              <div className="invoice-preview-header">
                <div>
                  <h3>{practice.name}</h3>
                  <p>{practice.tagline}</p>
                  <p>
                    {practice.phone} {practice.address}
                  </p>
                </div>
                <div>
                  <strong>{selected.number}</strong>
                  <p>{dateLabel(selected.createdAt)}</p>
                  <Pill>{selected.status}</Pill>
                </div>
              </div>
              <p>
                <strong>{ws.patient.name}</strong> · Case #
                {ws.patient.id.slice(0, 8)}
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Qty</th>
                      <th>Unit price</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((i) => (
                      <tr key={i.id}>
                        <td>{i.description}</td>
                        <td>{i.quantity}</td>
                        <td>{money(i.unitPrice)}</td>
                        <td>{money(i.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="invoice-totals">
                <p>
                  Total <strong>{money(selected.amount)}</strong>
                </p>
                <p>
                  Recorded payments{" "}
                  <strong>{money(selected.paidAmount)}</strong>
                </p>
                <p>
                  Balance <strong>{money(selected.balance)}</strong>
                </p>
              </div>
              {selected.payments.length > 0 && (
                <>
                  <h3 className="subheading">Payment history</h3>
                  {selected.payments.map((p) => (
                    <div className="payment-row" key={p.id}>
                      <span>
                        {dateLabel(p.date)} · {p.method}
                        <small>{p.reference || "No reference"}</small>
                      </span>
                      <strong>{money(p.amount)}</strong>
                    </div>
                  ))}
                </>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                {selected.status !== "Cancelled" &&
                  selected.paidAmount === 0 && (
                    <Button
                      kind="ghost"
                      disabled={busy}
                      onClick={() => voidInvoice(selected)}
                    >
                      Void unpaid invoice
                    </Button>
                  )}
                <Button
                  kind="outline"
                  onClick={() => printInvoice(selected, ws.patient, practice)}
                >
                  <Printer size={15} /> Print invoice
                </Button>
                {selected.balance > 0 && (
                  <Button onClick={() => setDialog("pay:" + selected.id)}>
                    Record payment
                  </Button>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}
export function EstimatesPanel({
  ws,
  onSaved,
  onScheduled,
}: {
  ws: Workspace;
  onSaved: Refresh;
  onScheduled: (date: string) => void;
}) {
  const [booking, setBooking] = useState<string | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="estimate-batches">
      {!ws.estimates.length && (
        <Empty
          title="Plan a course of care"
          detail="Create an estimate, then schedule the whole plan or turn it into an invoice."
        />
      )}
      {ws.estimates.map((e) => (
        <article className="estimate-batch" key={e.id}>
          <div className="estimate-batch-heading">
            <div>
              <strong>Care plan #{e.id.slice(0, 8)}</strong>
              <small>
                {e.session} · {dateLabel(e.createdAt)}
              </small>
            </div>
            <Pill>{e.scheduledAt ? "Scheduled" : "Draft"}</Pill>
            <strong>{money(e.total)}</strong>
          </div>
          {e.items.map((i) => (
            <div className="estimate-line-summary" key={i.id}>
              <span>
                {i.name}
                <small>
                  {i.days} days × {money(i.unitPrice)}{" "}
                  {e.session === "All" ? "× 3 sessions" : ""}
                </small>
              </span>
              <strong>{money(i.amount)}</strong>
            </div>
          ))}
          <div className="estimate-actions">
            {e.scheduledAt ? (
              <span className="helper-text">
                Starts {dateLabel(e.scheduledAt)}
              </span>
            ) : (
              <Button
                kind="small"
                disabled={ws.patient.status === "Discharged"}
                onClick={() => {
                  setError("");
                  setBooking(e.id);
                }}
              >
                Schedule this plan
              </Button>
            )}
            {e.invoiceId ? (
              <Pill>Invoice created</Pill>
            ) : (
              <Button
                kind="small outline"
                disabled={busy === e.id}
                onClick={async () => {
                  setBusy(e.id);
                  setError("");
                  try {
                    await api(
                      `/patients/${ws.patient.id}/estimates/${e.id}/invoice`,
                      send("POST"),
                    );
                    await onSaved();
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy("");
                  }
                }}
              >
                {busy === e.id ? "Creating…" : "Create plan invoice"}
              </Button>
            )}
          </div>
        </article>
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {booking && (
        <Modal
          title="Schedule a care plan"
          subtitle="Every therapy in this estimate is scheduled for its advised number of days."
          onClose={() => setBooking(null)}
        >
          <DataForm
            fields={[
              {
                key: "startDate",
                label: "First therapy date",
                type: "date",
                required: true,
              },
            ]}
            initial={{ startDate: ws.patient.admissionDate }}
            submitLabel="Schedule plan"
            onCancel={() => setBooking(null)}
            onSubmit={async (data) => {
              await api(
                `/patients/${ws.patient.id}/estimates/${booking}/schedule`,
                send("POST", data),
              );
              await onSaved();
              setBooking(null);
              onScheduled(String(data.startDate));
            }}
          />
        </Modal>
      )}
    </div>
  );
}
