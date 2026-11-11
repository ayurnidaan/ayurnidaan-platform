import type { Patient, Practice, Bill, CareRecord } from "../shared/types";
export const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
export const today = () => new Date().toLocaleDateString("en-CA");
export const dateLabel = (value: string) =>
  value
    ? new Date(value.slice(0, 10) + "T12:00:00").toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Not set";
export function patientInput(p: Patient, patch: Record<string, unknown> = {}) {
  const { id: _, createdAt: __, status: ___, dischargedAt: ____, ...data } = p;
  return { ...data, ...patch };
}
export function downloadCsv(
  name: string,
  columns: string[],
  rows: unknown[][],
) {
  const escape = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  downloadFile(
    name,
    "text/csv;charset=utf-8",
    "\uFEFF" +
      [columns, ...rows].map((row) => row.map(escape).join(",")).join("\r\n"),
  );
}
export function downloadFile(name: string, type: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const html = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function printSheet(title: string, body: string) {
  const frame = document.createElement("iframe");
  frame.title = title;
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1100px;height:900px;border:0";
  document.body.append(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(
    `<!doctype html><html><head><title>${html(title)}</title><style>body{font:13px/1.65 Georgia,serif;color:#223d2e;padding:28px}h1{font-size:26px;margin:0}h2{font-size:17px;margin-top:25px}p{white-space:pre-wrap}small{color:#667360}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{text-align:left;padding:10px;border-bottom:1px solid #dce4d5}th{background:#eff4e9}.right{text-align:right}.meta{display:flex;justify-content:space-between;padding:18px 0;border-bottom:2px solid #244a32}.total{font-size:17px;text-align:right}.foot{margin-top:35px;color:#667360;font-size:11px}@page{size:A4;margin:12mm}</style></head><body>${body}</body></html>`,
  );
  doc.close();
  frame.contentWindow?.addEventListener("afterprint", () => frame.remove(), {
    once: true,
  });
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  }, 150);
}
export function printInvoice(bill: Bill, patient: Patient, practice: Practice) {
  printSheet(
    bill.number,
    `<h1>${html(practice.name)}</h1><small>${html(practice.tagline)} · ${html(practice.phone)}</small><p>${html(practice.address)}</p><div class="meta"><div><strong>${html(bill.number)}</strong><br>${html(dateLabel(bill.createdAt))}<br>${html(bill.status)}</div><div><strong>${html(patient.name)}</strong><br>Case ${html(patient.id)}<br>${html(patient.phone)}</div></div><h2>${html(bill.title)}</h2><table><thead><tr><th>Description</th><th>Quantity</th><th>Rate</th><th class="right">Amount</th></tr></thead><tbody>${bill.items.map((i) => `<tr><td>${html(i.description)}</td><td>${i.quantity}</td><td>${html(money(i.unitPrice))}</td><td class="right">${html(money(i.amount))}</td></tr>`).join("")}</tbody></table><p class="total">Total: ${html(money(bill.amount))}<br>Paid: ${html(money(bill.paidAmount))}<br><strong>Balance: ${html(money(bill.balance))}</strong></p>${bill.payments.length ? `<h2>Recorded payments</h2><table>${bill.payments.map((p) => `<tr><td>${html(dateLabel(p.date))}</td><td>${html(p.method)} · ${html(p.reference)}</td><td class="right">${html(money(p.amount))}</td></tr>`).join("")}</table>` : ""}<p class="foot">Payment status reflects receipts recorded by the practice. Currency: INR.</p>`,
  );
}
export function printCareRecord(
  record: CareRecord,
  patient: Patient,
  practice: Practice,
) {
  printSheet(
    record.title,
    `<h1>${html(practice.name)}</h1><small>${html(practice.tagline)} · ${html(practice.phone)}</small><div class="meta"><div><strong>${html(patient.name)}</strong><br>${patient.age} · ${html(patient.gender)}<br>${html(patient.diagnosis)}</div><div>Case ${html(patient.id)}<br>${html(patient.physician)}<br>${html(dateLabel(record.date))}</div></div><h2>${html(record.title)}</h2><p>${html(record.detail)}</p><p>${html(record.status)}${record.session ? " · " + html(record.session) : ""}</p><p class="foot">Follow-up: ${html(dateLabel(patient.nextVisit))}</p>`,
  );
}
