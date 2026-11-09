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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      bets: {
        Row: {
          bonus_amount: number
          bonus_rate: number
          booking_code: string | null
          cashed_out: number
          created_at: string
          id: string
          potential_win: number
          selections: Json
          stake: number
          status: string
          total_odds: number
          user_id: string
        }
        Insert: {
          bonus_amount?: number
          bonus_rate?: number
          booking_code?: string | null
          cashed_out?: number
          created_at?: string
          id?: string
          potential_win: number
          selections?: Json
          stake: number
          status?: string
          total_odds: number
          user_id: string
        }
        Update: {
          bonus_amount?: number
          bonus_rate?: number
          booking_code?: string | null
          cashed_out?: number
          created_at?: string
          id?: string
          potential_win?: number
          selections?: Json
          stake?: number
          status?: string
          total_odds?: number
          user_id?: string
        }
        Relationships: []
      }
      booking_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          selections: Json
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          selections: Json
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          selections?: Json
        }
        Relationships: []
      }
      cashout_events: {
        Row: {
          amount: number
          bet_id: string
          created_at: string
          id: string
          kind: string
          user_id: string
        }
        Insert: {
          amount: number
          bet_id: string
          created_at?: string
          id?: string
          kind?: string
          user_id: string
        }
        Update: {
          amount?: number
          bet_id?: string
          created_at?: string
          id?: string
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashout_events_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          api_status: string | null
          away_crest: string | null
          away_score: number
          away_team: string
          away_team_full: string | null
          away_team_id: number | null
          category_id: string | null
          competition_code: string | null
          created_at: string
          external_id: number | null
          home_crest: string | null
          home_score: number
          home_team: string
          home_team_full: string | null
          home_team_id: number | null
          id: string
          league: string
          markets: Json
          minute: number | null
          odds_available: boolean
          odds_away: number
          odds_bookmaker: string | null
          odds_draw: number
          odds_event_id: string | null
          odds_home: number
          odds_updated_at: string | null
          second_half_at: string | null
          source: string
          start_time: string
          status: string
          synced_at: string | null
          visible: boolean
        }
        Insert: {
          api_status?: string | null
          away_crest?: string | null
          away_score?: number
          away_team: string
          away_team_full?: string | null
          away_team_id?: number | null
          category_id?: string | null
          competition_code?: string | null
          created_at?: string
          external_id?: number | null
          home_crest?: string | null
          home_score?: number
          home_team: string
          home_team_full?: string | null
          home_team_id?: number | null
          id?: string
          league?: string
          markets?: Json
          minute?: number | null
          odds_available?: boolean
          odds_away?: number
          odds_bookmaker?: string | null
          odds_draw?: number
          odds_event_id?: string | null
          odds_home?: number
          odds_updated_at?: string | null
          second_half_at?: string | null
          source?: string
          start_time?: string
          status?: string
          synced_at?: string | null
          visible?: boolean
        }
        Update: {
          api_status?: string | null
          away_crest?: string | null
          away_score?: number
          away_team?: string
          away_team_full?: string | null
          away_team_id?: number | null
          category_id?: string | null
          competition_code?: string | null
          created_at?: string
          external_id?: number | null
          home_crest?: string | null
          home_score?: number
          home_team?: string
          home_team_full?: string | null
          home_team_id?: number | null
          id?: string
          league?: string
          markets?: Json
          minute?: number | null
          odds_available?: boolean
          odds_away?: number
          odds_bookmaker?: string | null
          odds_draw?: number
          odds_event_id?: string | null
          odds_home?: number
          odds_updated_at?: string | null
          second_half_at?: string | null
          source?: string
          start_time?: string
          status?: string
          synced_at?: string | null
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "matches_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "sports_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      odds_sync_state: {
        Row: {
          requests_remaining: number | null
          sport_key: string
          synced_at: string
        }
        Insert: {
          requests_remaining?: number | null
          sport_key: string
          synced_at?: string
        }
        Update: {
          requests_remaining?: number | null
          sport_key?: string
          synced_at?: string
        }
        Relationships: []
      }
      payment_credentials: {
        Row: {
          api_key_ciphertext: string | null
          provider: string
          updated_at: string
          webhook_secret_ciphertext: string | null
        }
        Insert: {
          api_key_ciphertext?: string | null
          provider: string
          updated_at?: string
          webhook_secret_ciphertext?: string | null
        }
        Update: {
          api_key_ciphertext?: string | null
          provider?: string
          updated_at?: string
          webhook_secret_ciphertext?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          balance: number
          country: string
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string
          referral_code: string | null
          wager_progress: number
          wager_required: number
        }
        Insert: {
          balance?: number
          country?: string
          created_at?: string
          email?: string
          full_name?: string
          id: string
          phone?: string
          referral_code?: string | null
          wager_progress?: number
          wager_required?: number
        }
        Update: {
          balance?: number
          country?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string
          referral_code?: string | null
          wager_progress?: number
          wager_required?: number
        }
        Relationships: []
      }
      promotions: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          title: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          active: boolean
          bonus: number
          code: string
          created_at: string
          id: string
          uses: number
        }
        Insert: {
          active?: boolean
          bonus?: number
          code: string
          created_at?: string
          id?: string
          uses?: number
        }
        Update: {
          active?: boolean
          bonus?: number
          code?: string
          created_at?: string
          id?: string
          uses?: number
        }
        Relationships: []
      }
      shinobipay_cash_credits: {
        Row: {
          amount_minor: number
          created_at: string
          deposit_id: string
          event_id: string
          intent_id: string
          user_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          deposit_id: string
          event_id: string
          intent_id: string
          user_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          deposit_id?: string
          event_id?: string
          intent_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shinobipay_cash_credits_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: true
            referencedRelation: "shinobipay_deposits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shinobipay_cash_credits_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "shinobipay_events"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "shinobipay_cash_credits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shinobipay_cash_wallets: {
        Row: {
          balance_minor: number
          user_id: string
        }
        Insert: {
          balance_minor?: number
          user_id: string
        }
        Update: {
          balance_minor?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shinobipay_cash_wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shinobipay_credit_gate: {
        Row: {
          enabled: boolean
          id: boolean
        }
        Insert: {
          enabled?: boolean
          id?: boolean
        }
        Update: {
          enabled?: boolean
          id?: boolean
        }
        Relationships: []
      }
      shinobipay_deposits: {
        Row: {
          amount_minor: number
          created_at: string
          credited_at: string | null
          id: string
          intent_id: string | null
          last_sequence: number
          mode: string
          network: string | null
          payment_method: string
          reference: string
          status: string
          user_id: string
          webhook_verified_at: string | null
        }
        Insert: {
          amount_minor: number
          created_at?: string
          credited_at?: string | null
          id?: string
          intent_id?: string | null
          last_sequence?: number
          mode: string
          network?: string | null
          payment_method?: string
          reference: string
          status?: string
          user_id: string
          webhook_verified_at?: string | null
        }
        Update: {
          amount_minor?: number
          created_at?: string
          credited_at?: string | null
          id?: string
          intent_id?: string | null
          last_sequence?: number
          mode?: string
          network?: string | null
          payment_method?: string
          reference?: string
          status?: string
          user_id?: string
          webhook_verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shinobipay_deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shinobipay_events: {
        Row: {
          created_at: string
          deposit_id: string
          event_id: string
          sequence: number
          verified_amount_minor: number | null
          verified_intent_id: string | null
          verified_status: string | null
        }
        Insert: {
          created_at?: string
          deposit_id: string
          event_id: string
          sequence: number
          verified_amount_minor?: number | null
          verified_intent_id?: string | null
          verified_status?: string | null
        }
        Update: {
          created_at?: string
          deposit_id?: string
          event_id?: string
          sequence?: number
          verified_amount_minor?: number | null
          verified_intent_id?: string | null
          verified_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shinobipay_events_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "shinobipay_deposits"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value?: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      sports_categories: {
        Row: {
          active: boolean
          icon: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          icon?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          icon?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string
          status: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string
          status?: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          created_at: string
          id: string
          kind: string
          message: string
          rating: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          message?: string
          rating?: number | null
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message?: string
          rating?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_adjust_balance: {
        Args: { _amount: number; _user: string }
        Returns: undefined
      }
      admin_review_withdrawal: {
        Args: { _approve: boolean; _tx: string }
        Returns: undefined
      }
      admin_settle_bet: {
        Args: { _bet: string; _won: boolean }
        Returns: undefined
      }
      apply_bookmaker_odds: {
        Args: { _match_ids: string[]; _odds: Json }
        Returns: number
      }
      bind_shinobipay_test_intent: {
        Args: {
          _amount: number
          _intent: string
          _reference: string
          _status: string
        }
        Returns: undefined
      }
      build_markets: {
        Args: { a: number; d: number; h: number }
        Returns: Json
      }
      cashout_bet: { Args: { _amount: number; _bet: string }; Returns: number }
      cashout_offer: { Args: { _bet: string }; Returns: number }
      confirm_shinobipay_verified_event: {
        Args: {
          _amount: number
          _event: string
          _intent: string
          _reference: string
          _sequence: number
          _status: string
        }
        Returns: string
      }
      create_booking_code: { Args: { _selections: Json }; Returns: string }
      delete_ticket: { Args: { _bet: string }; Returns: undefined }
      demo_deposit: { Args: { _amount: number }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      place_bet: {
        Args: {
          _expected_odds: number[]
          _match_ids: string[]
          _picks: string[]
          _stake: number
        }
        Returns: string
      }
      record_shinobipay_test_event: {
        Args: {
          _amount: number
          _event: string
          _intent: string
          _reference: string
          _sequence: number
          _status: string
        }
        Returns: string
      }
      request_withdrawal: { Args: { _amount: number }; Returns: undefined }
      save_shinobipay_credentials: {
        Args: {
          _api_key_ciphertext?: string
          _webhook_secret_ciphertext?: string
        }
        Returns: undefined
      }
      shinobipay_credential_status: { Args: never; Returns: Json }
      sync_football_fixtures: { Args: { _fixtures: Json }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const
