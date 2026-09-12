import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
export type Patient = { id: string; name: string; email: string; created_at: string };
export type Consultation = {
  id: string;
  patient_id: string;
  patient_name: string;
  consultation_date: string;
  invite_email: string;
  invite_expires_at: string;
  created_at: string;
};
export type Submission = {
  id: string;
  consultation_id: string;
  answers: Json;
  confirmed_name: string;
  confirmed_at: string;
  accepted: boolean;
  declaration_version: string;
  submitted_by: string;
};
export type ConsultationDraft = {
  consultation_id: string;
  body_composition: Json | null;
  clinical_data: Json | null;
  anamnesis_id: string | null;
  version: number;
};
type Table<Row, Insert = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Row>;
  Relationships: [];
};
type Report = Database["public"]["Tables"]["reports"];
// Local extension for the pending migration; generated Supabase types remain untouched.
type ConsultationDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      create_patient_consultation: {
        Args: {
          _id: string;
          _patient_id: string;
          _name: string;
          _email: string;
          _date: string;
          _existing_patient: boolean;
        };
        Returns: string;
      };
    };
    Tables: Omit<Database["public"]["Tables"], "reports"> & {
      patients: Table<Patient>;
      consultations: Table<Consultation>;
      anamnesis_submissions: Table<
        Submission,
        Pick<Submission, "id" | "consultation_id" | "answers" | "confirmed_name" | "accepted">
      >;
      consultation_drafts: Table<ConsultationDraft>;
      reports: {
        Row: Report["Row"] & { consultation_id: string | null; anamnesis_id: string | null };
        Insert: Report["Insert"] & { consultation_id?: string; anamnesis_id?: string | null };
        Update: Report["Update"];
        Relationships: [];
      };
    };
  };
};
export const consultationDb = supabase as unknown as SupabaseClient<ConsultationDatabase>;
