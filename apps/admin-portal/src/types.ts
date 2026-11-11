export type Page = "Overview" | "Customers" | "Doctors" | "Appointments" | "Inventory" | "Orders" | "Settings";
export type JsonRecord = Record<string, any>;

export interface Overview {
  metrics: {
    customers: number;
    activeDoctors: number;
    pendingDoctors: number;
    appointments: number;
    activeProducts: number;
    openOrders: number;
    revenue: number;
  };
  recentAppointments: JsonRecord[];
  recentOrders: JsonRecord[];
  pendingApplications: JsonRecord[];
}

export interface AdminPayloads {
  Overview: Overview;
  Customers: { customers: JsonRecord[] };
  Doctors: { applications: JsonRecord[]; doctors: JsonRecord[] };
  Appointments: { appointments: JsonRecord[] };
  Inventory: { products: JsonRecord[] };
  Orders: { orders: JsonRecord[] };
  Settings: { admin: JsonRecord; database: JsonRecord; environment: JsonRecord };
}
