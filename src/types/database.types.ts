// Schema types for the Supabase `public` schema, in the shape
// `supabase gen types typescript` produces, so this file can be replaced
// wholesale by that command's output once the CLI is wired up.
//
// Hand-derived from supabase/migrations/ (which mirror what's applied live).
// When you add a migration, update this file in the same commit — it is the
// only thing standing between a schema change and a silent `any` in every
// query result.
//
// Nullability here is the database's, not the optimistic hand-written shapes
// in ./index.ts: store_name_zh, canonical_name_zh, raw_name_zh,
// unit_spec_value/unit_spec_unit, and the edit-log values are all genuinely
// nullable columns.
//
// One deliberate divergence from `gen types` output: profiles.role,
// receipts.status and alerts.type are typed as their literal unions rather
// than bare `string`. Postgres enforces exactly those values via CHECK
// constraints, but `gen types` only narrows real enums. If you ever
// regenerate this file, re-apply those three narrowings — without them the
// casts this file exists to delete come straight back.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      circles: {
        Row: {
          id: string;
          name: string | null;
          max_members: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name?: string | null;
          max_members?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string | null;
          max_members?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          user_id: string;
          circle_id: string;
          role: "owner" | "member";
          display_name: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          circle_id: string;
          role: "owner" | "member";
          display_name?: string | null;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          circle_id?: string;
          role?: "owner" | "member";
          display_name?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_circle_id_fkey";
            columns: ["circle_id"];
            isOneToOne: false;
            referencedRelation: "circles";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          name_en: string;
          name_zh: string;
        };
        Insert: {
          name_en: string;
          name_zh: string;
        };
        Update: {
          name_en?: string;
          name_zh?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          circle_id: string;
          canonical_name_en: string;
          canonical_name_zh: string | null;
          category: string;
          low_stock_alert_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          circle_id: string;
          canonical_name_en: string;
          canonical_name_zh?: string | null;
          category: string;
          low_stock_alert_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          circle_id?: string;
          canonical_name_en?: string;
          canonical_name_zh?: string | null;
          category?: string;
          low_stock_alert_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_circle_id_fkey";
            columns: ["circle_id"];
            isOneToOne: false;
            referencedRelation: "circles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_fkey";
            columns: ["category"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["name_en"];
          },
        ];
      };
      receipts: {
        Row: {
          id: string;
          circle_id: string;
          uploaded_by: string;
          store_name_en: string;
          store_name_zh: string | null;
          purchase_date: string;
          total_amount: number;
          original_image_url: string | null;
          uploaded_at: string;
          status: "pending_review" | "confirmed";
        };
        Insert: {
          id?: string;
          circle_id: string;
          uploaded_by: string;
          store_name_en: string;
          store_name_zh?: string | null;
          purchase_date: string;
          total_amount: number;
          original_image_url?: string | null;
          uploaded_at?: string;
          status?: "pending_review" | "confirmed";
        };
        Update: {
          id?: string;
          circle_id?: string;
          uploaded_by?: string;
          store_name_en?: string;
          store_name_zh?: string | null;
          purchase_date?: string;
          total_amount?: number;
          original_image_url?: string | null;
          uploaded_at?: string;
          status?: "pending_review" | "confirmed";
        };
        Relationships: [
          {
            foreignKeyName: "receipts_circle_id_fkey";
            columns: ["circle_id"];
            isOneToOne: false;
            referencedRelation: "circles";
            referencedColumns: ["id"];
          },
        ];
      };
      receipt_items: {
        Row: {
          id: string;
          receipt_id: string;
          raw_name_en: string;
          raw_name_zh: string | null;
          product_id: string | null;
          quantity: number;
          unit_spec_value: number | null;
          unit_spec_unit: string | null;
          unit_price: number;
          original_price: number | null;
          is_promotion: boolean;
          subtotal: number;
        };
        Insert: {
          id?: string;
          receipt_id: string;
          raw_name_en: string;
          raw_name_zh?: string | null;
          product_id?: string | null;
          quantity?: number;
          unit_spec_value?: number | null;
          unit_spec_unit?: string | null;
          unit_price: number;
          original_price?: number | null;
          is_promotion?: boolean;
          subtotal: number;
        };
        Update: {
          id?: string;
          receipt_id?: string;
          raw_name_en?: string;
          raw_name_zh?: string | null;
          product_id?: string | null;
          quantity?: number;
          unit_spec_value?: number | null;
          unit_spec_unit?: string | null;
          unit_price?: number;
          original_price?: number | null;
          is_promotion?: boolean;
          subtotal?: number;
        };
        Relationships: [
          {
            foreignKeyName: "receipt_items_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "receipts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipt_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      edit_logs: {
        Row: {
          id: string;
          receipt_id: string | null;
          receipt_item_id: string | null;
          field_name: string;
          old_value: string | null;
          new_value: string | null;
          edited_by: string;
          edited_at: string;
        };
        Insert: {
          id?: string;
          receipt_id?: string | null;
          receipt_item_id?: string | null;
          field_name: string;
          old_value?: string | null;
          new_value?: string | null;
          edited_by: string;
          edited_at?: string;
        };
        Update: {
          id?: string;
          receipt_id?: string | null;
          receipt_item_id?: string | null;
          field_name?: string;
          old_value?: string | null;
          new_value?: string | null;
          edited_by?: string;
          edited_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "edit_logs_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "receipts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "edit_logs_receipt_item_id_fkey";
            columns: ["receipt_item_id"];
            isOneToOne: false;
            referencedRelation: "receipt_items";
            referencedColumns: ["id"];
          },
        ];
      };
      alerts: {
        Row: {
          id: string;
          circle_id: string;
          type: "price_spike" | "low_stock";
          product_id: string;
          receipt_id: string | null;
          new_price: number | null;
          change_percent: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          circle_id: string;
          type: "price_spike" | "low_stock";
          product_id: string;
          receipt_id?: string | null;
          new_price?: number | null;
          change_percent?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          circle_id?: string;
          type?: "price_spike" | "low_stock";
          product_id?: string;
          receipt_id?: string | null;
          new_price?: number | null;
          change_percent?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alerts_circle_id_fkey";
            columns: ["circle_id"];
            isOneToOne: false;
            referencedRelation: "circles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alerts_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alerts_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "receipts";
            referencedColumns: ["id"];
          },
        ];
      };
      global_admins: {
        Row: {
          user_id: string;
        };
        Insert: {
          user_id: string;
        };
        Update: {
          user_id?: string;
        };
        Relationships: [];
      };
      user_ai_access: {
        Row: {
          user_id: string;
          cap_usd: number | null;
          spent_usd: number;
          free_trial_calls_used: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          cap_usd?: number | null;
          spent_usd?: number;
          free_trial_calls_used?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          cap_usd?: number | null;
          spent_usd?: number;
          free_trial_calls_used?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      // Superseded by user_ai_access (see CLAUDE.md) — still present in the
      // database, so it stays in the schema type.
      ai_spend_limit: {
        Row: {
          id: boolean;
          cap_usd: number;
          spent_usd: number;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          cap_usd?: number;
          spent_usd?: number;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          cap_usd?: number;
          spent_usd?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      merge_users_into_new_circle: {
        Args: { p_user_ids: string[] };
        Returns: string;
      };
      current_circle_id: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
