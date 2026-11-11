# VaidyaManager IPD Patient Portal — Full Functional Specification & Replica Guide

## 1. Overview & Architecture
This repository contains the complete specification and interactive single-page web application replica of the **VaidyaManager IPD Patient View** (`app.vaidyamanager.com/patientIpd/viewIpdcase/25559`), specifically engineered for an **Ayurvedic Hospital / Panchakarma IPD Management System** (S.R.I.A / Healthier India).

### Key Functional Modules
1. **Top Navigation Bar**: Global navigation for Hospital modules (`New`, `Old`, `Account`, `Inventory`, `IPD`, `Pharmacy Bill`, Doctor Profile dropdown, Notification badges, and `Physicians` switch).
2. **Sub-Navigation Tab Bar**: 11 IPD case tabs (`Basic Detail`, `Accomodation`, `IPD History`, `Prescription`, `Therapy`, `Diet`, `Investigation`, `Documents`, `Discharge Summary`, `Daily Program`, `Vital Data`) + `View` dropdown.
3. **Patient Banner**: Displays patient demographics (`Mrs. KAILASH KANWAR`, `57 / Female`), Admission Date (`D.O.A: 01/09/2026`), Discharge Date (`D.O.D: 19/09/2026`), `Next Visit Date : 12/09/2026`, and conditional action buttons (`Mark as Favourite` on Prescription tab).
4. **Therapy Schedule & Daily Progress Module (`Therapy` Tab)**:
   - Displays a date-by-date table from `01/09/2026` to `10/09/2026`.
   - **Columns**: `Date`, `progress` (Vitals summary), `Morning`, `Noon`, `Evening`.
   - **Interactive Modals**:
     - Clicking any cell in the **`progress`** column opens the **Vital Data Entry Modal** for that specific date.
     - Clicking any cell in **`Morning`**, **`Noon`**, or **`Evening`** opens the **Therapy Assignment Modal** (with CGHS/NON-NABH filters, multi-day calendar picker `01`–`19`, session selector, A-Z filter, searchable therapy catalog, and direct scheduling).
     - Clicking **`Create Estimate Therapy`** opens the **Adviced Therapy Estimation Modal** with searchable autocomplete dropdown and day count inputs.
     - Clicking the **Comment Bubble Icon** in the `Evening` column allows adding/viewing session notes.
     - **Session Vitals Enhancement Mode**: Includes a toggle to switch between **Legacy Mode** (1 vital record per day, overwriting timestamp on re-entry) and **3-Session Mode (Morning / Noon / Evening Vitals)** where vitals are recorded and displayed independently before each therapy session (Morning, Noon, Evening) and synced as separate rows in the `Vital Data` tab.
5. **Vital Data Chart Module (`Vital Data` Tab)**:
   - Tabular log of all recorded patient vitals (`Date`, `Time`, `Height`, `Weight`, `Temperature`, `Pulse`, `BP`, `RR`, `Pain Score`, `FBS`, `PPBS`, `RBS`, `SPO2`, `Sleep`, `Bowel`, `Appetite`, `Action`).
   - Synchronized in real-time with entries made in the `Therapy` -> `progress` column.
   - Supports deleting records (`x` action button) and printing (`Print` button).
6. **Prescription Module (`Prescription` Tab)**:
   - Split-screen layout showing Clinical Complaints/History (`Generalised Pain With Stiffness`, `Multiple Joint Pain`, `Low Back Pain`, `Vitals/Habits`) on the left, Ayurvedic Medicine Prescriptions (`Ghrita punchatikthakam ghrutham`, `Ksheerabala 101 Avartana`, `Tablet KAISORAGUGGULU`, `Tablet AAMAVATARI RASA`, `Kashayam DASHMOOLA KASHAYA`) in the center, and Diagnosis (`FD: SARVANGAVATA`, `PD: SARVANGAVATA`, `Treatment Time: 0 Days`, `Medicine Given Days: 10 Days`, `ICD Code`) on the right.

---

## 2. Visual & UI Design Tokens
- **Primary Brand Teal**: `#4f8a8b` (active tabs, patient header banner, modal headers, table highlights)
- **Secondary Button Teal**: `#8ab6b6` / `#5a9697`
- **Table Header Gray**: `#dcdcdc`
- **Highlighted Row Tint (e.g., 08/09/2026)**: `#d1e7e7`
- **Typography**: Clean Sans-Serif (`Segoe UI`, `Roboto`, `Arial`, `sans-serif`), `13px` base table font.

---

## 3. Data Schema & State Synchronization
### Vital Data Record Schema
```json
{
  "id": "vital_2026_09_02_morning",
  "date": "02/09/2026",
  "dayName": "Wednesday",
  "session": "Morning",
  "time": "22:04",
  "height": "",
  "weight": "80",
  "temperature": "98.6",
  "pulse": "80",
  "bp": "120/80",
  "rr": "18",
  "painScore": "08",
  "fbs": "",
  "ppbs": "",
  "rbs": "",
  "spo2": "99",
  "sleep": "regular",
  "bowel": "constipation",
  "appetite": "normal"
}
```
- **Unit Formatting Rules**:
  - `Weight`: appends `kg` (e.g. `80 kg`)
  - `Temperature`: appends `°C` (e.g. `98.6 °C`)
  - `BP`: appends `mmHg` (e.g. `120/80 mmHg`)
  - `RR`: appends `CPM` (e.g. `18 CPM`)

---

## 4. How to Run
Open `vaidyamanager_replica.html` directly in any modern browser. No build step or external server is required. All interactive modals, state persistence (`localStorage` + instant reset), Legacy vs. 3-Session Vitals toggle, and printable views work out of the box.
