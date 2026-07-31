// hasat-core — BU DOSYAYI BURADA DÜZENLEME. Değişiklik hasat-core reposunda yapılır.
//
// Kaynak: `supabase gen types typescript` çıktısı — proje efuqpiaavrzimvstpdpm.
// Yeniden üretmek için:
//   supabase gen types typescript --project-id efuqpiaavrzimvstpdpm > core/db/types.ts
// ve üretim sonrası bu başlığı tekrar ekle.
// Son üretim: 2026-07-31 (P23-M5-a-ek — recipes.rest_minutes eklendi, M4-c'den beri bayat kalmıştı)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json
          page_context: string | null
          role: string
          session_id: string
          source: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json
          page_context?: string | null
          role: string
          session_id: string
          source?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json
          page_context?: string | null
          role?: string
          session_id?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_tracking: {
        Row: {
          message_count: number
          month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          message_count?: number
          month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          message_count?: number
          month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      buyer_addresses: {
        Row: {
          address: string
          buyer_id: string
          city: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          updated_at: string
        }
        Insert: {
          address: string
          buyer_id: string
          city: string
          created_at?: string
          id?: string
          is_default?: boolean
          label: string
          updated_at?: string
        }
        Update: {
          address?: string
          buyer_id?: string
          city?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      buyer_profiles: {
        Row: {
          company_name: string | null
          company_type: Database["public"]["Enums"]["company_type"]
          created_at: string
          id: string
          monthly_volume: string | null
          user_id: string
        }
        Insert: {
          company_name?: string | null
          company_type?: Database["public"]["Enums"]["company_type"]
          created_at?: string
          id?: string
          monthly_volume?: string | null
          user_id: string
        }
        Update: {
          company_name?: string | null
          company_type?: Database["public"]["Enums"]["company_type"]
          created_at?: string
          id?: string
          monthly_volume?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      certifications: {
        Row: {
          created_at: string
          document_url: string | null
          expires_at: string | null
          farmer_id: string
          id: string
          type: Database["public"]["Enums"]["certification_type"]
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          document_url?: string | null
          expires_at?: string | null
          farmer_id: string
          id?: string
          type: Database["public"]["Enums"]["certification_type"]
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          document_url?: string | null
          expires_at?: string | null
          farmer_id?: string
          id?: string
          type?: Database["public"]["Enums"]["certification_type"]
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certifications_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_post_likes: {
        Row: {
          post_id: string
          user_id: string
        }
        Insert: {
          post_id: string
          user_id: string
        }
        Update: {
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_id: string
          category: string
          comments_count: number
          content: string
          created_at: string
          flagged_for_review: boolean
          id: string
          likes_count: number
          parent_id: string | null
        }
        Insert: {
          author_id: string
          category?: string
          comments_count?: number
          content: string
          created_at?: string
          flagged_for_review?: boolean
          id?: string
          likes_count?: number
          parent_id?: string | null
        }
        Update: {
          author_id?: string
          category?: string
          comments_count?: number
          content?: string
          created_at?: string
          flagged_for_review?: boolean
          id?: string
          likes_count?: number
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      crop_config: {
        Row: {
          category_group: string | null
          crop: string
          default_photo_url: string | null
          default_unit: string
          display_name: string
          harvest_window_end_month: number | null
          harvest_window_start_month: number | null
          has_official_price_source: boolean
          is_seasonal_harvest: boolean
          lifecycle_steps: Json | null
          official_source_name: string | null
          price_benchmark_source: string | null
          price_window_type: string
        }
        Insert: {
          category_group?: string | null
          crop: string
          default_photo_url?: string | null
          default_unit?: string
          display_name: string
          harvest_window_end_month?: number | null
          harvest_window_start_month?: number | null
          has_official_price_source?: boolean
          is_seasonal_harvest?: boolean
          lifecycle_steps?: Json | null
          official_source_name?: string | null
          price_benchmark_source?: string | null
          price_window_type?: string
        }
        Update: {
          category_group?: string | null
          crop?: string
          default_photo_url?: string | null
          default_unit?: string
          display_name?: string
          harvest_window_end_month?: number | null
          harvest_window_start_month?: number | null
          has_official_price_source?: boolean
          is_seasonal_harvest?: boolean
          lifecycle_steps?: Json | null
          official_source_name?: string | null
          price_benchmark_source?: string | null
          price_window_type?: string
        }
        Relationships: []
      }
      crop_culinary_meta: {
        Row: {
          conversion_hints: Json
          created_at: string
          crop: string
          culinary_aliases: string[]
          is_edible: boolean
          updated_at: string
        }
        Insert: {
          conversion_hints?: Json
          created_at?: string
          crop: string
          culinary_aliases?: string[]
          is_edible?: boolean
          updated_at?: string
        }
        Update: {
          conversion_hints?: Json
          created_at?: string
          crop?: string
          culinary_aliases?: string[]
          is_edible?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crop_culinary_meta_crop_fkey"
            columns: ["crop"]
            isOneToOne: true
            referencedRelation: "crop_config"
            referencedColumns: ["crop"]
          },
        ]
      }
      crop_journal_glossary: {
        Row: {
          created_at: string
          crop: string
          explanation: string
          id: string
          term: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          crop: string
          explanation: string
          id?: string
          term: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          crop?: string
          explanation?: string
          id?: string
          term?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crop_journal_glossary_crop_fkey"
            columns: ["crop"]
            isOneToOne: false
            referencedRelation: "crop_config"
            referencedColumns: ["crop"]
          },
        ]
      }
      crop_market_sources: {
        Row: {
          crop: string
          source_code: string
        }
        Insert: {
          crop: string
          source_code: string
        }
        Update: {
          crop?: string
          source_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "crop_market_sources_source_code_fkey"
            columns: ["source_code"]
            isOneToOne: false
            referencedRelation: "market_sources"
            referencedColumns: ["code"]
          },
        ]
      }
      crop_requests: {
        Row: {
          created_at: string
          crop_name_free_text: string
          id: string
          note: string | null
          quantity: number | null
          region: string | null
          requested_by: string | null
          status: string
          target_date_end: string | null
          target_date_start: string | null
          target_price: number | null
          unit: string | null
        }
        Insert: {
          created_at?: string
          crop_name_free_text: string
          id?: string
          note?: string | null
          quantity?: number | null
          region?: string | null
          requested_by?: string | null
          status?: string
          target_date_end?: string | null
          target_date_start?: string | null
          target_price?: number | null
          unit?: string | null
        }
        Update: {
          created_at?: string
          crop_name_free_text?: string
          id?: string
          note?: string | null
          quantity?: number | null
          region?: string | null
          requested_by?: string | null
          status?: string
          target_date_end?: string | null
          target_date_start?: string | null
          target_price?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crop_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crop_type_requests: {
        Row: {
          created_at: string
          crop_name: string
          id: string
          lifecycle_notes: string | null
          note: string | null
          requested_by: string
          status: string
          suggested_category_group: string | null
          suggested_default_unit: string | null
          suggested_harvest_window_end_month: number | null
          suggested_harvest_window_start_month: number | null
        }
        Insert: {
          created_at?: string
          crop_name: string
          id?: string
          lifecycle_notes?: string | null
          note?: string | null
          requested_by: string
          status?: string
          suggested_category_group?: string | null
          suggested_default_unit?: string | null
          suggested_harvest_window_end_month?: number | null
          suggested_harvest_window_start_month?: number | null
        }
        Update: {
          created_at?: string
          crop_name?: string
          id?: string
          lifecycle_notes?: string | null
          note?: string | null
          requested_by?: string
          status?: string
          suggested_category_group?: string | null
          suggested_default_unit?: string | null
          suggested_harvest_window_end_month?: number | null
          suggested_harvest_window_start_month?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crop_type_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_type_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          created_at: string
          evidence_photo_urls: string[]
          id: string
          opened_by: string
          order_id: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          status: string
          window_expires_at: string | null
        }
        Insert: {
          created_at?: string
          evidence_photo_urls?: string[]
          id?: string
          opened_by: string
          order_id: string
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          window_expires_at?: string | null
        }
        Update: {
          created_at?: string
          evidence_photo_urls?: string[]
          id?: string
          opened_by?: string
          order_id?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          window_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_kpi_order_base"
            referencedColumns: ["order_id"]
          },
        ]
      }
      farmer_journal_prefs: {
        Row: {
          created_at: string
          entry_type_id: string
          farmer_id: string
          frequency_days: number | null
          id: string
          is_active: boolean
          threshold_note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entry_type_id: string
          farmer_id: string
          frequency_days?: number | null
          id?: string
          is_active?: boolean
          threshold_note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entry_type_id?: string
          farmer_id?: string
          frequency_days?: number | null
          id?: string
          is_active?: boolean
          threshold_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "farmer_journal_prefs_entry_type_id_fkey"
            columns: ["entry_type_id"]
            isOneToOne: false
            referencedRelation: "journal_entry_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_journal_prefs_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_journal_prefs_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      farms: {
        Row: {
          created_at: string
          farmer_id: string
          id: string
        }
        Insert: {
          created_at?: string
          farmer_id: string
          id?: string
        }
        Update: {
          created_at?: string
          farmer_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "farms_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farms_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      harvest_entries: {
        Row: {
          costs: Json
          created_at: string
          crop: string
          farmer_id: string
          harvest_date: string
          id: string
          journal_entry_type_id: string | null
          notes: string | null
          parcel_id: string
          photo_urls: string[] | null
          quality: Database["public"]["Enums"]["quality_grade"]
          quantity: number
          step_key: string | null
          unit: Database["public"]["Enums"]["unit_type"]
          updated_at: string
        }
        Insert: {
          costs?: Json
          created_at?: string
          crop: string
          farmer_id: string
          harvest_date: string
          id?: string
          journal_entry_type_id?: string | null
          notes?: string | null
          parcel_id: string
          photo_urls?: string[] | null
          quality?: Database["public"]["Enums"]["quality_grade"]
          quantity: number
          step_key?: string | null
          unit?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Update: {
          costs?: Json
          created_at?: string
          crop?: string
          farmer_id?: string
          harvest_date?: string
          id?: string
          journal_entry_type_id?: string | null
          notes?: string | null
          parcel_id?: string
          photo_urls?: string[] | null
          quality?: Database["public"]["Enums"]["quality_grade"]
          quantity?: number
          step_key?: string | null
          unit?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "harvest_entries_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_entries_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_entries_journal_entry_type_id_fkey"
            columns: ["journal_entry_type_id"]
            isOneToOne: false
            referencedRelation: "journal_entry_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_entries_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "parcels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_entries_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "public_parcel_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_entries_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "v_routine_maintenance_status"
            referencedColumns: ["parcel_id"]
          },
        ]
      }
      harvest_subscriptions: {
        Row: {
          buyer_id: string
          created_at: string
          crop: string | null
          estimated_qty: number | null
          farmer_id: string
          id: string
          locked_at: string | null
          locked_price: number | null
          next_harvest_date: string | null
          note: string | null
          price_lock: boolean
          status: Database["public"]["Enums"]["subscription_status"]
          volume_commitment: number | null
        }
        Insert: {
          buyer_id: string
          created_at?: string
          crop?: string | null
          estimated_qty?: number | null
          farmer_id: string
          id?: string
          locked_at?: string | null
          locked_price?: number | null
          next_harvest_date?: string | null
          note?: string | null
          price_lock?: boolean
          status?: Database["public"]["Enums"]["subscription_status"]
          volume_commitment?: number | null
        }
        Update: {
          buyer_id?: string
          created_at?: string
          crop?: string | null
          estimated_qty?: number | null
          farmer_id?: string
          id?: string
          locked_at?: string | null
          locked_price?: number | null
          next_harvest_date?: string | null
          note?: string | null
          price_lock?: boolean
          status?: Database["public"]["Enums"]["subscription_status"]
          volume_commitment?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "harvest_subscriptions_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_subscriptions_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_subscriptions_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_subscriptions_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      indoor_interest_leads: {
        Row: {
          city: string | null
          created_at: string
          id: string
          interest_type: string | null
          name: string
          note: string | null
          phone: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          interest_type?: string | null
          name: string
          note?: string | null
          phone: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          interest_type?: string | null
          name?: string
          note?: string | null
          phone?: string
        }
        Relationships: []
      }
      journal_entry_types: {
        Row: {
          created_at: string
          crop: string | null
          default_frequency_days: number | null
          farmer_id: string | null
          icon: string | null
          id: string
          is_preset: boolean
          name: string
          sort_order: number
          theme_id: string
          work_type_key: string
        }
        Insert: {
          created_at?: string
          crop?: string | null
          default_frequency_days?: number | null
          farmer_id?: string | null
          icon?: string | null
          id?: string
          is_preset?: boolean
          name: string
          sort_order?: number
          theme_id: string
          work_type_key?: string
        }
        Update: {
          created_at?: string
          crop?: string | null
          default_frequency_days?: number | null
          farmer_id?: string | null
          icon?: string | null
          id?: string
          is_preset?: boolean
          name?: string
          sort_order?: number
          theme_id?: string
          work_type_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_types_crop_fkey"
            columns: ["crop"]
            isOneToOne: false
            referencedRelation: "crop_config"
            referencedColumns: ["crop"]
          },
          {
            foreignKeyName: "journal_entry_types_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_types_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_types_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "journal_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_themes: {
        Row: {
          created_at: string
          crop: string | null
          icon: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          crop?: string | null
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          crop?: string | null
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_themes_crop_fkey"
            columns: ["crop"]
            isOneToOne: false
            referencedRelation: "crop_config"
            referencedColumns: ["crop"]
          },
        ]
      }
      listing_harvest_entries: {
        Row: {
          created_at: string
          harvest_entry_id: string
          listing_id: string
        }
        Insert: {
          created_at?: string
          harvest_entry_id: string
          listing_id: string
        }
        Update: {
          created_at?: string
          harvest_entry_id?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_harvest_entries_harvest_entry_id_fkey"
            columns: ["harvest_entry_id"]
            isOneToOne: false
            referencedRelation: "harvest_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_harvest_entries_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          batch_name: string | null
          created_at: string
          crop: string
          description: string | null
          farmer_id: string
          harvest_entry_id: string | null
          id: string
          min_order: number
          parcel_id: string | null
          photo_urls: string[] | null
          price_per_unit: number
          quality: Database["public"]["Enums"]["quality_grade"]
          quantity: number
          status: Database["public"]["Enums"]["listing_status"]
          unit: Database["public"]["Enums"]["unit_type"]
          updated_at: string
        }
        Insert: {
          batch_name?: string | null
          created_at?: string
          crop: string
          description?: string | null
          farmer_id: string
          harvest_entry_id?: string | null
          id?: string
          min_order?: number
          parcel_id?: string | null
          photo_urls?: string[] | null
          price_per_unit: number
          quality?: Database["public"]["Enums"]["quality_grade"]
          quantity: number
          status?: Database["public"]["Enums"]["listing_status"]
          unit?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Update: {
          batch_name?: string | null
          created_at?: string
          crop?: string
          description?: string | null
          farmer_id?: string
          harvest_entry_id?: string | null
          id?: string
          min_order?: number
          parcel_id?: string | null
          photo_urls?: string[] | null
          price_per_unit?: number
          quality?: Database["public"]["Enums"]["quality_grade"]
          quantity?: number
          status?: Database["public"]["Enums"]["listing_status"]
          unit?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_harvest_entry_id_fkey"
            columns: ["harvest_entry_id"]
            isOneToOne: false
            referencedRelation: "harvest_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "parcels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "public_parcel_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "v_routine_maintenance_status"
            referencedColumns: ["parcel_id"]
          },
        ]
      }
      market_sources: {
        Row: {
          code: string
          created_at: string
          display_name: string
          region: string | null
        }
        Insert: {
          code: string
          created_at?: string
          display_name: string
          region?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          display_name?: string
          region?: string | null
        }
        Relationships: []
      }
      mcp_tool_calls: {
        Row: {
          called_at: string
          id: number
          user_id: string
        }
        Insert: {
          called_at?: string
          id?: number
          user_id: string
        }
        Update: {
          called_at?: string
          id?: number
          user_id?: string
        }
        Relationships: []
      }
      notif_prefs: {
        Row: {
          community_push: boolean
          crop_request_match_sms: boolean
          dispute_opened_sms: boolean
          harvest_time_push: boolean
          harvest_time_sms: boolean
          harvest_time_whatsapp: boolean
          new_offer_push: boolean
          new_offer_sms: boolean
          new_offer_whatsapp: boolean
          offer_accepted_sms: boolean
          order_cancelled_sms: boolean
          order_delivered_sms: boolean
          order_shipped_sms: boolean
          payment_confirmed_sms: boolean
          price_alert_push: boolean
          price_alert_sms: boolean
          price_alert_whatsapp: boolean
          subscription_accepted_sms: boolean
          subscription_new_sms: boolean
          subscription_rejected_sms: boolean
          user_id: string
        }
        Insert: {
          community_push?: boolean
          crop_request_match_sms?: boolean
          dispute_opened_sms?: boolean
          harvest_time_push?: boolean
          harvest_time_sms?: boolean
          harvest_time_whatsapp?: boolean
          new_offer_push?: boolean
          new_offer_sms?: boolean
          new_offer_whatsapp?: boolean
          offer_accepted_sms?: boolean
          order_cancelled_sms?: boolean
          order_delivered_sms?: boolean
          order_shipped_sms?: boolean
          payment_confirmed_sms?: boolean
          price_alert_push?: boolean
          price_alert_sms?: boolean
          price_alert_whatsapp?: boolean
          subscription_accepted_sms?: boolean
          subscription_new_sms?: boolean
          subscription_rejected_sms?: boolean
          user_id: string
        }
        Update: {
          community_push?: boolean
          crop_request_match_sms?: boolean
          dispute_opened_sms?: boolean
          harvest_time_push?: boolean
          harvest_time_sms?: boolean
          harvest_time_whatsapp?: boolean
          new_offer_push?: boolean
          new_offer_sms?: boolean
          new_offer_whatsapp?: boolean
          offer_accepted_sms?: boolean
          order_cancelled_sms?: boolean
          order_delivered_sms?: boolean
          order_shipped_sms?: boolean
          payment_confirmed_sms?: boolean
          price_alert_push?: boolean
          price_alert_sms?: boolean
          price_alert_whatsapp?: boolean
          subscription_accepted_sms?: boolean
          subscription_new_sms?: boolean
          subscription_rejected_sms?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notif_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notif_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          read_at: string | null
          related_id: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          read_at?: string | null
          related_id?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          read_at?: string | null
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_items: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          offer_id: string
          price_per_unit: number
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          offer_id: string
          price_per_unit: number
          quantity: number
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          offer_id?: string
          price_per_unit?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "offer_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_items_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_messages: {
        Row: {
          created_at: string
          id: string
          note: string | null
          offer_id: string
          price: number | null
          quantity: number | null
          sender_id: string
          sender_role: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          offer_id: string
          price?: number | null
          quantity?: number | null
          sender_id: string
          sender_role: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          offer_id?: string
          price?: number | null
          quantity?: number | null
          sender_id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_messages_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          ball_side: string
          buyer_id: string
          counter_offer: Json | null
          created_at: string
          current_price: number | null
          current_quantity: number | null
          delivery: Database["public"]["Enums"]["delivery_type"]
          delivery_date: string | null
          farmer_id: string
          id: string
          listing_id: string
          negotiation_history: Json
          note: string | null
          payment_status: string
          price_per_unit: number
          quantity: number
          source_recipe_id: string | null
          status: Database["public"]["Enums"]["offer_status"]
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          ball_side?: string
          buyer_id: string
          counter_offer?: Json | null
          created_at?: string
          current_price?: number | null
          current_quantity?: number | null
          delivery?: Database["public"]["Enums"]["delivery_type"]
          delivery_date?: string | null
          farmer_id: string
          id?: string
          listing_id: string
          negotiation_history?: Json
          note?: string | null
          payment_status?: string
          price_per_unit: number
          quantity: number
          source_recipe_id?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          ball_side?: string
          buyer_id?: string
          counter_offer?: Json | null
          created_at?: string
          current_price?: number | null
          current_quantity?: number | null
          delivery?: Database["public"]["Enums"]["delivery_type"]
          delivery_date?: string | null
          farmer_id?: string
          id?: string
          listing_id?: string
          negotiation_history?: Json
          note?: string | null
          payment_status?: string
          price_per_unit?: number
          quantity?: number
          source_recipe_id?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "v_kpi_recipe_funnel_by_recipe"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "offers_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "v_recipe_coverage"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "offers_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "harvest_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_timeline: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          label: string
          order_id: string
          step: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          label: string
          order_id: string
          step: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          label?: string
          order_id?: string
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_timeline_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_timeline_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_kpi_order_base"
            referencedColumns: ["order_id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          carrier: string | null
          created_at: string
          dispute_window_expires_at: string | null
          farmer_id: string
          id: string
          offer_id: string
          order_ref: string
          status: Database["public"]["Enums"]["order_status"]
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          buyer_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          created_at?: string
          dispute_window_expires_at?: string | null
          farmer_id: string
          id?: string
          offer_id: string
          order_ref: string
          status?: Database["public"]["Enums"]["order_status"]
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          created_at?: string
          dispute_window_expires_at?: string | null
          farmer_id?: string
          id?: string
          offer_id?: string
          order_ref?: string
          status?: Database["public"]["Enums"]["order_status"]
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      parcels: {
        Row: {
          area: number
          created_at: string
          crops: string[]
          farm_id: string
          farmer_id: string
          id: string
          is_primary: boolean | null
          lat: number | null
          lng: number | null
          location_label: string | null
          name: string
          parcel_photo_urls: string[]
          production_method: string | null
        }
        Insert: {
          area: number
          created_at?: string
          crops?: string[]
          farm_id: string
          farmer_id: string
          id?: string
          is_primary?: boolean | null
          lat?: number | null
          lng?: number | null
          location_label?: string | null
          name: string
          parcel_photo_urls?: string[]
          production_method?: string | null
        }
        Update: {
          area?: number
          created_at?: string
          crops?: string[]
          farm_id?: string
          farmer_id?: string
          id?: string
          is_primary?: boolean | null
          lat?: number | null
          lng?: number | null
          location_label?: string | null
          name?: string
          parcel_photo_urls?: string[]
          production_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parcels_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcels_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcels_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      price_alerts: {
        Row: {
          active: boolean
          channels: Database["public"]["Enums"]["notif_channel"][]
          condition: Database["public"]["Enums"]["price_alert_condition"]
          created_at: string
          crop: string
          farmer_id: string
          id: string
          target_price: number
        }
        Insert: {
          active?: boolean
          channels?: Database["public"]["Enums"]["notif_channel"][]
          condition: Database["public"]["Enums"]["price_alert_condition"]
          created_at?: string
          crop: string
          farmer_id: string
          id?: string
          target_price: number
        }
        Update: {
          active?: boolean
          channels?: Database["public"]["Enums"]["notif_channel"][]
          condition?: Database["public"]["Enums"]["price_alert_condition"]
          created_at?: string
          crop?: string
          farmer_id?: string
          id?: string
          target_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_alerts_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_alerts_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          created_at: string
          crop: string
          farmer_id: string | null
          id: string
          market_source_code: string | null
          order_id: string | null
          price_per_unit: number
          recorded_date: string
          region: string | null
          source: string
          unit: string
        }
        Insert: {
          created_at?: string
          crop: string
          farmer_id?: string | null
          id?: string
          market_source_code?: string | null
          order_id?: string | null
          price_per_unit: number
          recorded_date: string
          region?: string | null
          source: string
          unit: string
        }
        Update: {
          created_at?: string
          crop?: string
          farmer_id?: string | null
          id?: string
          market_source_code?: string | null
          order_id?: string | null
          price_per_unit?: number
          recorded_date?: string
          region?: string | null
          source?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_crop_fkey"
            columns: ["crop"]
            isOneToOne: false
            referencedRelation: "crop_config"
            referencedColumns: ["crop"]
          },
          {
            foreignKeyName: "price_history_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_market_source_code_fkey"
            columns: ["market_source_code"]
            isOneToOne: false
            referencedRelation: "market_sources"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "price_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_kpi_order_base"
            referencedColumns: ["order_id"]
          },
        ]
      }
      price_points: {
        Row: {
          created_at: string
          crop: string
          d2c_price: number | null
          delta_7d: number | null
          export_price: number | null
          hal_price: number | null
          id: string
          recorded_date: string
        }
        Insert: {
          created_at?: string
          crop: string
          d2c_price?: number | null
          delta_7d?: number | null
          export_price?: number | null
          hal_price?: number | null
          id?: string
          recorded_date?: string
        }
        Update: {
          created_at?: string
          crop?: string
          d2c_price?: number | null
          delta_7d?: number | null
          export_price?: number | null
          hal_price?: number | null
          id?: string
          recorded_date?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          bank_account_name: string | null
          buyer_type: Database["public"]["Enums"]["company_type"] | null
          city: string | null
          created_at: string
          iban: string | null
          id: string
          name: string | null
          phone: string | null
          premium: boolean
          premium_until: string | null
          referral_code: string | null
          referred_by: string | null
          role: Database["public"]["Enums"]["user_role"]
          tier: Database["public"]["Enums"]["user_tier"]
          updated_at: string
        }
        Insert: {
          bank_account_name?: string | null
          buyer_type?: Database["public"]["Enums"]["company_type"] | null
          city?: string | null
          created_at?: string
          iban?: string | null
          id: string
          name?: string | null
          phone?: string | null
          premium?: boolean
          premium_until?: string | null
          referral_code?: string | null
          referred_by?: string | null
          role: Database["public"]["Enums"]["user_role"]
          tier?: Database["public"]["Enums"]["user_tier"]
          updated_at?: string
        }
        Update: {
          bank_account_name?: string | null
          buyer_type?: Database["public"]["Enums"]["company_type"] | null
          city?: string | null
          created_at?: string
          iban?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          premium?: boolean
          premium_until?: string | null
          referral_code?: string | null
          referred_by?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          tier?: Database["public"]["Enums"]["user_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          crop: string | null
          free_text_name: string | null
          id: string
          is_key_ingredient: boolean
          note: string | null
          quantity: number | null
          recipe_id: string
          sort_order: number
          unit: string | null
        }
        Insert: {
          created_at?: string
          crop?: string | null
          free_text_name?: string | null
          id?: string
          is_key_ingredient?: boolean
          note?: string | null
          quantity?: number | null
          recipe_id: string
          sort_order?: number
          unit?: string | null
        }
        Update: {
          created_at?: string
          crop?: string | null
          free_text_name?: string | null
          id?: string
          is_key_ingredient?: boolean
          note?: string | null
          quantity?: number | null
          recipe_id?: string
          sort_order?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_crop_fkey"
            columns: ["crop"]
            isOneToOne: false
            referencedRelation: "crop_config"
            referencedColumns: ["crop"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_kpi_recipe_funnel_by_recipe"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_recipe_coverage"
            referencedColumns: ["recipe_id"]
          },
        ]
      }
      recipe_rfq_links: {
        Row: {
          created_at: string
          crop_request_id: string
          id: string
          recipe_id: string
        }
        Insert: {
          created_at?: string
          crop_request_id: string
          id?: string
          recipe_id: string
        }
        Update: {
          created_at?: string
          crop_request_id?: string
          id?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_rfq_links_crop_request_id_fkey"
            columns: ["crop_request_id"]
            isOneToOne: false
            referencedRelation: "crop_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_rfq_links_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_rfq_links_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_kpi_recipe_funnel_by_recipe"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "recipe_rfq_links_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_recipe_coverage"
            referencedColumns: ["recipe_id"]
          },
        ]
      }
      recipe_saves: {
        Row: {
          created_at: string
          id: string
          recipe_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          recipe_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          recipe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_saves_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_saves_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_kpi_recipe_funnel_by_recipe"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "recipe_saves_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_recipe_coverage"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "recipe_saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_steps: {
        Row: {
          created_at: string
          id: string
          instruction: string
          photo_url: string | null
          recipe_id: string
          step_no: number
          timer_seconds: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          instruction: string
          photo_url?: string | null
          recipe_id: string
          step_no: number
          timer_seconds?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          instruction?: string
          photo_url?: string | null
          recipe_id?: string
          step_no?: number
          timer_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_kpi_recipe_funnel_by_recipe"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "recipe_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_recipe_coverage"
            referencedColumns: ["recipe_id"]
          },
        ]
      }
      recipe_views: {
        Row: {
          created_at: string
          id: string
          recipe_id: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          recipe_id: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          recipe_id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_views_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_views_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_kpi_recipe_funnel_by_recipe"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "recipe_views_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_recipe_coverage"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "recipe_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          author_type: string
          cook_minutes: number | null
          cover_photo_url: string | null
          created_at: string
          cuisine: string | null
          description: string | null
          diet_tags: string[]
          difficulty: string | null
          extraction_confidence: number | null
          id: string
          owner_id: string | null
          prep_minutes: number | null
          rest_minutes: number | null
          servings: number | null
          slug: string
          source_type: string
          source_url: string | null
          status: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          author_type?: string
          cook_minutes?: number | null
          cover_photo_url?: string | null
          created_at?: string
          cuisine?: string | null
          description?: string | null
          diet_tags?: string[]
          difficulty?: string | null
          extraction_confidence?: number | null
          id?: string
          owner_id?: string | null
          prep_minutes?: number | null
          rest_minutes?: number | null
          servings?: number | null
          slug: string
          source_type?: string
          source_url?: string | null
          status?: string
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_type?: string
          cook_minutes?: number | null
          cover_photo_url?: string | null
          created_at?: string
          cuisine?: string | null
          description?: string | null
          diet_tags?: string[]
          difficulty?: string | null
          extraction_confidence?: number | null
          id?: string
          owner_id?: string | null
          prep_minutes?: number | null
          rest_minutes?: number | null
          servings?: number | null
          slug?: string
          source_type?: string
          source_url?: string | null
          status?: string
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_qualifications: {
        Row: {
          id: string
          qualified_at: string
          referred_user_id: string
          referrer_id: string
        }
        Insert: {
          id?: string
          qualified_at?: string
          referred_user_id: string
          referrer_id: string
        }
        Update: {
          id?: string
          qualified_at?: string
          referred_user_id?: string
          referrer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_qualifications_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_qualifications_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: true
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_qualifications_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_qualifications_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          order_id: string
          rating: number
          reviewee_id: string
          reviewer_id: string
          reviewer_role: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          rating: number
          reviewee_id: string
          reviewer_id: string
          reviewer_role: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          rating?: number
          reviewee_id?: string
          reviewer_id?: string
          reviewer_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_kpi_order_base"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_certifications: {
        Row: {
          created_at: string | null
          expires_at: string | null
          farmer_id: string | null
          id: string | null
          type: Database["public"]["Enums"]["certification_type"] | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          farmer_id?: string | null
          id?: string | null
          type?: Database["public"]["Enums"]["certification_type"] | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          farmer_id?: string | null
          id?: string | null
          type?: Database["public"]["Enums"]["certification_type"] | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certifications_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_farmer_profiles: {
        Row: {
          city: string | null
          created_at: string | null
          id: string | null
          name: string | null
          premium: boolean | null
          referral_code: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          tier: Database["public"]["Enums"]["user_tier"] | null
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          premium?: boolean | null
          referral_code?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          tier?: Database["public"]["Enums"]["user_tier"] | null
        }
        Update: {
          city?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          premium?: boolean | null
          referral_code?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          tier?: Database["public"]["Enums"]["user_tier"] | null
        }
        Relationships: []
      }
      public_parcel_cards: {
        Row: {
          area: number | null
          created_at: string | null
          crops: string[] | null
          farm_id: string | null
          farmer_id: string | null
          id: string | null
          is_primary: boolean | null
          location_label: string | null
          name: string | null
          parcel_photo_urls: string[] | null
          production_method: string | null
        }
        Insert: {
          area?: number | null
          created_at?: string | null
          crops?: string[] | null
          farm_id?: string | null
          farmer_id?: string | null
          id?: string | null
          is_primary?: boolean | null
          location_label?: string | null
          name?: string | null
          parcel_photo_urls?: string[] | null
          production_method?: string | null
        }
        Update: {
          area?: number | null
          created_at?: string | null
          crops?: string[] | null
          farm_id?: string | null
          farmer_id?: string | null
          id?: string | null
          is_primary?: boolean | null
          location_label?: string | null
          name?: string | null
          parcel_photo_urls?: string[] | null
          production_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parcels_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcels_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcels_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_kpi_buyer_activation: {
        Row: {
          buyers_with_order: number | null
          median_days_to_first_order: number | null
          total_buyers: number | null
        }
        Relationships: []
      }
      v_kpi_buyer_aov_segment: {
        Row: {
          aov: number | null
          realized_order_count: number | null
          segment: string | null
        }
        Relationships: []
      }
      v_kpi_buyer_gmv_retention: {
        Row: {
          cohort_buyers: number | null
          cohort_month: string | null
          m0_gmv_total: number | null
          m1_gmv_retention_pct: number | null
          m1_gmv_total: number | null
        }
        Relationships: []
      }
      v_kpi_buyer_repeat_rate: {
        Row: {
          active_buyers: number | null
          repeat_buyer_rate_pct: number | null
          repeat_buyers: number | null
          segment: string | null
        }
        Relationships: []
      }
      v_kpi_buyer_seller_ratio: {
        Row: {
          active_buyer_count: number | null
          active_farmer_count: number | null
          buyer_to_seller_ratio: number | null
          region: string | null
        }
        Relationships: []
      }
      v_kpi_crop_demand_heatmap: {
        Row: {
          crop: string | null
          crop_display_name: string | null
          has_active_listing: boolean | null
          key_ingredient_recipe_count: number | null
          normalized_unit: string | null
          regions: string[] | null
          requested_recipe_titles: string[] | null
          requester_count: number | null
          total_quantity_normalized: number | null
        }
        Relationships: []
      }
      v_kpi_dispute_rate: {
        Row: {
          delivered_or_completed_orders: number | null
          dispute_rate_pct: number | null
          disputed_orders: number | null
          month: string | null
        }
        Relationships: []
      }
      v_kpi_farmer_activation: {
        Row: {
          farmers_with_listing: number | null
          median_hours_to_first_listing: number | null
          pct_listing_within_7d: number | null
          total_farmers: number | null
        }
        Relationships: []
      }
      v_kpi_farmer_gmv: {
        Row: {
          active_farmers: number | null
          gmv_per_active_farmer: number | null
          month: string | null
          total_gmv: number | null
        }
        Relationships: []
      }
      v_kpi_farmer_retention: {
        Row: {
          cohort_farmers: number | null
          cohort_month: string | null
          m1_retention_pct: number | null
          m3_retention_pct: number | null
          retained_m1: number | null
          retained_m3: number | null
        }
        Relationships: []
      }
      v_kpi_farmer_sellthrough: {
        Row: {
          eligible_listings: number | null
          sellthrough_30d_pct: number | null
          sold_within_30d: number | null
        }
        Relationships: []
      }
      v_kpi_farmer_verified_pct: {
        Row: {
          active_farmer_count: number | null
          verified_active_farmer_count: number | null
          verified_pct: number | null
        }
        Relationships: []
      }
      v_kpi_full_acceptance_rate: {
        Row: {
          delivered_or_completed_orders: number | null
          full_acceptance_rate_pct: number | null
          fully_accepted_orders: number | null
          month: string | null
        }
        Relationships: []
      }
      v_kpi_horeca_order_frequency: {
        Row: {
          avg_weekly_order_frequency: number | null
          horeca_buyers_with_2plus_orders: number | null
          median_weekly_order_frequency: number | null
        }
        Relationships: []
      }
      v_kpi_listing_offer_rate: {
        Row: {
          eligible_listings: number | null
          listings_with_offer_14d: number | null
          median_hours_to_first_offer: number | null
          offer_rate_14d_pct: number | null
        }
        Relationships: []
      }
      v_kpi_north_star: {
        Row: {
          dispute_free_gmv: number | null
          dispute_free_share_pct: number | null
          month: string | null
          total_gmv: number | null
        }
        Relationships: []
      }
      v_kpi_offer_conversion: {
        Row: {
          conversion_pct: number | null
          converted_offers: number | null
          median_hours_offer_to_order: number | null
          total_offers: number | null
        }
        Relationships: []
      }
      v_kpi_order_base: {
        Row: {
          amount: number | null
          buyer_company_type: Database["public"]["Enums"]["company_type"] | null
          buyer_id: string | null
          created_at: string | null
          crop: string | null
          farmer_city: string | null
          farmer_id: string | null
          has_dispute: boolean | null
          is_realized_sale: boolean | null
          offer_id: string | null
          order_id: string | null
          order_ref: string | null
          order_status: Database["public"]["Enums"]["order_status"] | null
          payment_status: string | null
          reached_delivery: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_kpi_price_vs_market: {
        Row: {
          crop: string | null
          hasat_avg_price: number | null
          market_avg_price: number | null
          month: string | null
          price_diff_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_crop_fkey"
            columns: ["crop"]
            isOneToOne: false
            referencedRelation: "crop_config"
            referencedColumns: ["crop"]
          },
        ]
      }
      v_kpi_recipe_funnel: {
        Row: {
          month: string | null
          offer_to_order_pct: number | null
          recipe_offers: number | null
          recipe_offers_converted: number | null
          recipe_orders: number | null
          recipe_requests: number | null
          recipe_saves: number | null
          recipe_views: number | null
          unique_viewers: number | null
          view_to_save_pct: number | null
        }
        Relationships: []
      }
      v_kpi_recipe_funnel_by_recipe: {
        Row: {
          offer_to_order_pct: number | null
          recipe_id: string | null
          recipe_offers: number | null
          recipe_offers_converted: number | null
          recipe_orders: number | null
          recipe_requests: number | null
          recipe_saves: number | null
          recipe_views: number | null
          slug: string | null
          title: string | null
          unique_viewers: number | null
          view_to_save_pct: number | null
        }
        Relationships: []
      }
      v_kpi_review_avg: {
        Row: {
          avg_rating: number | null
          review_count: number | null
          reviewee_id: string | null
          reviewee_role: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_kpi_supply_density: {
        Row: {
          dense_cell_pct: number | null
          dense_cells: number | null
          total_cells: number | null
        }
        Relationships: []
      }
      v_recipe_coverage: {
        Row: {
          available_count: number | null
          coverage_pct: number | null
          crop_linked_count: number | null
          ingredient_count: number | null
          key_available_count: number | null
          key_ingredient_count: number | null
          off_platform_count: number | null
          recipe_id: string | null
          slug: string | null
          status: string | null
          title: string | null
          visibility: string | null
        }
        Relationships: []
      }
      v_routine_maintenance_status: {
        Row: {
          crop: string | null
          entry_type_icon: string | null
          entry_type_id: string | null
          entry_type_name: string | null
          farmer_id: string | null
          frequency_days: number | null
          is_event_based: boolean | null
          is_overdue: boolean | null
          last_performed_date: string | null
          never_performed: boolean | null
          next_due_date: string | null
          parcel_id: string | null
          parcel_name: string | null
          pref_id: string | null
          threshold_note: string | null
          work_type_key: string | null
        }
        Relationships: [
          {
            foreignKeyName: "farmer_journal_prefs_entry_type_id_fkey"
            columns: ["entry_type_id"]
            isOneToOne: false
            referencedRelation: "journal_entry_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_journal_prefs_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_journal_prefs_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "public_farmer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_send_ai_message: { Args: { _user_id: string }; Returns: boolean }
      check_and_record_mcp_call: { Args: never; Returns: boolean }
      create_draft_listings_for_parcel: {
        Args: { _crops: string[]; _farmer_id: string; _parcel_id: string }
        Returns: undefined
      }
      dispatch_sms: {
        Args: { _event: string; _message: string; _user_id: string }
        Returns: undefined
      }
      fn_culinary_to_canonical: {
        Args: { p_crop: string; p_quantity: number; p_unit: string }
        Returns: number
      }
      get_buyer_rating_summary: {
        Args: { _buyer_id: string }
        Returns: {
          avg_rating: number
          review_count: number
        }[]
      }
      get_farmer_rating_summary: {
        Args: { _farmer_id: string }
        Returns: {
          avg_rating: number
          review_count: number
        }[]
      }
      get_my_role: { Args: never; Returns: string }
      get_my_role_for_offer: {
        Args: { offer_row: Database["public"]["Tables"]["offers"]["Row"] }
        Returns: string
      }
      get_price_history_series: {
        Args: { p_crop: string; p_weeks?: number }
        Returns: Json
      }
      get_price_history_summary: { Args: { p_crop: string }; Returns: Json }
      get_subscription_fulfillment: {
        Args: { _subscription_id: string }
        Returns: {
          delivered_qty: number
          order_count: number
        }[]
      }
      increment_ai_usage: { Args: { _user_id: string }; Returns: number }
      rpc_recipe_availability: {
        Args: { p_recipe_id: string }
        Returns: {
          active_listing_count: number
          best_price_per_canonical: number
          canonical_unit: string
          crop: string
          crop_display_name: string
          crop_photo_url: string
          free_text_name: string
          ingredient_id: string
          is_key_ingredient: boolean
          is_matched: boolean
          is_platform_crop: boolean
          quantity: number
          sort_order: number
          unit: string
        }[]
      }
      rpc_recipe_shopping_list: {
        Args: { p_recipe_id: string; p_servings?: number }
        Returns: {
          best_price_per_canonical: number
          canonical_unit: string
          conversion_available: boolean
          crop: string
          crop_display_name: string
          estimated_cost: number
          free_text_name: string
          ingredient_id: string
          is_matched: boolean
          is_platform_crop: boolean
          min_order_canonical: number
          needed_canonical: number
          purchase_canonical: number
          recipe_quantity: number
          recipe_servings: number
          recipe_unit: string
          recipes_covered: number
          requested_servings: number
          rounded_up_to_min_order: boolean
          scale_factor: number
          scaled_quantity: number
          sort_order: number
        }[]
      }
      send_subscription_harvest_reminders: { Args: never; Returns: undefined }
    }
    Enums: {
      certification_type:
        | "organik"
        | "iso"
        | "cografi"
        | "hasat"
        | "premium"
        | "yeni"
      company_type:
        | "restoran"
        | "otel"
        | "organik_market"
        | "ihracatci"
        | "diger"
        | "bireysel"
      delivery_type: "kargo-buyer" | "kargo-seller" | "elden"
      listing_status: "draft" | "active" | "sold" | "expired"
      notif_channel: "whatsapp" | "push" | "sms"
      offer_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "counter"
        | "completed"
        | "pending_farmer"
        | "pending_buyer"
      order_status:
        | "preparing"
        | "shipped"
        | "delivered"
        | "disputed"
        | "completed"
        | "cancelled"
      price_alert_condition: "above" | "below"
      quality_grade: "A" | "B" | "C"
      subscription_status:
        | "pending"
        | "active"
        | "paused"
        | "fulfilled"
        | "cancelled"
      unit_type: "g" | "kg" | "L"
      user_role: "farmer" | "buyer"
      user_tier: "free" | "premium"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      certification_type: [
        "organik",
        "iso",
        "cografi",
        "hasat",
        "premium",
        "yeni",
      ],
      company_type: [
        "restoran",
        "otel",
        "organik_market",
        "ihracatci",
        "diger",
        "bireysel",
      ],
      delivery_type: ["kargo-buyer", "kargo-seller", "elden"],
      listing_status: ["draft", "active", "sold", "expired"],
      notif_channel: ["whatsapp", "push", "sms"],
      offer_status: [
        "pending",
        "accepted",
        "rejected",
        "counter",
        "completed",
        "pending_farmer",
        "pending_buyer",
      ],
      order_status: [
        "preparing",
        "shipped",
        "delivered",
        "disputed",
        "completed",
        "cancelled",
      ],
      price_alert_condition: ["above", "below"],
      quality_grade: ["A", "B", "C"],
      subscription_status: [
        "pending",
        "active",
        "paused",
        "fulfilled",
        "cancelled",
      ],
      unit_type: ["g", "kg", "L"],
      user_role: ["farmer", "buyer"],
      user_tier: ["free", "premium"],
    },
  },
} as const
