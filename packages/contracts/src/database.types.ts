export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      activities: {
        Row: {
          after_closes_at: string;
          attendance_rule: Database['public']['Enums']['attendance_rule'];
          cancelled_at: string | null;
          capacity: number;
          check_in_closes_at: string;
          check_in_opens_at: string;
          check_in_radius_m: number;
          checked_in_count: number;
          completed_at: string | null;
          confirmed_count: number;
          cost_cents: number;
          created_at: string;
          currency: string;
          ended_at: string | null;
          ends_at: string;
          host_id: string;
          id: string;
          kit_note: string | null;
          level_label: string | null;
          live_at: string | null;
          place_id: string | null;
          plan_id: string;
          sport_id: string;
          starts_at: string;
          status: Database['public']['Enums']['activity_status'];
          team_a_label: string | null;
          team_b_label: string | null;
          teams_note: string | null;
          title: string | null;
          updated_at: string;
          waitlist_count: number;
        };
        ComputedFields: never;
        Insert: {
          after_closes_at: string;
          attendance_rule: Database['public']['Enums']['attendance_rule'];
          cancelled_at?: string | null;
          capacity: number;
          check_in_closes_at: string;
          check_in_opens_at: string;
          check_in_radius_m?: number;
          checked_in_count?: number;
          completed_at?: string | null;
          confirmed_count?: number;
          cost_cents?: number;
          created_at?: string;
          currency?: string;
          ended_at?: string | null;
          ends_at: string;
          host_id: string;
          id?: string;
          kit_note?: string | null;
          level_label?: string | null;
          live_at?: string | null;
          place_id?: string | null;
          plan_id: string;
          sport_id: string;
          starts_at: string;
          status?: Database['public']['Enums']['activity_status'];
          team_a_label?: string | null;
          team_b_label?: string | null;
          teams_note?: string | null;
          title?: string | null;
          updated_at?: string;
          waitlist_count?: number;
        };
        Update: {
          after_closes_at?: string;
          attendance_rule?: Database['public']['Enums']['attendance_rule'];
          cancelled_at?: string | null;
          capacity?: number;
          check_in_closes_at?: string;
          check_in_opens_at?: string;
          check_in_radius_m?: number;
          checked_in_count?: number;
          completed_at?: string | null;
          confirmed_count?: number;
          cost_cents?: number;
          created_at?: string;
          currency?: string;
          ended_at?: string | null;
          ends_at?: string;
          host_id?: string;
          id?: string;
          kit_note?: string | null;
          level_label?: string | null;
          live_at?: string | null;
          place_id?: string | null;
          plan_id?: string;
          sport_id?: string;
          starts_at?: string;
          status?: Database['public']['Enums']['activity_status'];
          team_a_label?: string | null;
          team_b_label?: string | null;
          teams_note?: string | null;
          title?: string | null;
          updated_at?: string;
          waitlist_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'activities_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activities_place_id_fkey';
            columns: ['place_id'];
            isOneToOne: false;
            referencedRelation: 'places';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activities_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: true;
            referencedRelation: 'plan_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activities_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: true;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activities_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
        ];
      };
      attendance: {
        Row: {
          activity_id: string;
          cancelled_at: string | null;
          check_in_method: Database['public']['Enums']['check_in_method'] | null;
          checked_in_at: string | null;
          confirmed_at: string | null;
          status: Database['public']['Enums']['attendance_status'];
          team: Database['public']['Enums']['team_side'] | null;
          updated_at: string;
          user_id: string;
          waitlisted_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          activity_id: string;
          cancelled_at?: string | null;
          check_in_method?: Database['public']['Enums']['check_in_method'] | null;
          checked_in_at?: string | null;
          confirmed_at?: string | null;
          status: Database['public']['Enums']['attendance_status'];
          team?: Database['public']['Enums']['team_side'] | null;
          updated_at?: string;
          user_id: string;
          waitlisted_at?: string | null;
        };
        Update: {
          activity_id?: string;
          cancelled_at?: string | null;
          check_in_method?: Database['public']['Enums']['check_in_method'] | null;
          checked_in_at?: string | null;
          confirmed_at?: string | null;
          status?: Database['public']['Enums']['attendance_status'];
          team?: Database['public']['Enums']['team_side'] | null;
          updated_at?: string;
          user_id?: string;
          waitlisted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activity_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      availability_slots: {
        Row: {
          day_of_week: number;
          part: Database['public']['Enums']['day_part'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          day_of_week: number;
          part: Database['public']['Enums']['day_part'];
          user_id: string;
        };
        Update: {
          day_of_week?: number;
          part?: Database['public']['Enums']['day_part'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'availability_slots_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
        };
        ComputedFields: never;
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      intent_signals: {
        Row: {
          area_lat: number | null;
          area_lng: number | null;
          audience: Database['public']['Enums']['audience'];
          created_at: string;
          expires_at: string;
          id: string;
          matched_plan_id: string | null;
          min_participants: number | null;
          place_id: string | null;
          radius_km: number;
          sport_id: string;
          status: Database['public']['Enums']['signal_status'];
          updated_at: string;
          user_id: string;
          window_end: string;
          window_start: string;
          withdrawn_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          area_lat?: number | null;
          area_lng?: number | null;
          audience?: Database['public']['Enums']['audience'];
          created_at?: string;
          expires_at: string;
          id?: string;
          matched_plan_id?: string | null;
          min_participants?: number | null;
          place_id?: string | null;
          radius_km: number;
          sport_id: string;
          status?: Database['public']['Enums']['signal_status'];
          updated_at?: string;
          user_id: string;
          window_end: string;
          window_start: string;
          withdrawn_at?: string | null;
        };
        Update: {
          area_lat?: number | null;
          area_lng?: number | null;
          audience?: Database['public']['Enums']['audience'];
          created_at?: string;
          expires_at?: string;
          id?: string;
          matched_plan_id?: string | null;
          min_participants?: number | null;
          place_id?: string | null;
          radius_km?: number;
          sport_id?: string;
          status?: Database['public']['Enums']['signal_status'];
          updated_at?: string;
          user_id?: string;
          window_end?: string;
          window_start?: string;
          withdrawn_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'intent_signals_matched_plan_fk';
            columns: ['matched_plan_id'];
            isOneToOne: false;
            referencedRelation: 'plan_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'intent_signals_matched_plan_fk';
            columns: ['matched_plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'intent_signals_place_id_fkey';
            columns: ['place_id'];
            isOneToOne: false;
            referencedRelation: 'places';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'intent_signals_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'intent_signals_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      location_shares: {
        Row: {
          activity_id: string;
          expires_at: string;
          lat: number | null;
          lng: number | null;
          started_at: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          activity_id: string;
          expires_at: string;
          lat?: number | null;
          lng?: number | null;
          started_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          activity_id?: string;
          expires_at?: string;
          lat?: number | null;
          lng?: number | null;
          started_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'location_shares_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'location_shares_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activity_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'location_shares_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      moment_tags: {
        Row: {
          created_at: string;
          moment_id: string;
          tagged_by: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          moment_id: string;
          tagged_by: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          moment_id?: string;
          tagged_by?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'moment_tags_moment_id_fkey';
            columns: ['moment_id'];
            isOneToOne: false;
            referencedRelation: 'moments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'moment_tags_tagged_by_fkey';
            columns: ['tagged_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'moment_tags_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      moments: {
        Row: {
          activity_id: string;
          alt_text: string | null;
          author_id: string;
          caption: string | null;
          created_at: string;
          id: string;
          storage_path: string;
        };
        ComputedFields: never;
        Insert: {
          activity_id: string;
          alt_text?: string | null;
          author_id: string;
          caption?: string | null;
          created_at?: string;
          id?: string;
          storage_path: string;
        };
        Update: {
          activity_id?: string;
          alt_text?: string | null;
          author_id?: string;
          caption?: string | null;
          created_at?: string;
          id?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'moments_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'moments_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activity_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'moments_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      passport_entries: {
        Row: {
          activity_id: string;
          created_at: string;
          id: string;
          minutes: number;
          occurred_at: string;
          place_game_number: number | null;
          place_id: string | null;
          sport_game_number: number;
          sport_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          activity_id: string;
          created_at?: string;
          id?: string;
          minutes: number;
          occurred_at: string;
          place_game_number?: number | null;
          place_id?: string | null;
          sport_game_number: number;
          sport_id: string;
          user_id: string;
        };
        Update: {
          activity_id?: string;
          created_at?: string;
          id?: string;
          minutes?: number;
          occurred_at?: string;
          place_game_number?: number | null;
          place_id?: string | null;
          sport_game_number?: number;
          sport_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'passport_entries_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'passport_entries_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activity_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'passport_entries_place_id_fkey';
            columns: ['place_id'];
            isOneToOne: false;
            referencedRelation: 'places';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'passport_entries_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'passport_entries_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      places: {
        Row: {
          area: string;
          city: string;
          created_at: string;
          floodlit_until: string | null;
          id: string;
          is_free: boolean;
          lat: number;
          lng: number;
          name: string;
          slug: string;
          sport_ids: string[];
          surface: string | null;
          time_zone: string;
        };
        ComputedFields: never;
        Insert: {
          area: string;
          city: string;
          created_at?: string;
          floodlit_until?: string | null;
          id?: string;
          is_free?: boolean;
          lat: number;
          lng: number;
          name: string;
          slug: string;
          sport_ids?: string[];
          surface?: string | null;
          time_zone?: string;
        };
        Update: {
          area?: string;
          city?: string;
          created_at?: string;
          floodlit_until?: string | null;
          id?: string;
          is_free?: boolean;
          lat?: number;
          lng?: number;
          name?: string;
          slug?: string;
          sport_ids?: string[];
          surface?: string | null;
          time_zone?: string;
        };
        Relationships: [];
      };
      plan_invites: {
        Row: {
          created_at: string;
          id: string;
          invitee_id: string;
          inviter_id: string;
          kind: Database['public']['Enums']['invite_kind'];
          plan_id: string;
          responded_at: string | null;
          status: Database['public']['Enums']['invite_status'];
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          invitee_id: string;
          inviter_id: string;
          kind: Database['public']['Enums']['invite_kind'];
          plan_id: string;
          responded_at?: string | null;
          status?: Database['public']['Enums']['invite_status'];
        };
        Update: {
          created_at?: string;
          id?: string;
          invitee_id?: string;
          inviter_id?: string;
          kind?: Database['public']['Enums']['invite_kind'];
          plan_id?: string;
          responded_at?: string | null;
          status?: Database['public']['Enums']['invite_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'plan_invites_invitee_id_fkey';
            columns: ['invitee_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_invites_inviter_id_fkey';
            columns: ['inviter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_invites_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plan_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_invites_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
        ];
      };
      plan_meeting_points: {
        Row: {
          label: string;
          lat: number | null;
          lng: number | null;
          plan_id: string;
        };
        ComputedFields: never;
        Insert: {
          label: string;
          lat?: number | null;
          lng?: number | null;
          plan_id: string;
        };
        Update: {
          label?: string;
          lat?: number | null;
          lng?: number | null;
          plan_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_meeting_points_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: true;
            referencedRelation: 'plan_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_meeting_points_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: true;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
        ];
      };
      plan_members: {
        Row: {
          joined_at: string;
          plan_id: string;
          user_id: string;
          via: Database['public']['Enums']['member_via'];
        };
        ComputedFields: never;
        Insert: {
          joined_at?: string;
          plan_id: string;
          user_id: string;
          via: Database['public']['Enums']['member_via'];
        };
        Update: {
          joined_at?: string;
          plan_id?: string;
          user_id?: string;
          via?: Database['public']['Enums']['member_via'];
        };
        Relationships: [
          {
            foreignKeyName: 'plan_members_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plan_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_members_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      plan_time_options: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          plan_id: string;
          starts_at: string;
          vote_count: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          plan_id: string;
          starts_at: string;
          vote_count?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          plan_id?: string;
          starts_at?: string;
          vote_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_time_options_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_time_options_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plan_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_time_options_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
        ];
      };
      plan_time_votes: {
        Row: {
          created_at: string;
          option_id: string;
          plan_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          option_id: string;
          plan_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          option_id?: string;
          plan_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_time_votes_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plan_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_time_votes_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_time_votes_plan_id_option_id_fkey';
            columns: ['plan_id', 'option_id'];
            isOneToOne: false;
            referencedRelation: 'plan_time_options';
            referencedColumns: ['plan_id', 'id'];
          },
          {
            foreignKeyName: 'plan_time_votes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      plans: {
        Row: {
          attendance_rule: Database['public']['Enums']['attendance_rule'];
          audience: Database['public']['Enums']['audience'];
          cancelled_at: string | null;
          capacity: number;
          cost_cents: number;
          created_at: string;
          created_by: string;
          currency: string;
          deadline_at: string;
          duration_minutes: number;
          expired_at: string | null;
          host_id: string;
          id: string;
          kit_note: string | null;
          level_label: string | null;
          locked_at: string | null;
          member_count: number;
          place_id: string | null;
          poll_closes_at: string | null;
          source: Database['public']['Enums']['plan_source'];
          source_activity_id: string | null;
          sport_id: string;
          starts_at: string;
          status: Database['public']['Enums']['plan_status'];
          team_a_label: string | null;
          team_b_label: string | null;
          teams_note: string | null;
          title: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          attendance_rule?: Database['public']['Enums']['attendance_rule'];
          audience?: Database['public']['Enums']['audience'];
          cancelled_at?: string | null;
          capacity: number;
          cost_cents?: number;
          created_at?: string;
          created_by: string;
          currency?: string;
          deadline_at: string;
          duration_minutes: number;
          expired_at?: string | null;
          host_id: string;
          id?: string;
          kit_note?: string | null;
          level_label?: string | null;
          locked_at?: string | null;
          member_count?: number;
          place_id?: string | null;
          poll_closes_at?: string | null;
          source: Database['public']['Enums']['plan_source'];
          source_activity_id?: string | null;
          sport_id: string;
          starts_at: string;
          status?: Database['public']['Enums']['plan_status'];
          team_a_label?: string | null;
          team_b_label?: string | null;
          teams_note?: string | null;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          attendance_rule?: Database['public']['Enums']['attendance_rule'];
          audience?: Database['public']['Enums']['audience'];
          cancelled_at?: string | null;
          capacity?: number;
          cost_cents?: number;
          created_at?: string;
          created_by?: string;
          currency?: string;
          deadline_at?: string;
          duration_minutes?: number;
          expired_at?: string | null;
          host_id?: string;
          id?: string;
          kit_note?: string | null;
          level_label?: string | null;
          locked_at?: string | null;
          member_count?: number;
          place_id?: string | null;
          poll_closes_at?: string | null;
          source?: Database['public']['Enums']['plan_source'];
          source_activity_id?: string | null;
          sport_id?: string;
          starts_at?: string;
          status?: Database['public']['Enums']['plan_status'];
          team_a_label?: string | null;
          team_b_label?: string | null;
          teams_note?: string | null;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plans_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plans_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plans_place_id_fkey';
            columns: ['place_id'];
            isOneToOne: false;
            referencedRelation: 'places';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plans_source_activity_fk';
            columns: ['source_activity_id'];
            isOneToOne: false;
            referencedRelation: 'activities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plans_source_activity_fk';
            columns: ['source_activity_id'];
            isOneToOne: false;
            referencedRelation: 'activity_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plans_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
        ];
      };
      privacy_settings: {
        Row: {
          availability_visibility: Database['public']['Enums']['visibility'];
          history_visibility: Database['public']['Enums']['visibility'];
          sports_visibility: Database['public']['Enums']['visibility'];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          availability_visibility?: Database['public']['Enums']['visibility'];
          history_visibility?: Database['public']['Enums']['visibility'];
          sports_visibility?: Database['public']['Enums']['visibility'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          availability_visibility?: Database['public']['Enums']['visibility'];
          history_visibility?: Database['public']['Enums']['visibility'];
          sports_visibility?: Database['public']['Enums']['visibility'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'privacy_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profile_private: {
        Row: {
          area_lat: number | null;
          area_lng: number | null;
          discovery_radius_km: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          area_lat?: number | null;
          area_lng?: number | null;
          discovery_radius_km?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          area_lat?: number | null;
          area_lng?: number | null;
          discovery_radius_km?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profile_private_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          area: string | null;
          avatar_path: string | null;
          created_at: string;
          display_name: string | null;
          handle: string | null;
          id: string;
          onboarding_completed_at: string | null;
          time_zone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          area?: string | null;
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string | null;
          handle?: string | null;
          id: string;
          onboarding_completed_at?: string | null;
          time_zone?: string;
          updated_at?: string;
        };
        Update: {
          area?: string | null;
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string | null;
          handle?: string | null;
          id?: string;
          onboarding_completed_at?: string | null;
          time_zone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pull_me_in: {
        Row: {
          created_at: string;
          scope: Database['public']['Enums']['pull_scope'];
          sport_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          scope?: Database['public']['Enums']['pull_scope'];
          sport_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          scope?: Database['public']['Enums']['pull_scope'];
          sport_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pull_me_in_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pull_me_in_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      recaps: {
        Row: {
          activity_id: string;
          confirmed_count: number;
          created_at: string;
          duration_minutes: number;
          finalized_at: string | null;
          id: string;
          moments_count: number;
          occurred_at: string;
          place_id: string | null;
          played_count: number;
          result_proposal_id: string | null;
          sport_id: string;
          team_a_label: string | null;
          team_a_score: number | null;
          team_b_label: string | null;
          team_b_score: number | null;
          updated_at: string;
          verification_level: Database['public']['Enums']['verification_level'] | null;
        };
        ComputedFields: never;
        Insert: {
          activity_id: string;
          confirmed_count?: number;
          created_at?: string;
          duration_minutes: number;
          finalized_at?: string | null;
          id?: string;
          moments_count?: number;
          occurred_at: string;
          place_id?: string | null;
          played_count?: number;
          result_proposal_id?: string | null;
          sport_id: string;
          team_a_label?: string | null;
          team_a_score?: number | null;
          team_b_label?: string | null;
          team_b_score?: number | null;
          updated_at?: string;
          verification_level?: Database['public']['Enums']['verification_level'] | null;
        };
        Update: {
          activity_id?: string;
          confirmed_count?: number;
          created_at?: string;
          duration_minutes?: number;
          finalized_at?: string | null;
          id?: string;
          moments_count?: number;
          occurred_at?: string;
          place_id?: string | null;
          played_count?: number;
          result_proposal_id?: string | null;
          sport_id?: string;
          team_a_label?: string | null;
          team_a_score?: number | null;
          team_b_label?: string | null;
          team_b_score?: number | null;
          updated_at?: string;
          verification_level?: Database['public']['Enums']['verification_level'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'recaps_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: true;
            referencedRelation: 'activities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recaps_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: true;
            referencedRelation: 'activity_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recaps_place_id_fkey';
            columns: ['place_id'];
            isOneToOne: false;
            referencedRelation: 'places';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recaps_result_proposal_id_fkey';
            columns: ['result_proposal_id'];
            isOneToOne: false;
            referencedRelation: 'result_proposals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recaps_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          id: string;
          note: string | null;
          reason: Database['public']['Enums']['report_reason'];
          reporter_id: string;
          status: string;
          subject_id: string;
          subject_kind: Database['public']['Enums']['report_subject'];
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          note?: string | null;
          reason: Database['public']['Enums']['report_reason'];
          reporter_id: string;
          status?: string;
          subject_id: string;
          subject_kind: Database['public']['Enums']['report_subject'];
        };
        Update: {
          created_at?: string;
          id?: string;
          note?: string | null;
          reason?: Database['public']['Enums']['report_reason'];
          reporter_id?: string;
          status?: string;
          subject_id?: string;
          subject_kind?: Database['public']['Enums']['report_subject'];
        };
        Relationships: [
          {
            foreignKeyName: 'reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      reputation_signals: {
        Row: {
          activity_id: string;
          created_at: string;
          giver_id: string;
          kind: Database['public']['Enums']['reputation_kind'];
          subject_id: string;
        };
        ComputedFields: never;
        Insert: {
          activity_id: string;
          created_at?: string;
          giver_id: string;
          kind: Database['public']['Enums']['reputation_kind'];
          subject_id: string;
        };
        Update: {
          activity_id?: string;
          created_at?: string;
          giver_id?: string;
          kind?: Database['public']['Enums']['reputation_kind'];
          subject_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reputation_signals_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reputation_signals_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activity_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reputation_signals_giver_id_fkey';
            columns: ['giver_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reputation_signals_subject_id_fkey';
            columns: ['subject_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      result_confirmations: {
        Row: {
          created_at: string;
          proposal_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          proposal_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          proposal_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'result_confirmations_proposal_id_fkey';
            columns: ['proposal_id'];
            isOneToOne: false;
            referencedRelation: 'result_proposals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'result_confirmations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      result_proposals: {
        Row: {
          activity_id: string;
          confirmations_count: number;
          created_at: string;
          id: string;
          proposed_by: string;
          status: Database['public']['Enums']['proposal_status'];
          superseded_at: string | null;
          team_a_score: number;
          team_b_score: number;
          threshold: number;
          verification_level: Database['public']['Enums']['verification_level'];
          verified_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          activity_id: string;
          confirmations_count?: number;
          created_at?: string;
          id?: string;
          proposed_by: string;
          status?: Database['public']['Enums']['proposal_status'];
          superseded_at?: string | null;
          team_a_score: number;
          team_b_score: number;
          threshold: number;
          verification_level?: Database['public']['Enums']['verification_level'];
          verified_at?: string | null;
        };
        Update: {
          activity_id?: string;
          confirmations_count?: number;
          created_at?: string;
          id?: string;
          proposed_by?: string;
          status?: Database['public']['Enums']['proposal_status'];
          superseded_at?: string | null;
          team_a_score?: number;
          team_b_score?: number;
          threshold?: number;
          verification_level?: Database['public']['Enums']['verification_level'];
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'result_proposals_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'result_proposals_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activity_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'result_proposals_proposed_by_fkey';
            columns: ['proposed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      sports: {
        Row: {
          default_capacity: number;
          default_duration_minutes: number;
          family: string;
          id: string;
          name: string;
          sort_order: number;
          team_based: boolean;
        };
        ComputedFields: never;
        Insert: {
          default_capacity: number;
          default_duration_minutes: number;
          family: string;
          id: string;
          name: string;
          sort_order?: number;
          team_based?: boolean;
        };
        Update: {
          default_capacity?: number;
          default_duration_minutes?: number;
          family?: string;
          id?: string;
          name?: string;
          sort_order?: number;
          team_based?: boolean;
        };
        Relationships: [];
      };
      user_sports: {
        Row: {
          created_at: string;
          is_main: boolean;
          level: Database['public']['Enums']['skill_level'];
          position: string | null;
          sport_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          is_main?: boolean;
          level: Database['public']['Enums']['skill_level'];
          position?: string | null;
          sport_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          is_main?: boolean;
          level?: Database['public']['Enums']['skill_level'];
          position?: string | null;
          sport_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_sports_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_sports_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      activity_cards: {
        Row: {
          after_closes_at: string;
          attendance_rule: Database['public']['Enums']['attendance_rule'];
          cancelled_at: string | null;
          capacity: number;
          check_in_closes_at: string;
          check_in_opens_at: string;
          check_in_radius_m: number;
          checked_in_count: number;
          confirmed_count: number;
          cost_cents: number;
          currency: string;
          effective_status: Database['public']['Enums']['activity_status'] | null;
          ended_at: string | null;
          ends_at: string;
          host_id: string;
          id: string;
          kit_note: string | null;
          level_label: string | null;
          live_at: string | null;
          my_attendance: Database['public']['Enums']['attendance_status'] | null;
          my_waitlist_position: number | null;
          place_area: string | null;
          place_floodlit_until: string | null;
          place_id: string | null;
          place_lat: number | null;
          place_lng: number | null;
          place_name: string | null;
          place_surface: string | null;
          place_time_zone: string | null;
          plan_id: string;
          sport_id: string;
          sport_name: string;
          starts_at: string;
          status: Database['public']['Enums']['activity_status'];
          team_a_label: string | null;
          team_b_label: string | null;
          teams_note: string | null;
          title: string | null;
          waitlist_count: number;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'activities_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activities_place_id_fkey';
            columns: ['place_id'];
            isOneToOne: false;
            referencedRelation: 'places';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activities_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: true;
            referencedRelation: 'plan_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activities_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: true;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activities_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
        ];
      };
      plan_cards: {
        Row: {
          activity_id: string | null;
          attendance_rule: Database['public']['Enums']['attendance_rule'];
          audience: Database['public']['Enums']['audience'];
          capacity: number;
          cost_cents: number;
          created_at: string;
          created_by: string;
          currency: string;
          deadline_at: string;
          duration_minutes: number;
          effective_status: Database['public']['Enums']['plan_status'] | null;
          host_id: string;
          i_am_in: boolean | null;
          id: string;
          kit_note: string | null;
          level_label: string | null;
          locked_at: string | null;
          member_count: number;
          place_area: string | null;
          place_floodlit_until: string | null;
          place_id: string | null;
          place_is_free: boolean | null;
          place_lat: number | null;
          place_lng: number | null;
          place_name: string | null;
          place_surface: string | null;
          poll_closes_at: string | null;
          source: Database['public']['Enums']['plan_source'];
          source_activity_id: string | null;
          sport_family: string;
          sport_id: string;
          sport_name: string;
          spots_left: number | null;
          starts_at: string;
          status: Database['public']['Enums']['plan_status'];
          team_a_label: string | null;
          team_b_label: string | null;
          teams_note: string | null;
          title: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'plans_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plans_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plans_place_id_fkey';
            columns: ['place_id'];
            isOneToOne: false;
            referencedRelation: 'places';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plans_source_activity_fk';
            columns: ['source_activity_id'];
            isOneToOne: false;
            referencedRelation: 'activities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plans_source_activity_fk';
            columns: ['source_activity_id'];
            isOneToOne: false;
            referencedRelation: 'activity_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plans_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      activity_roster: {
        Args: { p_activity_id: string };
        Returns: {
          avatar_path: string;
          checked_in_at: string;
          display_name: string;
          games_with_me: number;
          invited_by_me: boolean;
          is_host: boolean;
          is_me: boolean;
          position: string;
          status: Database['public']['Enums']['attendance_status'];
          team: Database['public']['Enums']['team_side'];
          user_id: string;
          waitlisted_at: string;
        }[];
      };
      add_moment: {
        Args: {
          p_activity_id: string;
          p_alt_text?: string;
          p_caption?: string;
          p_storage_path: string;
          p_tagged_user_ids?: string[];
        };
        Returns: string;
      };
      assign_team: {
        Args: {
          p_activity_id: string;
          p_team: Database['public']['Enums']['team_side'];
          p_user_id: string;
        };
        Returns: boolean;
      };
      availability_overlap: {
        Args: { p_user_id: string };
        Returns: {
          day_of_week: number;
          part: Database['public']['Enums']['day_part'];
        }[];
      };
      block_user: { Args: { p_user_id: string }; Returns: boolean };
      cancel_activity: {
        Args: { p_activity_id: string };
        Returns: Database['public']['Enums']['activity_status'];
      };
      cancel_attendance: {
        Args: { p_activity_id: string; p_idempotency_key: string };
        Returns: Database['public']['CompositeTypes']['attendance_state'];
        SetofOptions: {
          from: '*';
          to: 'attendance_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cancel_plan: {
        Args: { p_plan_id: string };
        Returns: Database['public']['CompositeTypes']['plan_state'];
        SetofOptions: {
          from: '*';
          to: 'plan_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      check_in: {
        Args: { p_activity_id: string; p_idempotency_key: string; p_lat: number; p_lng: number };
        Returns: Database['public']['CompositeTypes']['attendance_state'];
        SetofOptions: {
          from: '*';
          to: 'attendance_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      confirm_result: {
        Args: { p_idempotency_key: string; p_proposal_id: string };
        Returns: Database['public']['CompositeTypes']['result_state'];
        SetofOptions: {
          from: '*';
          to: 'result_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_down_for: {
        Args: {
          p_audience?: Database['public']['Enums']['audience'];
          p_expires_at: string;
          p_idempotency_key: string;
          p_min_participants?: number;
          p_place_id?: string;
          p_radius_km?: number;
          p_sport_id: string;
          p_window_end: string;
          p_window_start: string;
        };
        Returns: Database['public']['CompositeTypes']['down_for_state'];
        SetofOptions: {
          from: '*';
          to: 'down_for_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_plan: {
        Args: {
          p_attendance_rule?: Database['public']['Enums']['attendance_rule'];
          p_audience?: Database['public']['Enums']['audience'];
          p_capacity: number;
          p_cost_cents?: number;
          p_deadline_at?: string;
          p_duration_minutes?: number;
          p_idempotency_key: string;
          p_kit_note?: string;
          p_level_label?: string;
          p_meeting_lat?: number;
          p_meeting_lng?: number;
          p_meeting_point?: string;
          p_place_id?: string;
          p_poll_closes_at?: string;
          p_sport_id: string;
          p_starts_at: string;
          p_team_a_label?: string;
          p_team_b_label?: string;
          p_teams_note?: string;
          p_time_options?: string[];
          p_title?: string;
        };
        Returns: Database['public']['CompositeTypes']['plan_state'];
        SetofOptions: {
          from: '*';
          to: 'plan_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      decline_invite: {
        Args: { p_invite_id: string };
        Returns: Database['public']['Enums']['invite_status'];
      };
      down_for_nearby: {
        Args: { p_limit?: number; p_sport_id?: string };
        Returns: {
          avatar_path: string;
          display_name: string;
          expires_at: string;
          signal_id: string;
          sport_id: string;
          user_id: string;
          window_end: string;
          window_start: string;
        }[];
      };
      end_activity: {
        Args: { p_activity_id: string };
        Returns: Database['public']['Enums']['activity_status'];
      };
      give_reputation: {
        Args: {
          p_activity_id: string;
          p_kind: Database['public']['Enums']['reputation_kind'];
          p_subject_id: string;
        };
        Returns: boolean;
      };
      host_check_in: {
        Args: { p_activity_id: string; p_user_id: string };
        Returns: Database['public']['CompositeTypes']['attendance_state'];
        SetofOptions: {
          from: '*';
          to: 'attendance_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      im_down: {
        Args: { p_idempotency_key: string; p_plan_id: string };
        Returns: Database['public']['CompositeTypes']['plan_state'];
        SetofOptions: {
          from: '*';
          to: 'plan_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      join_waitlist: {
        Args: { p_activity_id: string; p_idempotency_key: string };
        Returns: Database['public']['CompositeTypes']['attendance_state'];
        SetofOptions: {
          from: '*';
          to: 'attendance_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      leave_plan: {
        Args: { p_idempotency_key: string; p_plan_id: string };
        Returns: Database['public']['CompositeTypes']['plan_state'];
        SetofOptions: {
          from: '*';
          to: 'plan_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      my_blocks: {
        Args: Record<PropertyKey, never>;
        Returns: {
          blocked_at: string;
          display_name: string;
          user_id: string;
        }[];
      };
      plan_roster: {
        Args: { p_plan_id: string };
        Returns: {
          avatar_path: string;
          display_name: string;
          games_with_me: number;
          hosted_count: number;
          invited_by_me: boolean;
          is_first_game: boolean;
          is_host: boolean;
          is_me: boolean;
          joined_at: string;
          position: string;
          user_id: string;
          via: Database['public']['Enums']['member_via'];
        }[];
      };
      plans_nearby: {
        Args: { p_limit?: number; p_max_km?: number; p_sport_id?: string; p_until?: string };
        Returns: {
          capacity: number;
          distance_km: number;
          effective_status: Database['public']['Enums']['plan_status'];
          host_id: string;
          i_am_in: boolean;
          member_count: number;
          place_area: string;
          place_id: string;
          place_name: string;
          plan_id: string;
          sport_id: string;
          sport_name: string;
          starts_at: string;
          title: string;
        }[];
      };
      profile_reputation: {
        Args: { p_user_id: string };
        Returns: {
          confirmations: number;
          kind: Database['public']['Enums']['reputation_kind'];
        }[];
      };
      profile_sports: {
        Args: { p_user_id: string };
        Returns: {
          is_main: boolean;
          level: Database['public']['Enums']['skill_level'];
          position: string;
          sport_id: string;
          sport_name: string;
        }[];
      };
      profile_view: {
        Args: { p_user_id: string };
        Returns: {
          area: string;
          availability_visibility: Database['public']['Enums']['visibility'];
          availability_visible: boolean;
          avatar_path: string;
          display_name: string;
          games_with_me: number;
          handle: string;
          history_visibility: Database['public']['Enums']['visibility'];
          history_visible: boolean;
          hosted_count: number;
          is_me: boolean;
          ojoro_hours: number;
          onboarding_completed_at: string;
          people_moved_with: number;
          places: number;
          sessions: number;
          sports_visibility: Database['public']['Enums']['visibility'];
          sports_visible: boolean;
          user_id: string;
        }[];
      };
      propose_result: {
        Args: {
          p_activity_id: string;
          p_idempotency_key: string;
          p_team_a_score: number;
          p_team_b_score: number;
        };
        Returns: Database['public']['CompositeTypes']['result_state'];
        SetofOptions: {
          from: '*';
          to: 'result_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      propose_time: { Args: { p_plan_id: string; p_starts_at: string }; Returns: string };
      pull_in: {
        Args: { p_idempotency_key: string; p_invitee_ids: string[]; p_plan_id: string };
        Returns: Database['public']['CompositeTypes']['pull_in_result'];
        SetofOptions: {
          from: '*';
          to: 'pull_in_result';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      pull_in_candidates: {
        Args: { p_limit?: number; p_plan_id: string };
        Returns: {
          already_invited: boolean;
          avatar_path: string;
          display_name: string;
          free_at_plan_time: boolean;
          games_with_me: number;
          plays_sport: boolean;
          pull_me_in: boolean;
          user_id: string;
        }[];
      };
      pull_in_quota: {
        Args: { p_plan_id: string };
        Returns: {
          quota: number;
          remaining: number;
          used: number;
        }[];
      };
      recap_for_me: {
        Args: { p_activity_id: string };
        Returns: {
          first_at_place: string;
          minutes: number;
          occurred_at: string;
          ojoro_hours: number;
          passport_entry_id: string;
          place_game_number: number;
          place_id: string;
          place_name: string;
          sport_game_number: number;
        }[];
      };
      recap_people: {
        Args: { p_activity_id: string };
        Returns: {
          avatar_path: string;
          display_name: string;
          games_with_me: number;
          is_first_with_me: boolean;
          team: Database['public']['Enums']['team_side'];
          user_id: string;
        }[];
      };
      remove_moment: { Args: { p_moment_id: string }; Returns: boolean };
      report: {
        Args: {
          p_note?: string;
          p_reason: Database['public']['Enums']['report_reason'];
          p_subject_id: string;
          p_subject_kind: Database['public']['Enums']['report_subject'];
        };
        Returns: string;
      };
      run_it_back: {
        Args: { p_activity_id: string; p_idempotency_key: string; p_starts_at: string };
        Returns: Database['public']['CompositeTypes']['run_it_back_state'];
        SetofOptions: {
          from: '*';
          to: 'run_it_back_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_onboarding: {
        Args: {
          p_area?: string;
          p_area_lat?: number;
          p_area_lng?: number;
          p_availability: Json;
          p_discovery_radius_km: number;
          p_display_name?: string;
          p_privacy?: Json;
          p_pull_me_in?: Json;
          p_sports: Json;
        };
        Returns: {
          area: string | null;
          avatar_path: string | null;
          created_at: string;
          display_name: string | null;
          handle: string | null;
          id: string;
          onboarding_completed_at: string | null;
          time_zone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'profiles';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_pull_me_in: {
        Args: {
          p_enabled: boolean;
          p_scope?: Database['public']['Enums']['pull_scope'];
          p_sport_id: string;
        };
        Returns: boolean;
      };
      share_location: {
        Args: { p_activity_id: string; p_lat?: number; p_lng?: number; p_until?: string };
        Returns: Database['public']['CompositeTypes']['location_share_state'];
        SetofOptions: {
          from: '*';
          to: 'location_share_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      start_activity: {
        Args: { p_activity_id: string };
        Returns: Database['public']['Enums']['activity_status'];
      };
      still_on_nearby: {
        Args: { p_limit?: number; p_plan_id: string; p_within_hours?: number };
        Returns: {
          capacity: number;
          distance_km: number;
          effective_status: Database['public']['Enums']['plan_status'];
          host_id: string;
          i_am_in: boolean;
          member_count: number;
          place_area: string;
          place_id: string;
          place_name: string;
          plan_id: string;
          sport_id: string;
          sport_name: string;
          starts_at: string;
          title: string;
        }[];
      };
      stop_sharing_location: {
        Args: { p_activity_id: string };
        Returns: Database['public']['CompositeTypes']['location_share_state'];
        SetofOptions: {
          from: '*';
          to: 'location_share_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      unblock_user: { Args: { p_user_id: string }; Returns: boolean };
      untag_me: { Args: { p_moment_id: string }; Returns: boolean };
      update_profile: {
        Args: {
          p_area?: string;
          p_area_lat?: number;
          p_area_lng?: number;
          p_discovery_radius_km?: number;
          p_display_name?: string;
          p_handle?: string;
        };
        Returns: {
          area: string | null;
          avatar_path: string | null;
          created_at: string;
          display_name: string | null;
          handle: string | null;
          id: string;
          onboarding_completed_at: string | null;
          time_zone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'profiles';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      vote_time: {
        Args: { p_option_id: string; p_plan_id: string };
        Returns: {
          is_mine: boolean;
          option_id: string;
          starts_at: string;
          vote_count: number;
        }[];
      };
      withdraw_down_for: {
        Args: { p_signal_id: string };
        Returns: Database['public']['Enums']['signal_status'];
      };
    };
    Enums: {
      activity_status: 'confirmed' | 'live' | 'after' | 'complete' | 'cancelled';
      attendance_rule: 'check_in' | 'check_in_host_confirms';
      attendance_status: 'confirmed' | 'waitlisted' | 'cancelled' | 'checked_in';
      audience: 'public' | 'friends' | 'invite_only';
      check_in_method: 'location' | 'host';
      day_part: 'morning' | 'midday' | 'evening';
      invite_kind: 'pull_in' | 'run_it_back';
      invite_status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
      member_via: 'host' | 'im_down' | 'down_for' | 'invite';
      plan_source: 'down_for' | 'quick' | 'run_it_back';
      plan_status: 'forming' | 'game_on' | 'expired' | 'cancelled';
      proposal_status: 'proposed' | 'verified' | 'superseded';
      pull_scope: 'connections' | 'nearby';
      report_reason: 'spam' | 'harassment' | 'unsafe' | 'impersonation' | 'inappropriate' | 'other';
      report_subject: 'profile' | 'plan' | 'activity' | 'moment' | 'result';
      reputation_kind: 'shows_up' | 'respectful' | 'welcomes_beginners' | 'great_host';
      signal_status: 'active' | 'matched' | 'withdrawn' | 'expired';
      skill_level: 'learning' | 'casual' | 'intermediate' | 'advanced';
      team_side: 'a' | 'b';
      verification_level:
        | 'self_recorded'
        | 'participant_confirmed'
        | 'organizer_verified'
        | 'device_verified'
        | 'official_competition_verified';
      visibility: 'everyone' | 'friends' | 'crews' | 'only_me';
    };
    CompositeTypes: {
      attendance_state: {
        activity_id: string | null;
        status: Database['public']['Enums']['attendance_status'] | null;
        waitlist_position: number | null;
        confirmed_count: number | null;
        waitlist_count: number | null;
        checked_in_count: number | null;
        capacity: number | null;
        changed: boolean | null;
        promoted_user_id: string | null;
      };
      down_for_state: {
        signal_id: string | null;
        status: Database['public']['Enums']['signal_status'] | null;
        created: boolean | null;
        expires_at: string | null;
        matched_plan_id: string | null;
        plan_created: boolean | null;
      };
      location_share_state: {
        activity_id: string | null;
        sharing: boolean | null;
        expires_at: string | null;
      };
      plan_state: {
        plan_id: string | null;
        status: Database['public']['Enums']['plan_status'] | null;
        member_count: number | null;
        capacity: number | null;
        is_member: boolean | null;
        changed: boolean | null;
        activity_id: string | null;
        starts_at: string | null;
      };
      pull_in_result: {
        sent: number | null;
        skipped: number | null;
        remaining: number | null;
      };
      result_state: {
        proposal_id: string | null;
        activity_id: string | null;
        status: Database['public']['Enums']['proposal_status'] | null;
        team_a_score: number | null;
        team_b_score: number | null;
        confirmations_count: number | null;
        threshold: number | null;
        verification_level: Database['public']['Enums']['verification_level'] | null;
        recap_id: string | null;
      };
      run_it_back_state: {
        plan_id: string | null;
        created: boolean | null;
        invites_sent: number | null;
        starts_at: string | null;
        chain_length: number | null;
      };
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      activity_status: ['confirmed', 'live', 'after', 'complete', 'cancelled'],
      attendance_rule: ['check_in', 'check_in_host_confirms'],
      attendance_status: ['confirmed', 'waitlisted', 'cancelled', 'checked_in'],
      audience: ['public', 'friends', 'invite_only'],
      check_in_method: ['location', 'host'],
      day_part: ['morning', 'midday', 'evening'],
      invite_kind: ['pull_in', 'run_it_back'],
      invite_status: ['pending', 'accepted', 'declined', 'revoked', 'expired'],
      member_via: ['host', 'im_down', 'down_for', 'invite'],
      plan_source: ['down_for', 'quick', 'run_it_back'],
      plan_status: ['forming', 'game_on', 'expired', 'cancelled'],
      proposal_status: ['proposed', 'verified', 'superseded'],
      pull_scope: ['connections', 'nearby'],
      report_reason: ['spam', 'harassment', 'unsafe', 'impersonation', 'inappropriate', 'other'],
      report_subject: ['profile', 'plan', 'activity', 'moment', 'result'],
      reputation_kind: ['shows_up', 'respectful', 'welcomes_beginners', 'great_host'],
      signal_status: ['active', 'matched', 'withdrawn', 'expired'],
      skill_level: ['learning', 'casual', 'intermediate', 'advanced'],
      team_side: ['a', 'b'],
      verification_level: [
        'self_recorded',
        'participant_confirmed',
        'organizer_verified',
        'device_verified',
        'official_competition_verified',
      ],
      visibility: ['everyone', 'friends', 'crews', 'only_me'],
    },
  },
} as const;
