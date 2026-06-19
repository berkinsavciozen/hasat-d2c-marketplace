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
      buyer_profiles: {
        Row: {
          company_name: string
          company_type: Database["public"]["Enums"]["company_type"]
          created_at: string
          id: string
          monthly_volume: string | null
          user_id: string
        }
        Insert: {
          company_name: string
          company_type?: Database["public"]["Enums"]["company_type"]
          created_at?: string
          id?: string
          monthly_volume?: string | null
          user_id: string
        }
        Update: {
          company_name?: string
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
        ]
      }
      community_posts: {
        Row: {
          author_id: string
          category: string
          comments_count: number
          content: string
          created_at: string
          id: string
          likes_count: number
        }
        Insert: {
          author_id: string
          category?: string
          comments_count?: number
          content: string
          created_at?: string
          id?: string
          likes_count?: number
        }
        Update: {
          author_id?: string
          category?: string
          comments_count?: number
          content?: string
          created_at?: string
          id?: string
          likes_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          notes: string | null
          parcel_id: string
          photo_urls: string[] | null
          quality: Database["public"]["Enums"]["quality_grade"]
          quantity: number
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
          notes?: string | null
          parcel_id: string
          photo_urls?: string[] | null
          quality?: Database["public"]["Enums"]["quality_grade"]
          quantity: number
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
          notes?: string | null
          parcel_id?: string
          photo_urls?: string[] | null
          quality?: Database["public"]["Enums"]["quality_grade"]
          quantity?: number
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
            foreignKeyName: "harvest_entries_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "parcels"
            referencedColumns: ["id"]
          },
        ]
      }
      harvest_subscriptions: {
        Row: {
          buyer_id: string
          created_at: string
          estimated_qty: number | null
          farmer_id: string
          id: string
          locked_at: string | null
          locked_price: number | null
          next_harvest_date: string | null
          price_lock: boolean
          status: Database["public"]["Enums"]["subscription_status"]
          volume_commitment: number | null
        }
        Insert: {
          buyer_id: string
          created_at?: string
          estimated_qty?: number | null
          farmer_id: string
          id?: string
          locked_at?: string | null
          locked_price?: number | null
          next_harvest_date?: string | null
          price_lock?: boolean
          status?: Database["public"]["Enums"]["subscription_status"]
          volume_commitment?: number | null
        }
        Update: {
          buyer_id?: string
          created_at?: string
          estimated_qty?: number | null
          farmer_id?: string
          id?: string
          locked_at?: string | null
          locked_price?: number | null
          next_harvest_date?: string | null
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
            foreignKeyName: "harvest_subscriptions_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          created_at: string
          crop: string
          description: string | null
          farmer_id: string
          harvest_entry_id: string | null
          id: string
          min_order: number
          photo_urls: string[] | null
          price_per_unit: number
          quality: Database["public"]["Enums"]["quality_grade"]
          quantity: number
          status: Database["public"]["Enums"]["listing_status"]
          unit: Database["public"]["Enums"]["unit_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          crop: string
          description?: string | null
          farmer_id: string
          harvest_entry_id?: string | null
          id?: string
          min_order?: number
          photo_urls?: string[] | null
          price_per_unit: number
          quality?: Database["public"]["Enums"]["quality_grade"]
          quantity: number
          status?: Database["public"]["Enums"]["listing_status"]
          unit?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          crop?: string
          description?: string | null
          farmer_id?: string
          harvest_entry_id?: string | null
          id?: string
          min_order?: number
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
            foreignKeyName: "listings_harvest_entry_id_fkey"
            columns: ["harvest_entry_id"]
            isOneToOne: false
            referencedRelation: "harvest_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      notif_prefs: {
        Row: {
          community_push: boolean
          harvest_time_push: boolean
          harvest_time_sms: boolean
          harvest_time_whatsapp: boolean
          new_offer_push: boolean
          new_offer_sms: boolean
          new_offer_whatsapp: boolean
          price_alert_push: boolean
          price_alert_sms: boolean
          price_alert_whatsapp: boolean
          user_id: string
        }
        Insert: {
          community_push?: boolean
          harvest_time_push?: boolean
          harvest_time_sms?: boolean
          harvest_time_whatsapp?: boolean
          new_offer_push?: boolean
          new_offer_sms?: boolean
          new_offer_whatsapp?: boolean
          price_alert_push?: boolean
          price_alert_sms?: boolean
          price_alert_whatsapp?: boolean
          user_id: string
        }
        Update: {
          community_push?: boolean
          harvest_time_push?: boolean
          harvest_time_sms?: boolean
          harvest_time_whatsapp?: boolean
          new_offer_push?: boolean
          new_offer_sms?: boolean
          new_offer_whatsapp?: boolean
          price_alert_push?: boolean
          price_alert_sms?: boolean
          price_alert_whatsapp?: boolean
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
        ]
      }
      offers: {
        Row: {
          buyer_id: string
          counter_offer: Json | null
          created_at: string
          delivery: Database["public"]["Enums"]["delivery_type"]
          delivery_date: string | null
          farmer_id: string
          id: string
          listing_id: string
          note: string | null
          price_per_unit: number
          quantity: number
          status: Database["public"]["Enums"]["offer_status"]
          updated_at: string
        }
        Insert: {
          buyer_id: string
          counter_offer?: Json | null
          created_at?: string
          delivery?: Database["public"]["Enums"]["delivery_type"]
          delivery_date?: string | null
          farmer_id: string
          id?: string
          listing_id: string
          note?: string | null
          price_per_unit: number
          quantity: number
          status?: Database["public"]["Enums"]["offer_status"]
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          counter_offer?: Json | null
          created_at?: string
          delivery?: Database["public"]["Enums"]["delivery_type"]
          delivery_date?: string | null
          farmer_id?: string
          id?: string
          listing_id?: string
          note?: string | null
          price_per_unit?: number
          quantity?: number
          status?: Database["public"]["Enums"]["offer_status"]
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
            foreignKeyName: "offers_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
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
        ]
      }
      orders: {
        Row: {
          buyer_id: string
          created_at: string
          farmer_id: string
          id: string
          offer_id: string
          order_ref: string
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          farmer_id: string
          id?: string
          offer_id: string
          order_ref: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          farmer_id?: string
          id?: string
          offer_id?: string
          order_ref?: string
          status?: Database["public"]["Enums"]["order_status"]
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
            foreignKeyName: "orders_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          lat: number | null
          lng: number | null
          location_label: string | null
          name: string
        }
        Insert: {
          area: number
          created_at?: string
          crops?: string[]
          farm_id: string
          farmer_id: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_label?: string | null
          name: string
        }
        Update: {
          area?: number
          created_at?: string
          crops?: string[]
          farm_id?: string
          farmer_id?: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_label?: string | null
          name?: string
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
          city: string | null
          created_at: string
          id: string
          name: string | null
          phone: string | null
          premium: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id: string
          name?: string | null
          phone?: string | null
          premium?: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          name?: string | null
          phone?: string | null
          premium?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_role: { Args: never; Returns: string }
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
      delivery_type: "kargo-buyer" | "kargo-seller" | "elden"
      listing_status: "active" | "sold" | "expired"
      notif_channel: "whatsapp" | "push" | "sms"
      offer_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "counter"
        | "completed"
      order_status:
        | "preparing"
        | "shipped"
        | "delivered"
        | "disputed"
        | "completed"
      price_alert_condition: "above" | "below"
      quality_grade: "A" | "B" | "C"
      subscription_status: "active" | "cancelled" | "fulfilled"
      unit_type: "g" | "kg" | "L"
      user_role: "farmer" | "buyer"
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
      ],
      delivery_type: ["kargo-buyer", "kargo-seller", "elden"],
      listing_status: ["active", "sold", "expired"],
      notif_channel: ["whatsapp", "push", "sms"],
      offer_status: ["pending", "accepted", "rejected", "counter", "completed"],
      order_status: [
        "preparing",
        "shipped",
        "delivered",
        "disputed",
        "completed",
      ],
      price_alert_condition: ["above", "below"],
      quality_grade: ["A", "B", "C"],
      subscription_status: ["active", "cancelled", "fulfilled"],
      unit_type: ["g", "kg", "L"],
      user_role: ["farmer", "buyer"],
    },
  },
} as const
