// Generated from the live Supabase schema (mcp: generate_typescript_types). Regenerate after any
// migration instead of hand-editing. `deprecated_*` tables are the old custom-auth prototype
// tables (renamed, RLS-locked with no policies, unused) — harmless noise here.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      circles: {
        Row: {
          created_at: string
          id: string
          name: string
          teacher_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          teacher_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "circles_teacher_id_fkey1"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_records: {
        Row: {
          adjustment: number
          attendance: string
          created_at: string
          from_ayah: number | null
          grade: string | null
          id: string
          notes: string | null
          points: number
          record_date: string
          student_id: string
          surah: string | null
          teacher_id: string
          to_ayah: number | null
          work_type: string
        }
        Insert: {
          adjustment?: number
          attendance: string
          created_at?: string
          from_ayah?: number | null
          grade?: string | null
          id?: string
          notes?: string | null
          points?: number
          record_date?: string
          student_id: string
          surah?: string | null
          teacher_id: string
          to_ayah?: number | null
          work_type: string
        }
        Update: {
          adjustment?: number
          attendance?: string
          created_at?: string
          from_ayah?: number | null
          grade?: string | null
          id?: string
          notes?: string | null
          points?: number
          record_date?: string
          student_id?: string
          surah?: string | null
          teacher_id?: string
          to_ayah?: number | null
          work_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_records_student_id_fkey1"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_records_teacher_id_fkey1"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      edu_notes: {
        Row: {
          area: string
          created_at: string
          id: string
          note: string
          points: number
          record_date: string
          student_id: string
          teacher_id: string
        }
        Insert: {
          area: string
          created_at?: string
          id?: string
          note: string
          points: number
          record_date?: string
          student_id: string
          teacher_id: string
        }
        Update: {
          area?: string
          created_at?: string
          id?: string
          note?: string
          points?: number
          record_date?: string
          student_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "edu_notes_student_id_fkey1"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edu_notes_teacher_id_fkey1"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          role: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id: string
          name: string
          role: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          role?: string
        }
        Relationships: []
      }
      quran_surahs: {
        Row: {
          ayah_count: number
          name: string
          surah_no: number
        }
        Insert: {
          ayah_count: number
          name: string
          surah_no: number
        }
        Update: {
          ayah_count?: number
          name?: string
          surah_no?: number
        }
        Relationships: []
      }
      students: {
        Row: {
          circle_id: string
          created_at: string
          current_from_ayah: number | null
          current_grade: string | null
          current_surah: string | null
          current_surah_no: number | null
          current_to_ayah: number | null
          id: string
          name: string
        }
        Insert: {
          circle_id: string
          created_at?: string
          current_from_ayah?: number | null
          current_grade?: string | null
          current_surah?: string | null
          current_surah_no?: number | null
          current_to_ayah?: number | null
          id?: string
          name: string
        }
        Update: {
          circle_id?: string
          created_at?: string
          current_from_ayah?: number | null
          current_grade?: string | null
          current_surah?: string | null
          current_surah_no?: number | null
          current_to_ayah?: number | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_circle_id_fkey1"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_current_surah_no_fkey"
            columns: ["current_surah_no"]
            isOneToOne: false
            referencedRelation: "quran_surahs"
            referencedColumns: ["surah_no"]
          },
        ]
      }
      tilawah_records: {
        Row: {
          created_at: string
          from_ayah: number
          grade: string
          id: string
          notes: string | null
          record_date: string
          student_id: string
          surah: string
          surah_no: number
          teacher_id: string
          to_ayah: number
        }
        Insert: {
          created_at?: string
          from_ayah: number
          grade: string
          id?: string
          notes?: string | null
          record_date?: string
          student_id: string
          surah: string
          surah_no: number
          teacher_id: string
          to_ayah: number
        }
        Update: {
          created_at?: string
          from_ayah?: number
          grade?: string
          id?: string
          notes?: string | null
          record_date?: string
          student_id?: string
          surah?: string
          surah_no?: number
          teacher_id?: string
          to_ayah?: number
        }
        Relationships: [
          {
            foreignKeyName: "tilawah_records_student_id_fkey1"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tilawah_records_surah_no_fkey"
            columns: ["surah_no"]
            isOneToOne: false
            referencedRelation: "quran_surahs"
            referencedColumns: ["surah_no"]
          },
          {
            foreignKeyName: "tilawah_records_teacher_id_fkey1"
            columns: ["teacher_id"]
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
      ayahs_before: { Args: { p_surah_no: number }; Returns: number }
      get_student_score: {
        Args: { p_month?: string; p_student_id: string }
        Returns: {
          score: number
          score_label: string
        }[]
      }
      list_students: {
        Args: { p_circle_id?: string; p_month?: string }
        Returns: {
          circle_id: string
          circle_name: string
          current_from_ayah: number
          current_grade: string
          current_surah: string
          current_surah_no: number
          current_to_ayah: number
          id: string
          name: string
          rank_value: number
          score: number
          score_label: string
          teacher_name: string
        }[]
      }
      tilawah_percent: {
        Args: { p_ayah: number; p_surah_no: number }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database["public"]

export type Tables<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Update"]
