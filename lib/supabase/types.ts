export type MemberStatus = "active" | "inactive";
export type PaymentType = "monthly_fee" | "annual";

export type Club = {
  id: string;
  slug: string;
  name: string;
  created_at: string;
};

export type ClubInsert = {
  id?: string;
  slug: string;
  name: string;
  created_at?: string;
};

export type ClubUpdate = Partial<Omit<Club, "id" | "created_at">>;

export type FamilyRole = "parent" | "child" | "spouse" | "other";

export type Member = {
  id: string;
  club_id: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  status: MemberStatus;
  is_board_member: boolean;
  board_position: string | null;
  is_president: boolean;
  is_system_admin: boolean;
  birth_date: string | null;
  family_id: string | null;
  family_role: FamilyRole | null;
  phone_verified: boolean;
  phone_verified_at: string | null;
  phone_verified_by: string | null;
  email_verified: boolean;
  email_verified_at: string | null;
  email_verified_by: string | null;
  created_at: string;
};

export type MemberInsert = {
  id?: string;
  club_id?: string | null;
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  status?: MemberStatus;
  is_board_member?: boolean;
  board_position?: string | null;
  is_president?: boolean;
  is_system_admin?: boolean;
  birth_date?: string | null;
  family_id?: string | null;
  family_role?: FamilyRole | null;
  phone_verified?: boolean;
  phone_verified_at?: string | null;
  phone_verified_by?: string | null;
  email_verified?: boolean;
  email_verified_at?: string | null;
  email_verified_by?: string | null;
  created_at?: string;
};

export type MemberUpdate = Partial<Omit<Member, "id" | "created_at">>;

export const FAMILY_ROLE_LABELS: Record<FamilyRole, string> = {
  parent: "Γονέας",
  child: "Παιδί",
  spouse: "Σύζυγος",
  other: "Άλλο",
};

export type DepartmentRole = "member" | "leader" | "assistant";

export type Department = {
  id: string;
  club_id: string | null;
  name: string;
  description: string | null;
  display_order: number;
  active: boolean;
  created_at: string;
};

export type DepartmentInsert = {
  id?: string;
  club_id?: string | null;
  name: string;
  description?: string | null;
  display_order?: number;
  active?: boolean;
  created_at?: string;
};

export type DepartmentUpdate = Partial<Omit<Department, "id" | "created_at">>;

export type MemberDepartment = {
  id: string;
  club_id: string | null;
  member_id: string;
  department_id: string;
  role: DepartmentRole;
};

export type MemberDepartmentInsert = {
  id?: string;
  club_id?: string | null;
  member_id: string;
  department_id: string;
  role?: DepartmentRole;
};

export type MemberDepartmentUpdate = Partial<Omit<MemberDepartment, "id">>;

export type ApprovalStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected";

export type Payment = {
  id: string;
  club_id: string | null;
  member_id: string;
  amount: number;
  payment_date: string;
  type: PaymentType;
  period: string | null;
  original_amount: number | null;
  override_reason: string | null;
  approval_status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  batch_id: string | null;
  created_at: string;
};

export type PaymentInsert = {
  id?: string;
  club_id?: string | null;
  member_id: string;
  amount: number;
  payment_date?: string;
  type: PaymentType;
  period?: string | null;
  original_amount?: number | null;
  override_reason?: string | null;
  approval_status?: ApprovalStatus;
  approved_by?: string | null;
  approved_at?: string | null;
  batch_id?: string | null;
  created_at?: string;
};

export type PaymentUpdate = Partial<Omit<Payment, "id" | "created_at">>;

export type PaymentDeletionAudit = {
  id: string;
  club_id: string | null;
  batch_id: string | null;
  deleted_by: string | null;
  deleted_at: string;
  override_reason: string | null;
  payment_count: number;
  total_amount: number;
  payments_snapshot: unknown;
  had_approved_payments: boolean;
};

export type PaymentDeletionAuditInsert = {
  id?: string;
  club_id?: string | null;
  batch_id?: string | null;
  deleted_by?: string | null;
  deleted_at?: string;
  override_reason?: string | null;
  payment_count: number;
  total_amount: number;
  payments_snapshot: unknown;
  had_approved_payments: boolean;
};

