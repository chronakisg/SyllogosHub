export type MemberStatus = "active" | "inactive";
export type PaymentType = "monthly_fee" | "annual";

export type Member = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  department: string | null;
  status: MemberStatus;
  is_board_member: boolean;
  board_position: string | null;
  is_president: boolean;
  is_system_admin: boolean;
  created_at: string;
};

export type MemberInsert = {
  id?: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  department?: string | null;
  status?: MemberStatus;
  is_board_member?: boolean;
  board_position?: string | null;
  is_president?: boolean;
  is_system_admin?: boolean;
  created_at?: string;
};

export type MemberUpdate = Partial<Omit<Member, "id" | "created_at">>;

export type MemberDepartment = {
  id: string;
  member_id: string;
  department: string;
};

export type MemberDepartmentInsert = {
  id?: string;
  member_id: string;
  department: string;
};

export type MemberDepartmentUpdate = Partial<
  Omit<MemberDepartment, "id">
>;

export type Payment = {
  id: string;
  member_id: string;
  amount: number;
  payment_date: string;
  type: PaymentType;
  period: string | null;
  created_at: string;
};

export type PaymentInsert = {
  id?: string;
  member_id: string;
  amount: number;
  payment_date?: string;
  type: PaymentType;
  period?: string | null;
  created_at?: string;
};

export type PaymentUpdate = Partial<Omit<Payment, "id" | "created_at">>;

export type EntertainmentType =
  | "band"
  | "dj"
  | "orchestra"
  | "live"
  | "other";

export type ContributionType =
  | "money"
  | "goods"
  | "services"
  | "venue"
  | "other";

export type Event = {
  id: string;
  event_name: string;
  event_date: string;
  venue_map_config: Record<string, unknown>;
  location: string | null;
  entertainment_type: EntertainmentType | null;
  entertainment_name: string | null;
  created_at: string;
};

export type EventInsert = {
  id?: string;
  event_name: string;
  event_date: string;
  venue_map_config?: Record<string, unknown>;
  location?: string | null;
  entertainment_type?: EntertainmentType | null;
  entertainment_name?: string | null;
  created_at?: string;
};

export type EventUpdate = Partial<Omit<Event, "id" | "created_at">>;

export type EventTicketPrice = {
  id: string;
  event_id: string;
  category: string;
  price: number;
  display_order: number;
  created_at: string;
};

export type EventTicketPriceInsert = {
  id?: string;
  event_id: string;
  category: string;
  price: number;
  display_order?: number;
  created_at?: string;
};

export type EventTicketPriceUpdate = Partial<
  Omit<EventTicketPrice, "id" | "created_at">
>;

export type Sponsor = {
  id: string;
  member_id: string | null;
  external_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
};

export type SponsorInsert = {
  id?: string;
  member_id?: string | null;
  external_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  notes?: string | null;
  created_at?: string;
};

export type SponsorUpdate = Partial<Omit<Sponsor, "id" | "created_at">>;

export type EventSponsor = {
  id: string;
  event_id: string;
  sponsor_id: string;
  contribution_type: ContributionType;
  contribution_value: number | null;
  contribution_description: string | null;
  created_at: string;
};

export type EventSponsorInsert = {
  id?: string;
  event_id: string;
  sponsor_id: string;
  contribution_type: ContributionType;
  contribution_value?: number | null;
  contribution_description?: string | null;
  created_at?: string;
};

export type EventSponsorUpdate = Partial<
  Omit<EventSponsor, "id" | "created_at">
>;

export type PaymentTemplate = {
  id: string;
  label: string;
  amount: number;
  payment_type: PaymentType;
};

export type PaymentTemplateInsert = {
  id?: string;
  label: string;
  amount: number;
  payment_type: PaymentType;
};

export type PaymentTemplateUpdate = Partial<Omit<PaymentTemplate, "id">>;

export type Guest = {
  name: string;
  member_id?: string;
};

export type Reservation = {
  id: string;
  event_id: string;
  group_name: string;
  pax_count: number;
  table_number: number | null;
  is_paid: boolean;
  guests: Guest[] | null;
  created_at: string;
};

export type ReservationInsert = {
  id?: string;
  event_id: string;
  group_name: string;
  pax_count: number;
  table_number?: number | null;
  is_paid?: boolean;
  guests?: Guest[] | null;
  created_at?: string;
};

export type ReservationUpdate = Partial<Omit<Reservation, "id" | "created_at">>;

export type CalendarEventCategory = "lesson" | "event" | "meeting" | "other";
export type CalendarEventStatus = "active" | "cancelled";
export type CalendarRecurrencePattern = "weekly";

export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  category: CalendarEventCategory;
  start_datetime: string | null;
  end_datetime: string | null;
  is_recurring: boolean;
  recurrence_pattern: CalendarRecurrencePattern | null;
  recurrence_days: number;
  start_time: string | null;
  end_time: string | null;
  start_season_date: string | null;
  end_season_date: string | null;
  coordinator_id: string | null;
  status: CalendarEventStatus;
  created_at: string;
};

export type CalendarEventInsert = {
  id?: string;
  title: string;
  description?: string | null;
  category: CalendarEventCategory;
  start_datetime?: string | null;
  end_datetime?: string | null;
  is_recurring?: boolean;
  recurrence_pattern?: CalendarRecurrencePattern | null;
  recurrence_days?: number;
  start_time?: string | null;
  end_time?: string | null;
  start_season_date?: string | null;
  end_season_date?: string | null;
  coordinator_id?: string | null;
  status?: CalendarEventStatus;
  created_at?: string;
};

