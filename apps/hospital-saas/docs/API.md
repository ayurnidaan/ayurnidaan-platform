# HTTP API

Base URL: `/api` on the frontend origin, forwarded to the Express server during development. Production serves the built UI and API together. JSON requests use `Content-Type: application/json`. Every endpoint except health and login requires an authenticated session. All mutations except login also require the session's `X-CSRF-Token` header; browser origins must match `APP_ORIGIN`. The frontend configures these automatically.

## Authentication

| Method | Path           | Input / response                                                                   |
| ------ | -------------- | ---------------------------------------------------------------------------------- |
| GET    | `/health`      | `{status:"ok",database:"ready"}`                                                   |
| POST   | `/auth/login`  | `{email,password}` → `{user:{id,name,email},csrf}` plus an HttpOnly session cookie |
| GET    | `/auth/me`     | Current `{user,csrf}`                                                              |
| POST   | `/auth/logout` | Invalidates session and clears cookie                                              |
| GET    | `/schemas`     | JSON Schemas for the API's validators                                              |

Sessions expire after 12 hours. Login is limited to 15 failed attempts per 15 minutes per IP; general API traffic is limited to 300 requests per minute per IP. Session tokens are stored as SHA-256 hashes; passwords use salted scrypt.

## Patients

| Method | Path                      | Input                                                                                          |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------- |
| GET    | `/patients?search=...`    | Name/ID search, max 100 characters; returns at most 200 patients                               |
| POST   | `/patients`               | Full patient object below; returns created patient                                             |
| PUT    | `/patients/:id`           | Full patient object; excludes `id` and `createdAt`                                             |
| GET    | `/patients/:id/workspace` | Patient, vitals, assignments, notes, records, documents, bills and 100 latest activity entries |

```json
{
  "name": "Example Patient",
  "age": 42,
  "gender": "Female",
  "phone": "",
  "address": "Jaipur",
  "admissionDate": "2026-09-01",
  "dischargeDate": "2026-09-19",
  "nextVisit": "2026-09-12",
  "diagnosis": "Recorded diagnosis",
  "physician": "Dr. Example",
  "room": "Unassigned",
  "bloodGroup": "Unknown",
  "allergies": "None reported",
  "favourite": false,
  "vitalsMode": "three_session"
}
```

Dates use valid ISO `YYYY-MM-DD` values. Gender: `Female`, `Male`, `Other`. Blood group: `Unknown`, `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`. Vitals mode: `legacy` or `three_session`. Discharge cannot precede admission. Changing stay dates cannot exclude existing observations or assignments.

## Vitals

| Method | Path                            | Input                                   |
| ------ | ------------------------------- | --------------------------------------- |
| POST   | `/patients/:id/vitals`          | Upsert one observation per date/session |
| DELETE | `/patients/:id/vitals/:entryId` | Delete the patient's observation        |

```json
{
  "date": "2026-09-08",
  "session": "Morning",
  "time": "08:30",
  "height": 160,
  "weight": 80,
  "temperature": 37,
  "pulse": 76,
  "bp": "120/80",
  "rr": 18,
  "painScore": 5,
  "fbs": null,
  "ppbs": null,
  "rbs": null,
  "spo2": 99,
  "sleep": "Regular",
  "bowel": "Constipation",
  "appetite": "Normal"
}
```

At least one observation is required. Numeric values can be omitted or `null`. Units: height cm, weight kg, temperature **Celsius**, pulse bpm, BP mmHg (`systolic/diastolic`), RR per minute, pain 0–10, glucose mg/dL, SpO₂ percentage. Supported input ranges validate data entry; they are not diagnostic reference ranges.

Three-session mode accepts `Morning`, `Noon`, `Evening`; daily mode writes a `Daily` record independent of saved session records. Dates must be within the patient's stay. The timestamp can be explicitly recorded using `HH:mm`.

## Therapy and notes

| Method | Path                                 | Input                                                                     |
| ------ | ------------------------------------ | ------------------------------------------------------------------------- |
| GET    | `/therapies`                         | Returns catalog with id, name, category, price, duration                  |
| POST   | `/patients/:id/assignments`          | `{dates:["2026-09-08"],sessions:["Morning","Evening"],therapyIds:["t1"]}` |
| PATCH  | `/patients/:id/assignments/:entryId` | `{status:"Completed"}` or `{status:"Scheduled"}`                          |
| DELETE | `/patients/:id/assignments/:entryId` | Removes assignment                                                        |
| POST   | `/patients/:id/notes`                | `{date:"2026-09-08",session:"Evening",text:"Session observation"}`        |
| POST   | `/patients/:id/estimates`            | `{session:"Morning",items:[{therapyId:"t1",days:3}]}`                     |

