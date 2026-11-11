# Everyday workflows

## Configure the practice

1. Open **Settings** for the practice name, contact details, invoice address, sign-in email and password.
2. Use **Physicians** to manage the physician directory and assign the current patient's clinician. Directory entries do not create additional login accounts.
3. Configure **Therapy catalog** entries, tariffs, durations and prices. Archiving stops new bookings; booked prices stay unchanged.
4. Configure **Rooms & beds**, capacities and daily rates.
5. Configure **Inventory**, opening counts, stock units, unit prices and low-stock thresholds. Review illustrative seed prices before using them for your practice.

## Admissions and navigation

**New patient** creates an admission. The discharge date is planned until discharge is finalized. **Patients** searches names, case IDs and phone numbers, with status/favourite filters, sorting, pagination and CSV export. **Current patient** switches the active case.

**Care date** selects a day within the stay, moves the therapy table to that week, updates summary cards and filters Daily program. The patient, page, tab and date survive refresh through the URL.

## Therapy plans

**Schedule therapy** supports multiple dates, sessions and treatments. The circle beside a therapy marks it completed. Completed sessions can be invoiced from billing. Invoiced sessions cannot be deleted or reopened while the invoice remains active.

**Create estimate** saves a priced course. Open **View estimates** to:

- **Schedule this plan** from a first date. Every advised day must fit within the admission.
- **Create plan invoice** for the course. Repeat clicks return the same invoice. Plan billing and completed-session billing do not charge the same plan twice.

Saved estimates retain their quoted prices after catalog edits. “All” includes three daily sessions.

## Prescribing and dispensing

In **Prescription → Add medicine**, select an inventory medicine or enter a medicine outside inventory. Record the clinician-prescribed dose, frequency, duration, total quantity and instructions.

Prescribing does not deduct stock. **Dispense medicine** issues a full or partial quantity, deducts inventory, writes a stock movement and creates an unpaid itemized invoice together. It rejects quantities above the remaining prescription or available stock. Link a manually entered medicine to an inventory item before dispensing it.

Issued prescriptions remain in the record and cannot be deleted. The linked medicine cannot change after dispensing. Unit prices must match the configured stock unit.

## Billing and receipts

Open **Pharmacy bill** or **Account** for the selected patient:

- **Create bill** adds custom line items, quantities and rates.
- **Invoice completed care** collects completed, uninvoiced therapies; explicitly include accommodation when needed. It excludes charges covered by plan invoices.
- **Record payment** records money already received, including date, method and reference. Partial receipts retain a balance. Overpayments and duplicate submissions are rejected.
- **View invoice** includes itemization, receipts and **Print invoice**.
- Unpaid invoices can be voided. Voiding care or plan invoices releases their charges for correction or rebilling. Issued-medicine invoices and invoices with payments cannot be voided. Recorded payments cannot be erased by toggling a status.

This is an internal ledger. It does not charge cards, initiate UPI transfers, process refunds or connect to external accounting software.

## Stock

**Receive / adjust** records a positive receipt or negative adjustment with a reason or supplier reference. Stock cannot fall below zero. The history icon shows receipts, reconciled counts and patient dispensing. Editing a stock count creates a correction entry.

## Rooms and discharge

**Accommodation → Assign room** checks bed capacity. **Transfer room** ends the previous stay on the preceding day and creates the new stay at its daily rate. Reconcile an active accommodation invoice before changing dates it already covers.

**Discharge summary → Finalize discharge** records the actual date, summary, home-care instructions and follow-up. It retains the handover, releases the bed, updates patient status and cancels later scheduled therapies/program activities. Invoices remain in the account. Discharge cannot precede completed sessions or observations. Further therapy bookings require a new admission.

## Other daily work

- **Overview** shows a dated work queue, follow-ups due, low stock, admissions, receipts and balances. A queue entry opens its patient and care date.
- **Vital data** has trends and CSV export. Daily and three-session records remain separate and synchronize with Therapy.
- **Daily program**, **Investigation** and **Diet** support completion, filters and individual printing. Record results in the investigation form.
- Session notes support corrections, with previous text retained in activity history.
- **Documents** supports authenticated PDF/PNG/JPEG uploads and downloads up to 10 MB.
- **Export case** downloads structured JSON; download document files separately.

## Backups

`npm run backup` creates a consistent database snapshot and copies uploaded files to `data/backups/<timestamp>/`. Runtime data and backups are ignored by Git. Keep copies outside this machine according to your practice's retention process. JSON case exports are readable record exports, not complete database/file backups.