export type CalendarEventUpdate = Partial<
  Omit<CalendarEvent, "id" | "created_at">
>;

export type CalendarEventCancellation = {
  id: string;
  calendar_event_id: string;
  cancelled_date: string;
  created_at: string;
};

export type CalendarEventCancellationInsert = {
  id?: string;
  calendar_event_id: string;
  cancelled_date: string;
  created_at?: string;
};

export type CalendarEventCancellationUpdate = Partial<
  Omit<CalendarEventCancellation, "id" | "created_at">
>;

export const WEEKDAY_BITS = {
  Mon: 1,
  Tue: 2,
  Wed: 4,
  Thu: 8,
  Fri: 16,
  Sat: 32,
  Sun: 64,
} as const;

export type PermissionModule =
  | "calendar"
  | "members"
  | "finances"
  | "seating"
  | "events"
  | "dashboard"
  | "settings";

export type PermissionAction = "read" | "create" | "edit" | "delete";

export type PermissionScope = "all" | "own" | "department";

export type MemberPermission = {
  id: string;
  member_id: string;
  module: PermissionModule;
  action: PermissionAction;
  scope: PermissionScope;
  scope_value: string | null;
  created_at: string;
};

export type MemberPermissionInsert = {
  id?: string;
  member_id: string;
  module: PermissionModule;
  action: PermissionAction;
  scope?: PermissionScope;
  scope_value?: string | null;
  created_at?: string;
};

export type MemberPermissionUpdate = Partial<
  Omit<MemberPermission, "id" | "created_at">
>;

export type ClubSettings = {
  id: string;
  club_name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tax_id: string | null;
  founded_year: number | null;
  updated_at: string;
};

export type ClubSettingsInsert = {
  id?: string;
  club_name?: string;
  logo_url?: string | null;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  tax_id?: string | null;
  founded_year?: number | null;
  updated_at?: string;
};

export type ClubSettingsUpdate = Partial<Omit<ClubSettings, "id">>;

export type UserRoleName = "admin" | "treasurer" | "member";

export type UserRoleRow = {
  user_id: string;
  role: UserRoleName;
  created_at: string;
};

export type UserRoleInsert = {
  user_id: string;
  role: UserRoleName;
  created_at?: string;
};

export type UserRoleUpdate = Partial<Omit<UserRoleRow, "user_id" | "created_at">>;

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      members: {
        Row: Member;
        Insert: MemberInsert;
        Update: MemberUpdate;
        Relationships: [];
      };
      member_departments: {
        Row: MemberDepartment;
        Insert: MemberDepartmentInsert;
        Update: MemberDepartmentUpdate;
        Relationships: [
          {
            foreignKeyName: "member_departments_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      member_permissions: {
        Row: MemberPermission;
        Insert: MemberPermissionInsert;
        Update: MemberPermissionUpdate;
        Relationships: [
          {
            foreignKeyName: "member_permissions_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: Payment;
        Insert: PaymentInsert;
        Update: PaymentUpdate;
        Relationships: [
          {
            foreignKeyName: "payments_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: Event;
        Insert: EventInsert;
        Update: EventUpdate;
        Relationships: [];
      };
      event_ticket_prices: {
        Row: EventTicketPrice;
        Insert: EventTicketPriceInsert;
        Update: EventTicketPriceUpdate;
        Relationships: [
          {
            foreignKeyName: "event_ticket_prices_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      sponsors: {
        Row: Sponsor;
        Insert: SponsorInsert;
        Update: SponsorUpdate;
        Relationships: [
          {
            foreignKeyName: "sponsors_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      event_sponsors: {
        Row: EventSponsor;
        Insert: EventSponsorInsert;
        Update: EventSponsorUpdate;
        Relationships: [
          {
            foreignKeyName: "event_sponsors_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_sponsors_sponsor_id_fkey";
            columns: ["sponsor_id"];
            isOneToOne: false;
            referencedRelation: "sponsors";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_templates: {
        Row: PaymentTemplate;
        Insert: PaymentTemplateInsert;
        Update: PaymentTemplateUpdate;
        Relationships: [];
      };
      club_settings: {
        Row: ClubSettings;
        Insert: ClubSettingsInsert;
        Update: ClubSettingsUpdate;
        Relationships: [];
      };
      reservations: {
        Row: Reservation;
        Insert: ReservationInsert;
        Update: ReservationUpdate;
        Relationships: [
          {
            foreignKeyName: "reservations_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: UserRoleRow;
        Insert: UserRoleInsert;
        Update: UserRoleUpdate;
        Relationships: [];
      };
      calendar_events: {
        Row: CalendarEvent;
        Insert: CalendarEventInsert;
        Update: CalendarEventUpdate;
        Relationships: [
          {
            foreignKeyName: "calendar_events_coordinator_id_fkey";
            columns: ["coordinator_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_event_cancellations: {
        Row: CalendarEventCancellation;
        Insert: CalendarEventCancellationInsert;
        Update: CalendarEventCancellationUpdate;
        Relationships: [
          {
            foreignKeyName: "calendar_event_cancellations_event_fkey";
            columns: ["calendar_event_id"];
            isOneToOne: false;
            referencedRelation: "calendar_events";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export const DEPARTMENTS = [
  "Χορευτικό",
  "Λύρα",
  "Μαντολινάτα",
  "Θέατρο",
  "Άλλο",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const BOARD_POSITIONS = [
  "Πρόεδρος",
  "Αντιπρόεδρος",
  "Ταμίας",
  "Γραμματέας",
  "Μέλος",
] as const;