Assignments create the cross product of selected dates, sessions and therapy IDs in a transaction; duplicates are ignored. Dates must be within the stay. Notes are scoped to date and session. Estimates use server-side catalog prices; `All` session multiplies by 3. The entire estimate rolls back if any therapy is invalid. Estimates persist as `estimate` care records and can be listed from the workspace.

## Care records

| Method | Path                             | Input                                                 |
| ------ | -------------------------------- | ----------------------------------------------------- |
| POST   | `/patients/:id/records`          | Full record object below                              |
| PUT    | `/patients/:id/records/:entryId` | Full updated record, excluding id/patientId/createdAt |
| DELETE | `/patients/:id/records/:entryId` | Delete the patient's record                           |

```json
{
  "kind": "diet",
  "title": "Meal plan",
  "detail": "Instructions recorded by the treating clinician",
  "date": "2026-09-08",
  "status": "Active",
  "quantity": 1,
  "amount": 0,
  "session": "Morning"
}
```

Kinds: `history`, `prescription`, `diet`, `investigation`, `discharge`, `program`, `accommodation`, `estimate`. Status: `Active`, `Recorded`, `Occupied`, `Scheduled`, `Pending`, `Completed`, `Draft`, `Final`, `Cancelled`. Quantity must be positive; amount is a nonnegative INR value. Accommodation amount is the daily rate. Fields hold clinician-authored content; the app does not generate clinical recommendations.

## Documents

| Method | Path                               | Input                                                                  |
| ------ | ---------------------------------- | ---------------------------------------------------------------------- |
| POST   | `/patients/:id/documents`          | Multipart form field `file`; max 10 MB; PDF, PNG, JPEG signatures only |
| GET    | `/patients/:id/documents/:entryId` | Authenticated attachment download                                      |
| DELETE | `/patients/:id/documents/:entryId` | Deletes file metadata and stored file                                  |

Uploads have generated server filenames; user filenames are only download metadata. Stored documents are never served through an unauthenticated static directory.

## Inventory and billing

| Method | Path                           | Input                                                |
| ------ | ------------------------------ | ---------------------------------------------------- |
| GET    | `/inventory`                   | All stock items                                      |
| POST   | `/inventory`                   | `{name:"Medicine",stock:100,unit:"units",price:80}`  |
| PUT    | `/inventory/:id`               | Full inventory object excluding id                   |
| POST   | `/patients/:id/bills`          | `{title:"Care invoice",amount:1200,status:"Unpaid"}` |
| PATCH  | `/patients/:id/bills/:entryId` | `{status:"Paid"}` or `{status:"Unpaid"}`             |

Inventory stock and unit prices cannot be negative. Bill amounts must be positive. Bills are internal account records; no external payment processor is connected.

## Connected workflows

Patient responses include read-only `status` (`Admitted`/`Discharged`) and `dischargedAt`. Exclude these, `id` and `createdAt` from patient writes. Admissions cover up to 366 days. New admissions use `room:"Unassigned"`; reserve a bed using room assignment. Finalized stay dates cannot be changed through demographics.

All routes below use the same session and CSRF protection. Monetary inputs use INR with at most two decimals; invoice calculations and receipts use integer cents. Operations accepting `requestId` require a UUID; reuse it when retrying the same operation.

