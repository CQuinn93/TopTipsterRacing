export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type CompetitionStatus = 'upcoming' | 'active' | 'finished';

export interface Database {
  public: {
    Tables: {
      competitions: {
        Row: {
          id: string;
          name: string;
          status: CompetitionStatus;
          festival_start_date: string;
          festival_end_date: string;
          selection_open_utc: string;
          selection_close_minutes_before_first_race: number;
          access_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          status?: CompetitionStatus;
          festival_start_date: string;
          festival_end_date: string;
          selection_open_utc: string;
          selection_close_minutes_before_first_race?: number;
          access_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          status?: CompetitionStatus;
          festival_start_date?: string;
          festival_end_date?: string;
          selection_open_utc?: string;
          selection_close_minutes_before_first_race?: number;
          access_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      competition_join_requests: {
        Row: {
          id: string;
          competition_id: string;
          user_id: string;
          display_name: string;
          status: 'pending' | 'approved' | 'rejected';
          created_at: string;
          reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          competition_id: string;
          user_id: string;
          display_name: string;
          status?: 'pending' | 'approved' | 'rejected';
          created_at?: string;
          reviewed_at?: string | null;
        };
        Update: {
          id?: string;
          competition_id?: string;
          user_id?: string;
          display_name?: string;
          status?: 'pending' | 'approved' | 'rejected';
          created_at?: string;
          reviewed_at?: string | null;
        };
      };
      competition_participants: {
        Row: {
          id: string;
          competition_id: string;
          user_id: string;
          display_name: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          user_id: string;
          display_name: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          user_id?: string;
          display_name?: string;
          joined_at?: string;
        };
      };
      daily_selections: {
        Row: {
          id: string;
          competition_id: string;
          user_id: string;
          race_date: string;
          selections: Json;
          submitted_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          user_id: string;
          race_date: string;
          selections: Json;
          submitted_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          competition_id?: string;
          user_id?: string;
          race_date?: string;
          selections?: Json;
          submitted_at?: string;
          updated_at?: string;
        };
      };
      race_days: {
        Row: {
          id: string;
          course: string;
          race_date: string;
          first_race_utc: string;
          races: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course: string;
          race_date: string;
          first_race_utc: string;
          races: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course?: string;
          race_date?: string;
          first_race_utc?: string;
          races?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      competition_courses: {
        Row: { id: string; competition_id: string; course: string };
        Insert: { id?: string; competition_id: string; course: string };
        Update: { id?: string; competition_id?: string; course?: string };
      };
      competition_race_days: {
        Row: { id: string; competition_id: string; race_day_id: string };
        Insert: { id?: string; competition_id: string; race_day_id: string };
        Update: { id?: string; competition_id?: string; race_day_id?: string };
      };
      user_tablet_codes: {
        Row: {
          id: string;
          user_id: string;
          code: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          code: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          code?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          username: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      user_competitions: {
        Row: {
          competition_id: string;
          name: string;
          status: string;
          festival_start_date: string;
          festival_end_date: string;
          display_name: string;
        };
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
