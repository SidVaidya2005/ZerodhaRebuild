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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      candle_sync: {
        Row: {
          fetched_at: string
          interval: Database["public"]["Enums"]["candle_interval"]
          provider: Database["public"]["Enums"]["quote_provider"]
          symbol: string
        }
        Insert: {
          fetched_at?: string
          interval: Database["public"]["Enums"]["candle_interval"]
          provider: Database["public"]["Enums"]["quote_provider"]
          symbol: string
        }
        Update: {
          fetched_at?: string
          interval?: Database["public"]["Enums"]["candle_interval"]
          provider?: Database["public"]["Enums"]["quote_provider"]
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "candle_sync_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
        ]
      }
      candles: {
        Row: {
          close: number
          high: number
          interval: Database["public"]["Enums"]["candle_interval"]
          low: number
          open: number
          symbol: string
          ts: string
          volume: number | null
        }
        Insert: {
          close: number
          high: number
          interval: Database["public"]["Enums"]["candle_interval"]
          low: number
          open: number
          symbol: string
          ts: string
          volume?: number | null
        }
        Update: {
          close?: number
          high?: number
          interval?: Database["public"]["Enums"]["candle_interval"]
          low?: number
          open?: number
          symbol?: string
          ts?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candles_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
        ]
      }
      fund_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          note: string | null
          order_id: string | null
          type: Database["public"]["Enums"]["ledger_type"]
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string | null
          type: Database["public"]["Enums"]["ledger_type"]
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string | null
          type?: Database["public"]["Enums"]["ledger_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          available_cash: number
          opening_balance: number
          updated_at: string
          used_margin: number
          user_id: string
        }
        Insert: {
          available_cash: number
          opening_balance: number
          updated_at?: string
          used_margin?: number
          user_id: string
        }
        Update: {
          available_cash?: number
          opening_balance?: number
          updated_at?: string
          used_margin?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      holdings: {
        Row: {
          average_price: number
          quantity: number
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          average_price: number
          quantity: number
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          average_price?: number
          quantity?: number
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
          {
            foreignKeyName: "holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      instruments: {
        Row: {
          exchange: string
          is_active: boolean
          name: string
          sector: string | null
          symbol: string
          tick_size: number
          yahoo_symbol: string
        }
        Insert: {
          exchange?: string
          is_active?: boolean
          name: string
          sector?: string | null
          symbol: string
          tick_size?: number
          yahoo_symbol: string
        }
        Update: {
          exchange?: string
          is_active?: boolean
          name?: string
          sector?: string | null
          symbol?: string
          tick_size?: number
          yahoo_symbol?: string
        }
        Relationships: []
      }
      market_holidays: {
        Row: {
          description: string
          trading_date: string
        }
        Insert: {
          description: string
          trading_date: string
        }
        Update: {
          description?: string
          trading_date?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          average_price: number | null
          blocked_margin: number
          executed_at: string | null
          filled_quantity: number
          id: string
          limit_price: number | null
          order_type: Database["public"]["Enums"]["order_type"]
          placed_at: string
          product: Database["public"]["Enums"]["product_type"]
          quantity: number
          rejection_reason: string | null
          side: Database["public"]["Enums"]["order_side"]
          status: Database["public"]["Enums"]["order_status"]
          symbol: string
          user_id: string
        }
        Insert: {
          average_price?: number | null
          blocked_margin?: number
          executed_at?: string | null
          filled_quantity?: number
          id?: string
          limit_price?: number | null
          order_type: Database["public"]["Enums"]["order_type"]
          placed_at?: string
          product: Database["public"]["Enums"]["product_type"]
          quantity: number
          rejection_reason?: string | null
          side: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["order_status"]
          symbol: string
          user_id: string
        }
        Update: {
          average_price?: number | null
          blocked_margin?: number
          executed_at?: string | null
          filled_quantity?: number
          id?: string
          limit_price?: number | null
          order_type?: Database["public"]["Enums"]["order_type"]
          placed_at?: string
          product?: Database["public"]["Enums"]["product_type"]
          quantity?: number
          rejection_reason?: string | null
          side?: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["order_status"]
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          average_price: number
          blocked_margin: number
          entry_reference_price: number | null
          net_quantity: number
          opened_at: string
          product: Database["public"]["Enums"]["product_type"]
          realised_pnl: number
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          average_price: number
          blocked_margin?: number
          entry_reference_price?: number | null
          net_quantity: number
          opened_at?: string
          product: Database["public"]["Enums"]["product_type"]
          realised_pnl?: number
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          average_price?: number
          blocked_margin?: number
          entry_reference_price?: number | null
          net_quantity?: number
          opened_at?: string
          product?: Database["public"]["Enums"]["product_type"]
          realised_pnl?: number
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
          {
            foreignKeyName: "positions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          client_id: string
          created_at: string
          full_name: string | null
          id: string
          theme: string
        }
        Insert: {
          avatar_url?: string | null
          client_id: string
          created_at?: string
          full_name?: string | null
          id: string
          theme?: string
        }
        Update: {
          avatar_url?: string | null
          client_id?: string
          created_at?: string
          full_name?: string | null
          id?: string
          theme?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          day_high: number | null
          day_low: number | null
          day_open: number | null
          fetched_at: string
          ltp: number
          prev_close: number | null
          provider: Database["public"]["Enums"]["quote_provider"]
          provider_ts: string | null
          symbol: string
          updated_at: string
          volume: number | null
        }
        Insert: {
          day_high?: number | null
          day_low?: number | null
          day_open?: number | null
          fetched_at?: string
          ltp: number
          prev_close?: number | null
          provider: Database["public"]["Enums"]["quote_provider"]
          provider_ts?: string | null
          symbol: string
          updated_at?: string
          volume?: number | null
        }
        Update: {
          day_high?: number | null
          day_low?: number | null
          day_open?: number | null
          fetched_at?: string
          ltp?: number
          prev_close?: number | null
          provider?: Database["public"]["Enums"]["quote_provider"]
          provider_ts?: string | null
          symbol?: string
          updated_at?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: true
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
        ]
      }
      support_messages: {
        Row: {
          category: string
          created_at: string
          email: string
          id: string
          message: string
          name: string
        }
        Insert: {
          category: string
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
        }
        Update: {
          category?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
        }
        Relationships: []
      }
      symbol_demand: {
        Row: {
          last_requested_at: string
          priority: number
          symbol: string
        }
        Insert: {
          last_requested_at?: string
          priority?: number
          symbol: string
        }
        Update: {
          last_requested_at?: string
          priority?: number
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "symbol_demand_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: true
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
        ]
      }
      trades: {
        Row: {
          charge_breakdown: Json
          charges: number
          id: string
          is_auto_squareoff: boolean
          order_id: string
          price: number
          product: Database["public"]["Enums"]["product_type"]
          quantity: number
          realised_pnl: number
          side: Database["public"]["Enums"]["order_side"]
          symbol: string
          traded_at: string
          user_id: string
        }
        Insert: {
          charge_breakdown: Json
          charges: number
          id?: string
          is_auto_squareoff?: boolean
          order_id: string
          price: number
          product: Database["public"]["Enums"]["product_type"]
          quantity: number
          realised_pnl?: number
          side: Database["public"]["Enums"]["order_side"]
          symbol: string
          traded_at?: string
          user_id: string
        }
        Update: {
          charge_breakdown?: Json
          charges?: number
          id?: string
          is_auto_squareoff?: boolean
          order_id?: string
          price?: number
          product?: Database["public"]["Enums"]["product_type"]
          quantity?: number
          realised_pnl?: number
          side?: Database["public"]["Enums"]["order_side"]
          symbol?: string
          traded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
          {
            foreignKeyName: "trades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_items: {
        Row: {
          sort_order: number
          symbol: string
          user_id: string
        }
        Insert: {
          sort_order?: number
          symbol: string
          user_id: string
        }
        Update: {
          sort_order?: number
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_items_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
          {
            foreignKeyName: "watchlist_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      candle_interval: "FIVE_MIN" | "THIRTY_MIN" | "ONE_DAY"
      ledger_type:
        | "SIGNUP_CREDIT"
        | "MARGIN_BLOCK"
        | "MARGIN_RELEASE"
        | "BUY_DEBIT"
        | "SELL_CREDIT"
        | "CHARGES"
        | "REALISED_PNL"
        | "SIMULATION_ADJUSTMENT"
      order_side: "BUY" | "SELL"
      order_status: "OPEN" | "COMPLETE" | "CANCELLED" | "REJECTED"
      order_type: "MARKET" | "LIMIT"
      product_type: "CNC" | "MIS"
      quote_provider: "YAHOO" | "TWELVE_DATA" | "SIMULATOR"
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
      candle_interval: ["FIVE_MIN", "THIRTY_MIN", "ONE_DAY"],
      ledger_type: [
        "SIGNUP_CREDIT",
        "MARGIN_BLOCK",
        "MARGIN_RELEASE",
        "BUY_DEBIT",
        "SELL_CREDIT",
        "CHARGES",
        "REALISED_PNL",
        "SIMULATION_ADJUSTMENT",
      ],
      order_side: ["BUY", "SELL"],
      order_status: ["OPEN", "COMPLETE", "CANCELLED", "REJECTED"],
      order_type: ["MARKET", "LIMIT"],
      product_type: ["CNC", "MIS"],
      quote_provider: ["YAHOO", "TWELVE_DATA", "SIMULATOR"],
    },
  },
} as const