| Method       | Path                                                                  | Input / behavior                                                                                                                                       |
| ------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET          | `/patients/directory`                                                 | `search`, `status=All/Admitted/Discharged/Favourites`, `sort=Newest/Name/Admission`, `page`, `pageSize` (1–100); returns `{items,total,page,pageSize}` |
| GET          | `/patients/directory.csv`                                             | Same filters; authenticated CSV export                                                                                                                 |
| GET          | `/patients/:id/export`                                                | JSON case export; document files are downloaded separately                                                                                             |
| GET          | `/dashboard?date=YYYY-MM-DD`                                          | Admissions, dated queue, follow-ups due, low stock, balances and receipts                                                                              |
| GET/PUT      | `/practice`                                                           | `{name,tagline,phone,address}`                                                                                                                         |
| PUT          | `/auth/profile`                                                       | `{name,email,currentPassword?,newPassword?}`; current password required for email/password changes; new password minimum 12 characters                 |
| GET          | `/therapies?all=true`                                                 | Includes archived therapies; default returns active entries                                                                                            |
| POST/PUT     | `/therapies`, `/therapies/:id`                                        | `{name,category:"CGHS"                                                                                                                                 | "NON-NABH",price,duration,active}` |
| GET/POST/PUT | `/physicians`, `/physicians/:id`                                      | `{name,speciality,phone,email,active}`; directory entries do not provision logins                                                                      |
| GET          | `/rooms?patientId=...`                                                | Capacity and availability; optional `from`/`to` ISO dates                                                                                              |
| POST/PUT     | `/rooms`, `/rooms/:id`                                                | `{name,type:"Private"                                                                                                                                  | "Shared"                           | "General",capacity,rate,active}` |
| POST         | `/patients/:id/room`                                                  | `{roomId,startDate}`; capacity-checked assignment/transfer and accommodation records                                                                   |
| POST         | `/patients/:id/discharge`                                             | `{date,summary,instructions,nextVisit}`; final handover, bed release and cancellation of later scheduled care                                          |
| POST/PUT     | `/patients/:id/prescriptions`, `/patients/:id/prescriptions/:entryId` | Structured prescription below                                                                                                                          |
| POST         | `/patients/:id/prescriptions/:entryId/dispense`                       | `{quantity,requestId}`; stock movement and invoice are atomic                                                                                          |
| POST         | `/inventory/:id/adjustments`                                          | `{delta,reason,requestId}`; nonzero delta and nonnegative resulting stock                                                                              |
| GET          | `/inventory/:id/movements`                                            | Latest 100 movements                                                                                                                                   |
| POST         | `/patients/:id/invoices`                                              | `{title,items:[{description,quantity,unitPrice}],requestId}`                                                                                           |
| POST         | `/patients/:id/invoices/from-care`                                    | `{includeAccommodation:false,requestId}`; eligible completed sessions and optional room charges                                                        |
| POST         | `/patients/:id/invoices/:entryId/payments`                            | `{amount,method:"Cash"                                                                                                                                 | "UPI"                              | "Card"                           | "Bank transfer",reference,date,requestId}` |
| POST         | `/patients/:id/invoices/:entryId/void`                                | Voids eligible unpaid invoice, releasing care/plan sources for correction; issued-medicine invoices remain reconciled                                  |
| POST         | `/patients/:id/estimates/:entryId/schedule`                           | `{startDate}`; schedules the complete plan once                                                                                                        |
| POST         | `/patients/:id/estimates/:entryId/invoice`                            | Invoices a saved quote once; repeat returns the same invoice                                                                                           |
| PATCH        | `/patients/:id/records/:entryId/status`                               | `{status}` for program, investigation or diet records                                                                                                  |
| PATCH        | `/patients/:id/notes/:entryId`                                        | `{text}`; previous text remains in activity history                                                                                                    |

Structured prescription:

```json
{
  "inventoryId": "medicine-id-or-empty-string",
  "name": "Medicine name",
  "dose": "Clinician-recorded dose",
  "frequency": "As directed",
  "days": 10,
  "quantity": 20,
  "instructions": "Recorded administration instructions",
  "date": "2026-09-08"
}
```

Frequency: `Morning`, `Noon`, `Evening`, `Morning / Evening`, `Three times daily`, or `As directed`. A linked inventory medicine is required for dispensing. Prescribing does not deduct stock.

Inventory writes accept `reorderLevel` (default 10). Stock count edits create correction movements. Workspace responses include `estimates` and `roomStays`; prescriptions include structured `prescription` details. Bills include `number`, `items`, `payments`, `paidAmount` and `balance`; status is `Unpaid`, `Partially paid`, `Paid` or `Cancelled`.

Legacy bill routes remain supported. Marking paid records the remaining balance as a cash receipt. Recorded receipts cannot be erased by changing a status. Recording payments does not invoke an external provider.

## Errors

Unknown input properties are rejected. Validation returns `400` with `{error,fields:[{field,message}]}`. Authentication returns `401`; CSRF/origin errors `403`; missing patient-owned records `404`; conflicting stay-date changes `409`; rate limits `429`; unexpected server errors `500` without internal details. SQL values are bound through prepared statements. All successful mutations write an activity entry.