export type DiscountContext = "subscription" | "event_ticket";
export type DiscountRuleType = "age_based" | "sibling_order";

export type DiscountRule = {
  id: string;
  club_id: string | null;
  context: DiscountContext;
  rule_type: DiscountRuleType;
  age_max: number | null;
  sibling_position: number | null;
  discount_percent: number;
  label: string;
  display_order: number;
  active: boolean;
  created_at: string;
};

export type DiscountRuleInsert = {
  id?: string;
  club_id?: string | null;
  context: DiscountContext;
  rule_type: DiscountRuleType;
  age_max?: number | null;
  sibling_position?: number | null;
  discount_percent: number;
  label: string;
  display_order?: number;
  active?: boolean;
  created_at?: string;
};

export type DiscountRuleUpdate = Partial<
  Omit<DiscountRule, "id" | "created_at">
>;

export type EntertainmentType = {
  id: string;
  club_id: string | null;
  name: string;
  description: string | null;
  display_order: number;
  active: boolean;
  created_at: string;
};

export type EntertainmentTypeInsert = {
  id?: string;
  club_id?: string | null;
  name: string;
  description?: string | null;
  display_order?: number;
  active?: boolean;
  created_at?: string;
};

export type EntertainmentTypeUpdate = Partial<
  Omit<EntertainmentType, "id" | "created_at">
>;

export type ContributionType =
  | "money"
  | "product"
  | "service"
  | "venue"
  | "other";

export type Event = {
  id: string;
  club_id: string | null;
  event_name: string;
  event_date: string;
  venue_map_config: Record<string, unknown>;
  location: string | null;
  created_at: string;
};

export type EventInsert = {
  id?: string;
  club_id?: string | null;
  event_name: string;
  event_date: string;
  venue_map_config?: Record<string, unknown>;
  location?: string | null;
  created_at?: string;
};

export type EventUpdate = Partial<Omit<Event, "id" | "created_at">>;

