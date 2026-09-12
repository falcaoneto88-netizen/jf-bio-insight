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
      anamnesis_submissions: {
        Row: {
          accepted: boolean
          answers: Json
          confirmed_at: string
          confirmed_name: string
          consultation_id: string
          declaration_version: string
          id: string
          submitted_by: string
        }
        Insert: {
          accepted: boolean
          answers: Json
          confirmed_at?: string
          confirmed_name: string
          consultation_id: string
          declaration_version?: string
          id?: string
          submitted_by?: string
        }
        Update: {
          accepted?: boolean
          answers?: Json
          confirmed_at?: string
          confirmed_name?: string
          consultation_id?: string
          declaration_version?: string
          id?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_submissions_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_drafts: {
        Row: {
          anamnesis_id: string | null
          body_composition: Json | null
          clinical_data: Json | null
          consultation_id: string
          version: number
        }
        Insert: {
          anamnesis_id?: string | null
          body_composition?: Json | null
          clinical_data?: Json | null
          consultation_id: string
          version?: number
        }
        Update: {
          anamnesis_id?: string | null
          body_composition?: Json | null
          clinical_data?: Json | null
          consultation_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "consultation_drafts_anamnesis_id_consultation_id_fkey"
            columns: ["anamnesis_id", "consultation_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_submissions"
            referencedColumns: ["id", "consultation_id"]
          },
          {
            foreignKeyName: "consultation_drafts_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: true
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
        ]
      }
      consultations: {
        Row: {
          consultation_date: string
          created_at: string
          id: string
          invite_email: string
          invite_expires_at: string
          patient_id: string
          patient_name: string
        }
        Insert: {
          consultation_date: string
          created_at?: string
          id?: string
          invite_email?: string
          invite_expires_at?: string
          patient_id: string
          patient_name: string
        }
        Update: {
          consultation_date?: string
          created_at?: string
          id?: string
          invite_email?: string
          invite_expires_at?: string
          patient_id?: string
          patient_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      jornada_aprovacoes: {
        Row: {
          approved_at: string
          approved_by: string
          content_hash: string
          created_at: string
          id: string
          jornada_id: string
          owner_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          approved_at?: string
          approved_by: string
          content_hash: string
          created_at?: string
          id?: string
          jornada_id: string
          owner_id: string
          snapshot: Json
          version: number
        }
        Update: {
          approved_at?: string
          approved_by?: string
          content_hash?: string
          created_at?: string
          id?: string
          jornada_id?: string
          owner_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "jornada_aprovacoes_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      jornadas_clinicas: {
        Row: {
          anamnese: Json
          approved_at: string | null
          approved_by: string | null
          approved_hash: string | null
          approved_version: number | null
          bio: Json
          confirmations: Json
          content_hash: string
          created_at: string
          id: string
          internal_notes: Json
          owner_id: string
          patient_name: string
          protocolo: Json | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          anamnese?: Json
          approved_at?: string | null
          approved_by?: string | null
          approved_hash?: string | null
          approved_version?: number | null
          bio?: Json
          confirmations?: Json
          content_hash?: string
          created_at?: string
          id?: string
          internal_notes?: Json
          owner_id: string
          patient_name?: string
          protocolo?: Json | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          anamnese?: Json
          approved_at?: string | null
          approved_by?: string | null
          approved_hash?: string | null
          approved_version?: number | null
          bio?: Json
          confirmations?: Json
          content_hash?: string
          created_at?: string
          id?: string
          internal_notes?: Json
          owner_id?: string
          patient_name?: string
          protocolo?: Json | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      journey_ai_usage: {
        Row: {
          count: number
          created_at: string
          hour_bucket: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          created_at?: string
          hour_bucket: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          created_at?: string
          hour_bucket?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          email?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          anamnesis_id: string | null
          body_classification: string
          body_composition: Json | null
          clinical_data: Json | null
          consultation_id: string | null
          created_at: string
          exam_date: string
          generated_at: string
          id: string
          main_goal: string
          patient_name: string
          pdf_file_name: string
        }
        Insert: {
          anamnesis_id?: string | null
          body_classification?: string
          body_composition?: Json | null
          clinical_data?: Json | null
          consultation_id?: string | null
          created_at?: string
          exam_date?: string
          generated_at?: string
          id?: string
          main_goal?: string
          patient_name?: string
          pdf_file_name?: string
        }
        Update: {
          anamnesis_id?: string | null
          body_classification?: string
          body_composition?: Json | null
          clinical_data?: Json | null
          consultation_id?: string | null
          created_at?: string
          exam_date?: string
          generated_at?: string
          id?: string
          main_goal?: string
          patient_name?: string
          pdf_file_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_anamnesis_consultation_fk"
            columns: ["anamnesis_id", "consultation_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_submissions"
            referencedColumns: ["id", "consultation_id"]
          },
          {
            foreignKeyName: "reports_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      aprovar_jornada: {
        Args: {
          _content_hash: string
          _expected_version: number
          _jornada_id: string
          _snapshot: Json
          _user_id: string
        }
        Returns: {
          approved_at: string
          approved_version: number
          content_hash: string
        }[]
      }
      consume_ai_quota: {
        Args: { _limit: number; _user_id: string }
        Returns: boolean
      }
      create_patient_consultation: {
        Args: {
          _date: string
          _email: string
          _existing_patient: boolean
          _id: string
          _name: string
          _patient_id: string
        }
        Returns: string
      }
      current_verified_email: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
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