export type Entertainer = {
  id: string;
  club_id: string | null;
  name: string;
  entertainment_type_id: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EntertainerInsert = {
  id?: string;
  club_id?: string | null;
  name: string;
  entertainment_type_id?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type EntertainerUpdate = Partial<
  Omit<Entertainer, "id" | "created_at">
>;

export type EventEntertainer = {
  id: string;
  event_id: string;
  entertainer_id: string;
  club_id: string | null;
  fee: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EventEntertainerInsert = {
  id?: string;
  event_id: string;
  entertainer_id: string;
  club_id?: string | null;
  fee?: number | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type EventEntertainerUpdate = Partial<
  Omit<EventEntertainer, "id" | "created_at">
>;

export type EventEntertainerWithDetails = EventEntertainer & {
  entertainer: Entertainer & {
    entertainment_type?: EntertainmentType | null;
  };
};

export type EventTicketPrice = {
  id: string;
  club_id: string | null;
  event_id: string;
  label: string;
  price: number;
  display_order: number;
  created_at: string;
};

export type EventTicketPriceInsert = {
  id?: string;
  club_id?: string | null;
  event_id: string;
  label: string;
  price: number;
  display_order?: number;
  created_at?: string;
};

export type EventTicketPriceUpdate = Partial<
  Omit<EventTicketPrice, "id" | "created_at">
>;

export type Sponsor = {
  id: string;
  club_id: string | null;
  member_id: string | null;
  external_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
};

export type SponsorInsert = {
  id?: string;
  club_id?: string | null;
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
  club_id: string | null;
  event_id: string;
  sponsor_id: string;
  contribution_type: ContributionType;
  contribution_value: number | null;
  contribution_description: string | null;
  created_at: string;
};

export type EventSponsorInsert = {
  id?: string;
  club_id?: string | null;
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
  club_id: string | null;
  label: string;
  amount: number;
  payment_type: PaymentType;
};

export type PaymentTemplateInsert = {
  id?: string;
  club_id?: string | null;
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
  club_id: string | null;
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
  club_id?: string | null;
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
  club_id: string | null;
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
  club_id?: string | null;
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
  club_id: string | null;
  calendar_event_id: string;
  cancelled_date: string;
  created_at: string;
};

export type CalendarEventCancellationInsert = {
  id?: string;
  club_id?: string | null;
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
  club_id: string | null;
  member_id: string;
  module: PermissionModule;
  action: PermissionAction;
  scope: PermissionScope;
  scope_value: string | null;
  created_at: string;
};

export type MemberPermissionInsert = {
  id?: string;
  club_id?: string | null;
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

export type ThemePreset = "classic" | "cretan" | "nature" | "custom";

export type ClubSettings = {
  id: string;
  club_id: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  theme_preset: ThemePreset | null;
  favicon_url: string | null;
  custom_domain: string | null;
  metadata: Record<string, unknown> | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  afm: string | null;
  foundation_year: number | null;
  updated_at: string;
};

export type ClubSettingsInsert = {
  id?: string;
  club_id?: string | null;
  logo_url?: string | null;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  theme_preset?: ThemePreset | null;
  favicon_url?: string | null;
  custom_domain?: string | null;
  metadata?: Record<string, unknown> | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  afm?: string | null;
  foundation_year?: number | null;
  updated_at?: string;
};

export type ClubSettingsUpdate = Partial<Omit<ClubSettings, "id">>;

export type UserRoleName = "admin" | "treasurer" | "member";

export type UserRoleRow = {
  user_id: string;
  club_id: string | null;
  role: UserRoleName;
  created_at: string;
};

export type UserRoleInsert = {
  user_id: string;
  club_id?: string | null;
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
      clubs: {
        Row: Club;
        Insert: ClubInsert;
        Update: ClubUpdate;
        Relationships: [];
      };
      members: {
        Row: Member;
        Insert: MemberInsert;
        Update: MemberUpdate;
        Relationships: [
          {
            foreignKeyName: "members_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
        ];
      };
      departments: {
        Row: Department;
        Insert: DepartmentInsert;
        Update: DepartmentUpdate;
        Relationships: [
          {
            foreignKeyName: "departments_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
        ];
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
          {
            foreignKeyName: "member_departments_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
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
      payment_deletion_audit: {
        Row: PaymentDeletionAudit;
        Insert: PaymentDeletionAuditInsert;
        Update: Partial<PaymentDeletionAudit>;
        Relationships: [
          {
            foreignKeyName: "payment_deletion_audit_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_deletion_audit_deleted_by_fkey";
            columns: ["deleted_by"];
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
      entertainment_types: {
        Row: EntertainmentType;
        Insert: EntertainmentTypeInsert;
        Update: EntertainmentTypeUpdate;
        Relationships: [
          {
            foreignKeyName: "entertainment_types_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
        ];
      };
      entertainers: {
        Row: Entertainer;
        Insert: EntertainerInsert;
        Update: EntertainerUpdate;
        Relationships: [
          {
            foreignKeyName: "entertainers_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entertainers_entertainment_type_id_fkey";
            columns: ["entertainment_type_id"];
            isOneToOne: false;
            referencedRelation: "entertainment_types";
            referencedColumns: ["id"];
          },
        ];
      };
      event_entertainers: {
        Row: EventEntertainer;
        Insert: EventEntertainerInsert;
        Update: EventEntertainerUpdate;
        Relationships: [
          {
            foreignKeyName: "event_entertainers_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_entertainers_entertainer_id_fkey";
            columns: ["entertainer_id"];
            isOneToOne: false;
            referencedRelation: "entertainers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_entertainers_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
        ];
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
      discount_rules: {
        Row: DiscountRule;
        Insert: DiscountRuleInsert;
        Update: DiscountRuleUpdate;
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

export const DEPARTMENT_ROLES: DepartmentRole[] = [
  "member",
  "leader",
  "assistant",
];

export const DEPARTMENT_ROLE_LABELS: Record<DepartmentRole, string> = {
  member: "Μέλος",
  leader: "Ομαδάρχης",
  assistant: "Βοηθός",
};

export const BOARD_POSITIONS = [
  "Πρόεδρος",
  "Αντιπρόεδρος",
  "Ταμίας",
  "Γραμματέας",
  "Μέλος",
] as const;
