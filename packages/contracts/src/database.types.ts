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
      activity_followers: {
        Row: {
          activity_id: string;
          created_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          activity_id: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          activity_id?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'activity_followers_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_followers_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activity_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_followers_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      activity_live: {
        Row: {
          activity_id: string;
          follower_count: number;
          last_update_at: string | null;
          reaction_counts: NonNullable<Json>;
          score_logged_by: string | null;
          score_updated_at: string | null;
          team_a_score: number | null;
          team_b_score: number | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          activity_id: string;
          follower_count?: number;
          last_update_at?: string | null;
          reaction_counts?: NonNullable<Json>;
          score_logged_by?: string | null;
          score_updated_at?: string | null;
          team_a_score?: number | null;
          team_b_score?: number | null;
          updated_at?: string;
        };
        Update: {
          activity_id?: string;
          follower_count?: number;
          last_update_at?: string | null;
          reaction_counts?: NonNullable<Json>;
          score_logged_by?: string | null;
          score_updated_at?: string | null;
          team_a_score?: number | null;
          team_b_score?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'activity_live_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: true;
            referencedRelation: 'activities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_live_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: true;
            referencedRelation: 'activity_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_live_score_logged_by_fkey';
            columns: ['score_logged_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      activity_reactions: {
        Row: {
          activity_id: string;
          created_at: string;
          reaction: Database['public']['Enums']['reaction_word'];
          update_id: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          activity_id: string;
          created_at?: string;
          reaction: Database['public']['Enums']['reaction_word'];
          update_id?: string | null;
          user_id: string;
        };
        Update: {
          activity_id?: string;
          created_at?: string;
          reaction?: Database['public']['Enums']['reaction_word'];
          update_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'activity_reactions_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_reactions_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activity_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_reactions_update_id_fkey';
            columns: ['update_id'];
            isOneToOne: false;
            referencedRelation: 'activity_updates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_reactions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      activity_updates: {
        Row: {
          activity_id: string;
          audience: Database['public']['Enums']['update_audience'];
          author_id: string | null;
          body: string | null;
          created_at: string;
          deleted_at: string | null;
          id: string;
          kind: Database['public']['Enums']['update_kind'];
          reaction_counts: NonNullable<Json>;
          team_a_score: number | null;
          team_b_score: number | null;
        };
        ComputedFields: never;
        Insert: {
          activity_id: string;
          audience?: Database['public']['Enums']['update_audience'];
          author_id?: string | null;
          body?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          kind: Database['public']['Enums']['update_kind'];
          reaction_counts?: NonNullable<Json>;
          team_a_score?: number | null;
          team_b_score?: number | null;
        };
        Update: {
          activity_id?: string;
          audience?: Database['public']['Enums']['update_audience'];
          author_id?: string | null;
          body?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['update_kind'];
          reaction_counts?: NonNullable<Json>;
          team_a_score?: number | null;
          team_b_score?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'activity_updates_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_updates_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activity_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_updates_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
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
      call_outs: {
        Row: {
          audience: Database['public']['Enums']['challenge_audience'];
          challenger_crew_id: string | null;
          challenger_id: string;
          countered_from: string | null;
          course_note: string | null;
          created_at: string;
          event_id: string | null;
          expires_at: string;
          format: Database['public']['Enums']['challenge_format'];
          id: string;
          message: string | null;
          opponent_crew_id: string | null;
          opponent_id: string | null;
          place_id: string | null;
          rematch_of_event_id: string | null;
          responded_at: string | null;
          responded_by: string | null;
          rivalry_id: string | null;
          scoring: Database['public']['Enums']['challenge_scoring'];
          side_size: number;
          sport_id: string;
          starts_at: string;
          status: Database['public']['Enums']['call_out_status'];
          target: number | null;
          time_zone: string;
          title: string;
          unit: string | null;
          updated_at: string;
          verification: Database['public']['Enums']['challenge_verification_method'];
        };
        ComputedFields: never;
        Insert: {
          audience?: Database['public']['Enums']['challenge_audience'];
          challenger_crew_id?: string | null;
          challenger_id: string;
          countered_from?: string | null;
          course_note?: string | null;
          created_at?: string;
          event_id?: string | null;
          expires_at: string;
          format: Database['public']['Enums']['challenge_format'];
          id?: string;
          message?: string | null;
          opponent_crew_id?: string | null;
          opponent_id?: string | null;
          place_id?: string | null;
          rematch_of_event_id?: string | null;
          responded_at?: string | null;
          responded_by?: string | null;
          rivalry_id?: string | null;
          scoring: Database['public']['Enums']['challenge_scoring'];
          side_size?: number;
          sport_id: string;
          starts_at: string;
          status?: Database['public']['Enums']['call_out_status'];
          target?: number | null;
          time_zone?: string;
          title: string;
          unit?: string | null;
          updated_at?: string;
          verification?: Database['public']['Enums']['challenge_verification_method'];
        };
        Update: {
          audience?: Database['public']['Enums']['challenge_audience'];
          challenger_crew_id?: string | null;
          challenger_id?: string;
          countered_from?: string | null;
          course_note?: string | null;
          created_at?: string;
          event_id?: string | null;
          expires_at?: string;
          format?: Database['public']['Enums']['challenge_format'];
          id?: string;
          message?: string | null;
          opponent_crew_id?: string | null;
          opponent_id?: string | null;
          place_id?: string | null;
          rematch_of_event_id?: string | null;
          responded_at?: string | null;
          responded_by?: string | null;
          rivalry_id?: string | null;
          scoring?: Database['public']['Enums']['challenge_scoring'];
          side_size?: number;
          sport_id?: string;
          starts_at?: string;
          status?: Database['public']['Enums']['call_out_status'];
          target?: number | null;
          time_zone?: string;
          title?: string;
          unit?: string | null;
          updated_at?: string;
          verification?: Database['public']['Enums']['challenge_verification_method'];
        };
        Relationships: [
          {
            foreignKeyName: 'call_outs_challenger_crew_id_fkey';
            columns: ['challenger_crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'call_outs_challenger_id_fkey';
            columns: ['challenger_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'call_outs_countered_from_fkey';
            columns: ['countered_from'];
            isOneToOne: false;
            referencedRelation: 'call_outs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'call_outs_event_fk';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'call_outs_opponent_crew_id_fkey';
            columns: ['opponent_crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'call_outs_opponent_id_fkey';
            columns: ['opponent_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'call_outs_place_id_fkey';
            columns: ['place_id'];
            isOneToOne: false;
            referencedRelation: 'places';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'call_outs_rematch_fk';
            columns: ['rematch_of_event_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'call_outs_responded_by_fkey';
            columns: ['responded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'call_outs_rivalry_id_fkey';
            columns: ['rivalry_id'];
            isOneToOne: false;
            referencedRelation: 'rivalries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'call_outs_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_backings: {
        Row: {
          created_at: string;
          event_id: string;
          side: Database['public']['Enums']['team_side'];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_id: string;
          side: Database['public']['Enums']['team_side'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          side?: Database['public']['Enums']['team_side'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_backings_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_backings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_comment_respects: {
        Row: {
          comment_id: string;
          created_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          comment_id: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          comment_id?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_comment_respects_comment_id_fkey';
            columns: ['comment_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_comment_respects_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_comments: {
        Row: {
          author_id: string;
          body: string | null;
          created_at: string;
          deleted_at: string | null;
          event_id: string;
          id: string;
          parent_id: string | null;
          post_id: string | null;
          reply_count: number;
          respect_count: number;
        };
        ComputedFields: never;
        Insert: {
          author_id: string;
          body?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          event_id: string;
          id?: string;
          parent_id?: string | null;
          post_id?: string | null;
          reply_count?: number;
          respect_count?: number;
        };
        Update: {
          author_id?: string;
          body?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          event_id?: string;
          id?: string;
          parent_id?: string | null;
          post_id?: string | null;
          reply_count?: number;
          respect_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_comments_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_comments_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_comments_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_comments_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_posts';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_competitors: {
        Row: {
          checked_in_at: string | null;
          event_id: string;
          is_captain: boolean;
          joined_at: string;
          ready_at: string | null;
          side: Database['public']['Enums']['team_side'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          checked_in_at?: string | null;
          event_id: string;
          is_captain?: boolean;
          joined_at?: string;
          ready_at?: string | null;
          side: Database['public']['Enums']['team_side'];
          user_id: string;
        };
        Update: {
          checked_in_at?: string | null;
          event_id?: string;
          is_captain?: boolean;
          joined_at?: string;
          ready_at?: string | null;
          side?: Database['public']['Enums']['team_side'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_competitors_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_competitors_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_corrections: {
        Row: {
          created_at: string;
          event_id: string;
          id: string;
          note: string | null;
          requested_by: string;
          resolution: string | null;
          resolved_at: string | null;
          submission_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_id: string;
          id?: string;
          note?: string | null;
          requested_by: string;
          resolution?: string | null;
          resolved_at?: string | null;
          submission_id?: string | null;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          id?: string;
          note?: string | null;
          requested_by?: string;
          resolution?: string | null;
          resolved_at?: string | null;
          submission_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_corrections_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_corrections_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_corrections_submission_id_fkey';
            columns: ['submission_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_result_submissions';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_events: {
        Row: {
          a_captain_id: string;
          a_crew_id: string | null;
          a_progress: number | null;
          a_user_id: string | null;
          accepted_at: string;
          audience: Database['public']['Enums']['challenge_audience'];
          b_captain_id: string;
          b_crew_id: string | null;
          b_progress: number | null;
          b_user_id: string | null;
          backing_a: number;
          backing_b: number;
          call_out_id: string;
          cancel_reason: string | null;
          cancelled_at: string | null;
          check_in_opens_at: string;
          comment_count: number;
          completed_at: string | null;
          course_note: string | null;
          disputed_at: string | null;
          ended_at: string | null;
          follower_count: number;
          format: Database['public']['Enums']['challenge_format'];
          id: string;
          live_at: string | null;
          live_period: number | null;
          place_id: string | null;
          prediction_a: number;
          prediction_b: number;
          progress_logged_by: string | null;
          progress_updated_at: string | null;
          reaction_counts: NonNullable<Json>;
          rematch_of_event_id: string | null;
          rivalry_id: string;
          scoring: Database['public']['Enums']['challenge_scoring'];
          side_size: number;
          sport_id: string;
          starts_at: string;
          status: Database['public']['Enums']['challenge_status'];
          target: number | null;
          time_zone: string;
          title: string;
          unit: string | null;
          updated_at: string;
          verification: Database['public']['Enums']['challenge_verification_method'];
        };
        ComputedFields: never;
        Insert: {
          a_captain_id: string;
          a_crew_id?: string | null;
          a_progress?: number | null;
          a_user_id?: string | null;
          accepted_at?: string;
          audience: Database['public']['Enums']['challenge_audience'];
          b_captain_id: string;
          b_crew_id?: string | null;
          b_progress?: number | null;
          b_user_id?: string | null;
          backing_a?: number;
          backing_b?: number;
          call_out_id: string;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          check_in_opens_at: string;
          comment_count?: number;
          completed_at?: string | null;
          course_note?: string | null;
          disputed_at?: string | null;
          ended_at?: string | null;
          follower_count?: number;
          format: Database['public']['Enums']['challenge_format'];
          id?: string;
          live_at?: string | null;
          live_period?: number | null;
          place_id?: string | null;
          prediction_a?: number;
          prediction_b?: number;
          progress_logged_by?: string | null;
          progress_updated_at?: string | null;
          reaction_counts?: NonNullable<Json>;
          rematch_of_event_id?: string | null;
          rivalry_id: string;
          scoring: Database['public']['Enums']['challenge_scoring'];
          side_size: number;
          sport_id: string;
          starts_at: string;
          status?: Database['public']['Enums']['challenge_status'];
          target?: number | null;
          time_zone: string;
          title: string;
          unit?: string | null;
          updated_at?: string;
          verification: Database['public']['Enums']['challenge_verification_method'];
        };
        Update: {
          a_captain_id?: string;
          a_crew_id?: string | null;
          a_progress?: number | null;
          a_user_id?: string | null;
          accepted_at?: string;
          audience?: Database['public']['Enums']['challenge_audience'];
          b_captain_id?: string;
          b_crew_id?: string | null;
          b_progress?: number | null;
          b_user_id?: string | null;
          backing_a?: number;
          backing_b?: number;
          call_out_id?: string;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          check_in_opens_at?: string;
          comment_count?: number;
          completed_at?: string | null;
          course_note?: string | null;
          disputed_at?: string | null;
          ended_at?: string | null;
          follower_count?: number;
          format?: Database['public']['Enums']['challenge_format'];
          id?: string;
          live_at?: string | null;
          live_period?: number | null;
          place_id?: string | null;
          prediction_a?: number;
          prediction_b?: number;
          progress_logged_by?: string | null;
          progress_updated_at?: string | null;
          reaction_counts?: NonNullable<Json>;
          rematch_of_event_id?: string | null;
          rivalry_id?: string;
          scoring?: Database['public']['Enums']['challenge_scoring'];
          side_size?: number;
          sport_id?: string;
          starts_at?: string;
          status?: Database['public']['Enums']['challenge_status'];
          target?: number | null;
          time_zone?: string;
          title?: string;
          unit?: string | null;
          updated_at?: string;
          verification?: Database['public']['Enums']['challenge_verification_method'];
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_events_a_captain_id_fkey';
            columns: ['a_captain_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_events_a_crew_id_fkey';
            columns: ['a_crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_events_a_user_id_fkey';
            columns: ['a_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_events_b_captain_id_fkey';
            columns: ['b_captain_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_events_b_crew_id_fkey';
            columns: ['b_crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_events_b_user_id_fkey';
            columns: ['b_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_events_call_out_id_fkey';
            columns: ['call_out_id'];
            isOneToOne: true;
            referencedRelation: 'call_outs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_events_place_id_fkey';
            columns: ['place_id'];
            isOneToOne: false;
            referencedRelation: 'places';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_events_progress_logged_by_fkey';
            columns: ['progress_logged_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_events_rematch_of_event_id_fkey';
            columns: ['rematch_of_event_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_events_rivalry_id_fkey';
            columns: ['rivalry_id'];
            isOneToOne: false;
            referencedRelation: 'rivalries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_events_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_followers: {
        Row: {
          comments_muted: boolean;
          created_at: string;
          event_id: string;
          quiet: boolean;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          comments_muted?: boolean;
          created_at?: string;
          event_id: string;
          quiet?: boolean;
          user_id: string;
        };
        Update: {
          comments_muted?: boolean;
          created_at?: string;
          event_id?: string;
          quiet?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_followers_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_followers_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_organizers: {
        Row: {
          approved_at: string | null;
          created_at: string;
          event_id: string;
          proposed_by: string;
          proposed_side: Database['public']['Enums']['team_side'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          created_at?: string;
          event_id: string;
          proposed_by: string;
          proposed_side: Database['public']['Enums']['team_side'];
          user_id: string;
        };
        Update: {
          approved_at?: string | null;
          created_at?: string;
          event_id?: string;
          proposed_by?: string;
          proposed_side?: Database['public']['Enums']['team_side'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_organizers_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_organizers_proposed_by_fkey';
            columns: ['proposed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_organizers_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_poll_votes: {
        Row: {
          created_at: string;
          option_index: number;
          poll_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          option_index: number;
          poll_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          option_index?: number;
          poll_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_poll_votes_poll_id_fkey';
            columns: ['poll_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_polls';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_poll_votes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_polls: {
        Row: {
          closes_at: string;
          created_at: string;
          created_by: string;
          event_id: string;
          id: string;
          options: string[];
          question: string;
          template: Database['public']['Enums']['challenge_poll_template'];
          threshold: number | null;
          updated_at: string;
          vote_counts: number[];
        };
        ComputedFields: never;
        Insert: {
          closes_at: string;
          created_at?: string;
          created_by: string;
          event_id: string;
          id?: string;
          options: string[];
          question: string;
          template: Database['public']['Enums']['challenge_poll_template'];
          threshold?: number | null;
          updated_at?: string;
          vote_counts: number[];
        };
        Update: {
          closes_at?: string;
          created_at?: string;
          created_by?: string;
          event_id?: string;
          id?: string;
          options?: string[];
          question?: string;
          template?: Database['public']['Enums']['challenge_poll_template'];
          threshold?: number | null;
          updated_at?: string;
          vote_counts?: number[];
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_polls_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_polls_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_events';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_posts: {
        Row: {
          author_id: string | null;
          body: string | null;
          created_at: string;
          deleted_at: string | null;
          event_id: string;
          id: string;
          kind: Database['public']['Enums']['challenge_post_kind'];
          milestone: string | null;
          stats: Json | null;
        };
        ComputedFields: never;
        Insert: {
          author_id?: string | null;
          body?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          event_id: string;
          id?: string;
          kind: Database['public']['Enums']['challenge_post_kind'];
          milestone?: string | null;
          stats?: Json | null;
        };
        Update: {
          author_id?: string | null;
          body?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          event_id?: string;
          id?: string;
          kind?: Database['public']['Enums']['challenge_post_kind'];
          milestone?: string | null;
          stats?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_posts_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_posts_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_events';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_predictions: {
        Row: {
          created_at: string;
          event_id: string;
          side: Database['public']['Enums']['team_side'];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_id: string;
          side: Database['public']['Enums']['team_side'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          side?: Database['public']['Enums']['team_side'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_predictions_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_predictions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_reactions: {
        Row: {
          created_at: string;
          event_id: string;
          reaction: Database['public']['Enums']['reaction_word'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_id: string;
          reaction: Database['public']['Enums']['reaction_word'];
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          reaction?: Database['public']['Enums']['reaction_word'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_reactions_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_reactions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_result_confirmations: {
        Row: {
          created_at: string;
          submission_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          submission_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          submission_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_result_confirmations_submission_id_fkey';
            columns: ['submission_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_result_submissions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_result_confirmations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_result_submissions: {
        Row: {
          a_value: number;
          b_value: number;
          created_at: string;
          event_id: string;
          id: string;
          note: string | null;
          status: Database['public']['Enums']['challenge_submission_status'];
          submitted_by: string;
        };
        ComputedFields: never;
        Insert: {
          a_value: number;
          b_value: number;
          created_at?: string;
          event_id: string;
          id?: string;
          note?: string | null;
          status?: Database['public']['Enums']['challenge_submission_status'];
          submitted_by: string;
        };
        Update: {
          a_value?: number;
          b_value?: number;
          created_at?: string;
          event_id?: string;
          id?: string;
          note?: string | null;
          status?: Database['public']['Enums']['challenge_submission_status'];
          submitted_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_result_submissions_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_result_submissions_submitted_by_fkey';
            columns: ['submitted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_results: {
        Row: {
          a_value: number;
          b_value: number;
          crowd_called_it: boolean | null;
          event_id: string;
          margin: number;
          note: string | null;
          predicted_a: number;
          predicted_b: number;
          rivalry_id: string;
          source: Database['public']['Enums']['challenge_result_source'];
          submission_id: string | null;
          verified_at: string;
          watched_count: number;
          winner_side: Database['public']['Enums']['team_side'] | null;
        };
        ComputedFields: never;
        Insert: {
          a_value: number;
          b_value: number;
          crowd_called_it?: boolean | null;
          event_id: string;
          margin: number;
          note?: string | null;
          predicted_a?: number;
          predicted_b?: number;
          rivalry_id: string;
          source: Database['public']['Enums']['challenge_result_source'];
          submission_id?: string | null;
          verified_at?: string;
          watched_count?: number;
          winner_side?: Database['public']['Enums']['team_side'] | null;
        };
        Update: {
          a_value?: number;
          b_value?: number;
          crowd_called_it?: boolean | null;
          event_id?: string;
          margin?: number;
          note?: string | null;
          predicted_a?: number;
          predicted_b?: number;
          rivalry_id?: string;
          source?: Database['public']['Enums']['challenge_result_source'];
          submission_id?: string | null;
          verified_at?: string;
          watched_count?: number;
          winner_side?: Database['public']['Enums']['team_side'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_results_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: true;
            referencedRelation: 'challenge_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_results_rivalry_id_fkey';
            columns: ['rivalry_id'];
            isOneToOne: false;
            referencedRelation: 'rivalries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_results_submission_id_fkey';
            columns: ['submission_id'];
            isOneToOne: false;
            referencedRelation: 'challenge_result_submissions';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_suggestion_dismissals: {
        Row: {
          created_at: string;
          suggestion_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          suggestion_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          suggestion_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_suggestion_dismissals_suggestion_id_fkey';
            columns: ['suggestion_id'];
            isOneToOne: false;
            referencedRelation: 'chat_suggestions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chat_suggestion_dismissals_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_suggestions: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          crew_id: string;
          day_key: string;
          day_label: string;
          expires_at: string;
          id: string;
          interested_ids: string[];
          last_message_id: string | null;
          place_ids: string[];
          plan_id: string | null;
          proposed_times: string[];
          sport_id: string;
          status: Database['public']['Enums']['suggestion_status'];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          crew_id: string;
          day_key: string;
          day_label: string;
          expires_at: string;
          id?: string;
          interested_ids?: string[];
          last_message_id?: string | null;
          place_ids?: string[];
          plan_id?: string | null;
          proposed_times?: string[];
          sport_id: string;
          status?: Database['public']['Enums']['suggestion_status'];
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          crew_id?: string;
          day_key?: string;
          day_label?: string;
          expires_at?: string;
          id?: string;
          interested_ids?: string[];
          last_message_id?: string | null;
          place_ids?: string[];
          plan_id?: string | null;
          proposed_times?: string[];
          sport_id?: string;
          status?: Database['public']['Enums']['suggestion_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_suggestions_accepted_by_fkey';
            columns: ['accepted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chat_suggestions_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chat_suggestions_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plan_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chat_suggestions_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chat_suggestions_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
        ];
      };
      crew_members: {
        Row: {
          crew_id: string;
          invited_by: string | null;
          joined_at: string;
          role: Database['public']['Enums']['crew_role'];
          user_id: string;
          via: Database['public']['Enums']['crew_join_via'];
        };
        ComputedFields: never;
        Insert: {
          crew_id: string;
          invited_by?: string | null;
          joined_at?: string;
          role?: Database['public']['Enums']['crew_role'];
          user_id: string;
          via: Database['public']['Enums']['crew_join_via'];
        };
        Update: {
          crew_id?: string;
          invited_by?: string | null;
          joined_at?: string;
          role?: Database['public']['Enums']['crew_role'];
          user_id?: string;
          via?: Database['public']['Enums']['crew_join_via'];
        };
        Relationships: [
          {
            foreignKeyName: 'crew_members_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'crew_members_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'crew_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      crews: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by: string;
          id: string;
          is_private: boolean;
          member_count: number;
          name: string;
          sport_id: string | null;
          time_zone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by: string;
          id?: string;
          is_private?: boolean;
          member_count?: number;
          name: string;
          sport_id?: string | null;
          time_zone?: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          is_private?: boolean;
          member_count?: number;
          name?: string;
          sport_id?: string | null;
          time_zone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'crews_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'crews_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
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
      messages: {
        Row: {
          activity_id: string | null;
          body: string | null;
          created_at: string;
          crew_id: string | null;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          kind: Database['public']['Enums']['message_kind'];
          mention_ids: string[];
          payload: Json | null;
          reply_to: string | null;
          sender_id: string;
        };
        ComputedFields: never;
        Insert: {
          activity_id?: string | null;
          body?: string | null;
          created_at?: string;
          crew_id?: string | null;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['message_kind'];
          mention_ids?: string[];
          payload?: Json | null;
          reply_to?: string | null;
          sender_id: string;
        };
        Update: {
          activity_id?: string | null;
          body?: string | null;
          created_at?: string;
          crew_id?: string | null;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['message_kind'];
          mention_ids?: string[];
          payload?: Json | null;
          reply_to?: string | null;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'activity_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_reply_to_fkey';
            columns: ['reply_to'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
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
      notification_mutes: {
        Row: {
          created_at: string;
          object_id: string;
          object_kind: Database['public']['Enums']['notification_object'];
          until: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          object_id: string;
          object_kind: Database['public']['Enums']['notification_object'];
          until?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          object_id?: string;
          object_kind?: Database['public']['Enums']['notification_object'];
          until?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_mutes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_preferences: {
        Row: {
          quiet_end: string;
          quiet_hours_enabled: boolean;
          quiet_start: string;
          show_details: boolean;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          quiet_end?: string;
          quiet_hours_enabled?: boolean;
          quiet_start?: string;
          show_details?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          quiet_end?: string;
          quiet_hours_enabled?: boolean;
          quiet_start?: string;
          show_details?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_settings: {
        Row: {
          push: boolean;
          type: Database['public']['Enums']['notification_type'];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          push: boolean;
          type: Database['public']['Enums']['notification_type'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          push?: boolean;
          type?: Database['public']['Enums']['notification_type'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          acted_at: string | null;
          activity_id: string | null;
          actor_count: number;
          actor_ids: string[];
          bundle_key: string;
          count: number;
          created_at: string;
          crew_id: string | null;
          data: NonNullable<Json>;
          id: string;
          message_id: string | null;
          object_id: string;
          object_kind: Database['public']['Enums']['notification_object'];
          plan_id: string | null;
          pushed_at: string | null;
          read_at: string | null;
          recipient_id: string;
          type: Database['public']['Enums']['notification_type'];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          acted_at?: string | null;
          activity_id?: string | null;
          actor_count?: number;
          actor_ids?: string[];
          bundle_key: string;
          count?: number;
          created_at?: string;
          crew_id?: string | null;
          data?: NonNullable<Json>;
          id?: string;
          message_id?: string | null;
          object_id: string;
          object_kind: Database['public']['Enums']['notification_object'];
          plan_id?: string | null;
          pushed_at?: string | null;
          read_at?: string | null;
          recipient_id: string;
          type: Database['public']['Enums']['notification_type'];
          updated_at?: string;
        };
        Update: {
          acted_at?: string | null;
          activity_id?: string | null;
          actor_count?: number;
          actor_ids?: string[];
          bundle_key?: string;
          count?: number;
          created_at?: string;
          crew_id?: string | null;
          data?: NonNullable<Json>;
          id?: string;
          message_id?: string | null;
          object_id?: string;
          object_kind?: Database['public']['Enums']['notification_object'];
          plan_id?: string | null;
          pushed_at?: string | null;
          read_at?: string | null;
          recipient_id?: string;
          type?: Database['public']['Enums']['notification_type'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_recipient_id_fkey';
            columns: ['recipient_id'];
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
          crew_id: string | null;
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
          crew_id?: string | null;
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
          crew_id?: string | null;
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
            foreignKeyName: 'plans_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
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
      push_tokens: {
        Row: {
          created_at: string;
          id: string;
          last_seen_at: string;
          platform: Database['public']['Enums']['push_platform'];
          token: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          last_seen_at?: string;
          platform: Database['public']['Enums']['push_platform'];
          token: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_seen_at?: string;
          platform?: Database['public']['Enums']['push_platform'];
          token?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_tokens_user_id_fkey';
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
      rivalries: {
        Row: {
          created_at: string;
          high_id: string;
          id: string;
          kind: Database['public']['Enums']['rivalry_kind'];
          low_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          high_id: string;
          id?: string;
          kind: Database['public']['Enums']['rivalry_kind'];
          low_id: string;
        };
        Update: {
          created_at?: string;
          high_id?: string;
          id?: string;
          kind?: Database['public']['Enums']['rivalry_kind'];
          low_id?: string;
        };
        Relationships: [];
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
          crew_id: string | null;
          crew_name: string | null;
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
          place_time_zone: string | null;
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
            foreignKeyName: 'plans_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
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
      accept_call_out: {
        Args: { p_as_crew_id?: string; p_call_out_id: string; p_idempotency_key: string };
        Returns: Database['public']['CompositeTypes']['challenge_accept_state'];
        SetofOptions: {
          from: '*';
          to: 'challenge_accept_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      act_on_notification: {
        Args: { p_id: string };
        Returns: {
          acted_at: string | null;
          activity_id: string | null;
          actor_count: number;
          actor_ids: string[];
          bundle_key: string;
          count: number;
          created_at: string;
          crew_id: string | null;
          data: NonNullable<Json>;
          id: string;
          message_id: string | null;
          object_id: string;
          object_kind: Database['public']['Enums']['notification_object'];
          plan_id: string | null;
          pushed_at: string | null;
          read_at: string | null;
          recipient_id: string;
          type: Database['public']['Enums']['notification_type'];
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'notifications';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      activity_live: {
        Args: { p_activity_id: string };
        Returns: {
          activity_id: string;
          can_log_score: boolean;
          can_post: boolean;
          crew_following: string;
          effective_status: Database['public']['Enums']['activity_status'];
          ended_at: string;
          ends_at: string;
          follower_count: number;
          i_follow: boolean;
          is_host: boolean;
          last_update_at: string;
          live_at: string;
          my_reaction: Database['public']['Enums']['reaction_word'];
          place_name: string;
          playing_count: number;
          reaction_counts: Json;
          score_logged_by: string;
          score_logged_by_host: boolean;
          score_logged_by_name: string;
          score_updated_at: string;
          server_now: string;
          sport_id: string;
          starts_at: string;
          team_a_label: string;
          team_a_score: number;
          team_b_label: string;
          team_b_score: number;
        }[];
      };
      activity_messages: {
        Args: { p_activity_id: string; p_before?: string; p_limit?: number };
        Returns: {
          body: string;
          created_at: string;
          edited_at: string;
          id: string;
          is_deleted: boolean;
          is_hidden: boolean;
          is_mine: boolean;
          kind: Database['public']['Enums']['message_kind'];
          mentions_me: boolean;
          payload: Json;
          reply_to: string;
          sender_avatar_path: string;
          sender_id: string;
          sender_name: string;
        }[];
      };
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
      activity_updates_feed: {
        Args: { p_activity_id: string; p_before?: string; p_limit?: number };
        Returns: {
          author_avatar_path: string;
          author_id: string;
          author_is_host: boolean;
          author_name: string;
          body: string;
          created_at: string;
          id: string;
          is_deleted: boolean;
          kind: Database['public']['Enums']['update_kind'];
          my_reaction: Database['public']['Enums']['reaction_word'];
          reaction_counts: Json;
          team_a_score: number;
          team_b_score: number;
        }[];
      };
      add_crew_members: { Args: { p_crew_id: string; p_user_ids: string[] }; Returns: number };
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
      areas_list: {
        Args: Record<PropertyKey, never>;
        Returns: {
          area: string;
          city: string;
          label: string;
          lat: number;
          lng: number;
          place_count: number;
        }[];
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
      back_challenge: {
        Args: { p_event_id: string; p_side: Database['public']['Enums']['team_side'] };
        Returns: Database['public']['CompositeTypes']['challenge_crowd_state'];
        SetofOptions: {
          from: '*';
          to: 'challenge_crowd_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      block_user: { Args: { p_user_id: string }; Returns: boolean };
      call_out_view: {
        Args: { p_call_out_id: string };
        Returns: {
          audience: Database['public']['Enums']['challenge_audience'];
          can_answer: boolean;
          challenger_avatar_path: string;
          challenger_crew_id: string;
          challenger_id: string;
          challenger_name: string;
          counter_id: string;
          countered_from: string;
          course_note: string;
          created_at: string;
          event_id: string;
          expires_at: string;
          format: Database['public']['Enums']['challenge_format'];
          games_together: number;
          id: string;
          is_mine: boolean;
          is_open: boolean;
          message: string;
          opponent_avatar_path: string;
          opponent_crew_id: string;
          opponent_id: string;
          opponent_name: string;
          place_area: string;
          place_city: string;
          place_id: string;
          place_name: string;
          rematch_of_event_id: string;
          responded_at: string;
          rivalry_challenger_wins: number;
          rivalry_draws: number;
          rivalry_id: string;
          rivalry_opponent_wins: number;
          scoring: Database['public']['Enums']['challenge_scoring'];
          server_now: string;
          side_size: number;
          sport_id: string;
          sport_name: string;
          starts_at: string;
          status: Database['public']['Enums']['call_out_status'];
          target: number;
          time_zone: string;
          title: string;
          unit: string;
          verification: Database['public']['Enums']['challenge_verification_method'];
        }[];
      };
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
      cancel_challenge_event: {
        Args: { p_event_id: string };
        Returns: Database['public']['Enums']['challenge_stage'];
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
      challenge_comments: {
        Args: { p_before?: string; p_event_id: string; p_limit?: number; p_post_id?: string };
        Returns: {
          author_avatar_path: string;
          author_badge: string;
          author_id: string;
          author_name: string;
          author_side: Database['public']['Enums']['team_side'];
          body: string;
          created_at: string;
          id: string;
          is_deleted: boolean;
          is_mine: boolean;
          parent_id: string;
          post_id: string;
          reply_count: number;
          respect_count: number;
          respected: boolean;
        }[];
      };
      challenge_event_view: {
        Args: { p_event_id: string };
        Returns: {
          a_avatar_path: string;
          a_checked_in: boolean;
          a_crew_id: string;
          a_lineup_count: number;
          a_name: string;
          a_progress: number;
          a_ready: boolean;
          a_user_id: string;
          accepted_at: string;
          audience: Database['public']['Enums']['challenge_audience'];
          b_avatar_path: string;
          b_checked_in: boolean;
          b_crew_id: string;
          b_lineup_count: number;
          b_name: string;
          b_progress: number;
          b_ready: boolean;
          b_user_id: string;
          backing_a: number;
          backing_b: number;
          backing_open: boolean;
          call_out_id: string;
          can_comment: boolean;
          can_post: boolean;
          cancel_reason: string;
          cancelled_at: string;
          check_in_opens_at: string;
          comment_count: number;
          comments_muted: boolean;
          completed_at: string;
          course_note: string;
          crew_backing_a: number;
          crew_backing_b: number;
          crowd_called_it: boolean;
          crowd_pick_pct: number;
          crowd_pick_side: Database['public']['Enums']['team_side'];
          ended_at: string;
          follow_quiet: boolean;
          follower_count: number;
          format: Database['public']['Enums']['challenge_format'];
          i_follow: boolean;
          id: string;
          is_captain: boolean;
          is_competitor: boolean;
          is_draw: boolean;
          is_organizer: boolean;
          live_at: string;
          live_period: number;
          margin: number;
          my_backing: Database['public']['Enums']['team_side'];
          my_prediction: Database['public']['Enums']['team_side'];
          my_reaction: Database['public']['Enums']['reaction_word'];
          my_side: Database['public']['Enums']['team_side'];
          pending_rematch_call_out_id: string;
          place_area: string;
          place_city: string;
          place_id: string;
          place_name: string;
          prediction_a_pct: number;
          prediction_b_pct: number;
          prediction_count: number;
          predictions_locked: boolean;
          progress_logged_by_name: string;
          progress_source: string;
          progress_updated_at: string;
          reaction_counts: Json;
          rematch_event_id: string;
          rematch_of_event_id: string;
          result_a: number;
          result_b: number;
          result_note: string;
          result_source: Database['public']['Enums']['challenge_result_source'];
          rivalry_a_wins: number;
          rivalry_b_wins: number;
          rivalry_draws: number;
          rivalry_id: string;
          rivalry_meetings: number;
          scoring: Database['public']['Enums']['challenge_scoring'];
          server_now: string;
          side_size: number;
          situation: string;
          sport_id: string;
          sport_name: string;
          stage: Database['public']['Enums']['challenge_stage'];
          starts_at: string;
          status: Database['public']['Enums']['challenge_status'];
          target: number;
          time_zone: string;
          title: string;
          unit: string;
          verification: Database['public']['Enums']['challenge_verification_method'];
          verified_at: string;
          watched_count: number;
          winner_side: Database['public']['Enums']['team_side'];
        }[];
      };
      challenge_feed: {
        Args: { p_before?: string; p_event_id: string; p_limit?: number };
        Returns: {
          author_avatar_path: string;
          author_id: string;
          author_name: string;
          author_role: string;
          author_side: Database['public']['Enums']['team_side'];
          body: string;
          comment_count: number;
          created_at: string;
          id: string;
          is_deleted: boolean;
          is_mine: boolean;
          kind: Database['public']['Enums']['challenge_post_kind'];
          milestone: string;
          stats: Json;
        }[];
      };
      challenge_polls: {
        Args: { p_event_id: string };
        Returns: {
          closes_at: string;
          id: string;
          is_closed: boolean;
          my_vote: number;
          options: string[];
          question: string;
          template: Database['public']['Enums']['challenge_poll_template'];
          total_votes: number;
          vote_counts: number[];
        }[];
      };
      challenge_poster: {
        Args: { p_event_id: string };
        Returns: {
          a_name: string;
          a_value: number;
          b_name: string;
          b_value: number;
          event_id: string;
          is_draw: boolean;
          kind: string;
          link_path: string;
          place_city: string;
          place_name: string;
          scoring: Database['public']['Enums']['challenge_scoring'];
          sport_name: string;
          starts_at: string;
          time_zone: string;
          title: string;
          unit: string;
          winner_side: Database['public']['Enums']['team_side'];
        }[];
      };
      challenge_verification: {
        Args: { p_event_id: string };
        Returns: {
          a_value: number;
          auto_confirms_at: string;
          b_value: number;
          checks: Json;
          confirmed_count: number;
          correction_note: string;
          correction_open: boolean;
          correction_requested_at: string;
          correction_requested_by_name: string;
          event_id: string;
          i_need_to_confirm: boolean;
          needed_count: number;
          note: string;
          review_due_at: string;
          stage: Database['public']['Enums']['challenge_stage'];
          submission_id: string;
          submitted_at: string;
          submitted_by: string;
          submitted_by_name: string;
        }[];
      };
      chat_suggestions: {
        Args: { p_crew_id: string };
        Returns: {
          accepted_at: string;
          accepted_by: string;
          accepted_by_name: string;
          created_at: string;
          crew_id: string;
          day_label: string;
          expires_at: string;
          free_count: number;
          id: string;
          interested_count: number;
          interested_ids: string[];
          interested_names: string[];
          member_count: number;
          place_ids: string[];
          place_names: string[];
          plan_id: string;
          proposed_times: string[];
          sport_id: string;
          sport_name: string;
          status: Database['public']['Enums']['suggestion_status'];
          updated_at: string;
        }[];
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
      check_in_challenge: {
        Args: { p_event_id: string };
        Returns: Database['public']['CompositeTypes']['challenge_presence_state'];
        SetofOptions: {
          from: '*';
          to: 'challenge_presence_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      comment_on_challenge: {
        Args: {
          p_body: string;
          p_event_id: string;
          p_idempotency_key: string;
          p_parent_id?: string;
          p_post_id?: string;
        };
        Returns: {
          author_id: string;
          body: string | null;
          created_at: string;
          deleted_at: string | null;
          event_id: string;
          id: string;
          parent_id: string | null;
          post_id: string | null;
          reply_count: number;
          respect_count: number;
        };
        SetofOptions: {
          from: '*';
          to: 'challenge_comments';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      concierge_suggest: {
        Args: { p_limit?: number; p_minutes?: number; p_sport_id?: string; p_text?: string };
        Returns: {
          capacity: number;
          demand_count: number;
          distance_km: number;
          duration_minutes: number;
          kind: string;
          member_count: number;
          place_area: string;
          place_id: string;
          place_name: string;
          plan_id: string;
          played_with_count: number;
          reason: string;
          reasons: string[];
          sport_id: string;
          sport_name: string;
          starts_at: string;
          title: string;
          window_end: string;
          window_start: string;
        }[];
      };
      confirm_challenge_result: {
        Args: { p_idempotency_key: string; p_submission_id: string };
        Returns: Database['public']['CompositeTypes']['challenge_result_state'];
        SetofOptions: {
          from: '*';
          to: 'challenge_result_state';
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
      counter_call_out: {
        Args: {
          p_call_out_id: string;
          p_course_note?: string;
          p_idempotency_key: string;
          p_message?: string;
          p_place_id?: string;
          p_starts_at?: string;
          p_target?: number;
          p_title?: string;
          p_unit?: string;
        };
        Returns: Database['public']['CompositeTypes']['call_out_state'];
        SetofOptions: {
          from: '*';
          to: 'call_out_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_call_out: {
        Args: {
          p_audience?: Database['public']['Enums']['challenge_audience'];
          p_challenger_crew_id?: string;
          p_course_note?: string;
          p_expires_at?: string;
          p_idempotency_key: string;
          p_message?: string;
          p_opponent_crew_id?: string;
          p_opponent_id?: string;
          p_place_id?: string;
          p_scoring: Database['public']['Enums']['challenge_scoring'];
          p_side_size?: number;
          p_sport_id: string;
          p_starts_at: string;
          p_target?: number;
          p_title: string;
          p_unit?: string;
        };
        Returns: Database['public']['CompositeTypes']['call_out_state'];
        SetofOptions: {
          from: '*';
          to: 'call_out_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_challenge_poll: {
        Args: {
          p_closes_at?: string;
          p_event_id: string;
          p_template: Database['public']['Enums']['challenge_poll_template'];
          p_threshold?: number;
        };
        Returns: {
          closes_at: string;
          created_at: string;
          created_by: string;
          event_id: string;
          id: string;
          options: string[];
          question: string;
          template: Database['public']['Enums']['challenge_poll_template'];
          threshold: number | null;
          updated_at: string;
          vote_counts: number[];
        };
        SetofOptions: {
          from: '*';
          to: 'challenge_polls';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_crew: {
        Args: {
          p_idempotency_key: string;
          p_member_ids?: string[];
          p_name: string;
          p_sport_id?: string;
        };
        Returns: {
          archived_at: string | null;
          created_at: string;
          created_by: string;
          id: string;
          is_private: boolean;
          member_count: number;
          name: string;
          sport_id: string | null;
          time_zone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'crews';
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
      create_from_demand: {
        Args: {
          p_idempotency_key: string;
          p_sport_id: string;
          p_window_end: string;
          p_window_start: string;
        };
        Returns: Database['public']['CompositeTypes']['plan_state'];
        SetofOptions: {
          from: '*';
          to: 'plan_state';
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
      crew_invite_code: { Args: { p_crew_id: string; p_rotate?: boolean }; Returns: string };
      crew_messages: {
        Args: { p_before?: string; p_crew_id: string; p_limit?: number };
        Returns: {
          body: string;
          created_at: string;
          edited_at: string;
          id: string;
          is_deleted: boolean;
          is_hidden: boolean;
          is_mine: boolean;
          kind: Database['public']['Enums']['message_kind'];
          mentions_me: boolean;
          payload: Json;
          reply_to: string;
          sender_avatar_path: string;
          sender_id: string;
          sender_name: string;
        }[];
      };
      crew_roster: {
        Args: { p_crew_id: string };
        Returns: {
          avatar_path: string;
          display_name: string;
          games_with_me: number;
          is_me: boolean;
          joined_at: string;
          role: Database['public']['Enums']['crew_role'];
          user_id: string;
        }[];
      };
      crew_view: {
        Args: { p_crew_id: string };
        Returns: {
          created_at: string;
          crew_id: string;
          free_tonight: number;
          member_count: number;
          my_role: Database['public']['Enums']['crew_role'];
          name: string;
          sport_id: string;
          time_zone: string;
        }[];
      };
      decline_call_out: {
        Args: { p_call_out_id: string };
        Returns: Database['public']['CompositeTypes']['call_out_state'];
        SetofOptions: {
          from: '*';
          to: 'call_out_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      decline_invite: {
        Args: { p_invite_id: string };
        Returns: Database['public']['Enums']['invite_status'];
      };
      delete_challenge_comment: { Args: { p_comment_id: string }; Returns: boolean };
      delete_challenge_post: { Args: { p_post_id: string }; Returns: boolean };
      delete_message: { Args: { p_message_id: string }; Returns: boolean };
      delete_update: { Args: { p_update_id: string }; Returns: boolean };
      discover_search: {
        Args: { p_limit?: number; p_query?: string; p_sport_id?: string; p_when?: string };
        Returns: {
          avatar_path: string;
          capacity: number;
          distance_km: number;
          effective_status: string;
          games_with_me: number;
          handle: string;
          id: string;
          kind: string;
          member_count: number;
          place_area: string;
          place_id: string;
          place_name: string;
          plans_tonight: number;
          sport_id: string;
          sport_name: string;
          starts_at: string;
          title: string;
        }[];
      };
      dismiss_suggestion: { Args: { p_suggestion_id: string }; Returns: boolean };
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
      edit_message: {
        Args: { p_body: string; p_message_id: string };
        Returns: {
          activity_id: string | null;
          body: string | null;
          created_at: string;
          crew_id: string | null;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          kind: Database['public']['Enums']['message_kind'];
          mention_ids: string[];
          payload: Json | null;
          reply_to: string | null;
          sender_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      end_activity: {
        Args: { p_activity_id: string };
        Returns: Database['public']['Enums']['activity_status'];
      };
      follow_activity: { Args: { p_activity_id: string }; Returns: boolean };
      follow_challenge_event: {
        Args: { p_comments_muted?: boolean; p_event_id: string; p_quiet?: boolean };
        Returns: Database['public']['CompositeTypes']['challenge_follow_state'];
        SetofOptions: {
          from: '*';
          to: 'challenge_follow_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      further_out: {
        Args: { p_limit?: number };
        Returns: {
          action: string;
          activity_id: string;
          capacity: number;
          distance_km: number;
          ends_at: string;
          kind: string;
          member_count: number;
          minutes_to_start: number;
          place_area: string;
          place_id: string;
          place_name: string;
          place_time_zone: string;
          plan_id: string;
          played_with_count: number;
          reason: string;
          reasons: string[];
          sport_id: string;
          sport_name: string;
          spots_left: number;
          starts_at: string;
          status: string;
          title: string;
        }[];
      };
      give_reputation: {
        Args: {
          p_activity_id: string;
          p_kind: Database['public']['Enums']['reputation_kind'];
          p_subject_id: string;
        };
        Returns: boolean;
      };
      home_density: {
        Args: Record<PropertyKey, never>;
        Returns: {
          area: string;
          day_number: number;
          demand_buckets: number;
          friends_free_now: number;
          further_out_count: number;
          games_near: number;
          has_area: boolean;
          low_density: boolean;
          people_down_near: number;
          plans_near: number;
          radius_km: number;
          starting_soon: number;
        }[];
      };
      home_feed: {
        Args: Record<PropertyKey, never>;
        Returns: {
          action: string;
          activity_id: string;
          capacity: number;
          card: string;
          crew_id: string;
          href: string;
          member_count: number;
          notification_id: string;
          object_id: string;
          object_kind: string;
          people: number;
          place_name: string;
          plan_id: string;
          position: number;
          reason: string;
          sport_id: string;
          sport_name: string;
          starts_at: string;
          title: string;
        }[];
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
      join_challenge_lineup: { Args: { p_event_id: string }; Returns: number };
      join_crew: { Args: { p_code: string }; Returns: string };
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
      latent_demand: {
        Args: { p_sport_id?: string };
        Returns: {
          day: string;
          part: Database['public']['Enums']['day_part'];
          people_count: number;
          sport_id: string;
          sport_name: string;
          suggested_start: string;
          window_end: string;
          window_start: string;
        }[];
      };
      leave_challenge_lineup: { Args: { p_event_id: string }; Returns: boolean };
      leave_crew: { Args: { p_crew_id: string }; Returns: boolean };
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
      log_challenge_progress: {
        Args: { p_a_value?: number; p_b_value?: number; p_event_id: string; p_period?: number };
        Returns: Database['public']['CompositeTypes']['challenge_progress_state'];
        SetofOptions: {
          from: '*';
          to: 'challenge_progress_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      log_score: {
        Args: { p_activity_id: string; p_team_a: number; p_team_b: number };
        Returns: {
          activity_id: string;
          follower_count: number;
          last_update_at: string | null;
          reaction_counts: NonNullable<Json>;
          score_logged_by: string | null;
          score_updated_at: string | null;
          team_a_score: number | null;
          team_b_score: number | null;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'activity_live';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      make_this_a_game: {
        Args: {
          p_capacity?: number;
          p_idempotency_key?: string;
          p_place_id?: string;
          p_poll_closes_at?: string;
          p_suggestion_id: string;
          p_time_options?: string[];
        };
        Returns: Database['public']['CompositeTypes']['make_game_state'];
        SetofOptions: {
          from: '*';
          to: 'make_game_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      mark_notifications_read: { Args: { p_before?: string; p_ids?: string[] }; Returns: number };
      mute_object: {
        Args: {
          p_object_id: string;
          p_object_kind: Database['public']['Enums']['notification_object'];
          p_until?: string;
        };
        Returns: boolean;
      };
      my_blocks: {
        Args: Record<PropertyKey, never>;
        Returns: {
          blocked_at: string;
          display_name: string;
          user_id: string;
        }[];
      };
      my_call_outs: {
        Args: { p_box?: string; p_limit?: number };
        Returns: {
          challenger_id: string;
          challenger_name: string;
          created_at: string;
          direction: string;
          event_id: string;
          expires_at: string;
          format: Database['public']['Enums']['challenge_format'];
          id: string;
          is_counter: boolean;
          is_rematch: boolean;
          opponent_name: string;
          place_name: string;
          sport_id: string;
          starts_at: string;
          status: Database['public']['Enums']['call_out_status'];
          time_zone: string;
          title: string;
        }[];
      };
      my_challenge_events: {
        Args: { p_limit?: number };
        Returns: {
          a_name: string;
          a_progress: number;
          b_name: string;
          b_progress: number;
          event_id: string;
          follower_count: number;
          format: Database['public']['Enums']['challenge_format'];
          live_period: number;
          my_side: Database['public']['Enums']['team_side'];
          place_name: string;
          relation: string;
          scoring: Database['public']['Enums']['challenge_scoring'];
          side_size: number;
          situation: string;
          sport_id: string;
          stage: Database['public']['Enums']['challenge_stage'];
          starts_at: string;
          target: number;
          time_zone: string;
          title: string;
          unit: string;
          winner_side: Database['public']['Enums']['team_side'];
        }[];
      };
      my_crews: {
        Args: Record<PropertyKey, never>;
        Returns: {
          crew_id: string;
          joined_at: string;
          last_message_at: string;
          member_count: number;
          name: string;
          role: Database['public']['Enums']['crew_role'];
          sport_id: string;
        }[];
      };
      my_notifications: {
        Args: { p_limit?: number };
        Returns: {
          acted_at: string;
          action: string;
          activity_id: string;
          actor_count: number;
          actor_ids: string[];
          actor_names: string[];
          body: string;
          count: number;
          created_at: string;
          crew_id: string;
          data: Json;
          href: string;
          id: string;
          message_id: string;
          needs_you: boolean;
          object_id: string;
          object_kind: Database['public']['Enums']['notification_object'];
          plan_id: string;
          read_at: string;
          section: string;
          title: string;
          type: Database['public']['Enums']['notification_type'];
          updated_at: string;
        }[];
      };
      my_rivalries: {
        Args: { p_limit?: number };
        Returns: {
          a_name: string;
          a_wins: number;
          b_name: string;
          b_wins: number;
          draws: number;
          form: string[];
          kind: Database['public']['Enums']['rivalry_kind'];
          last_active_at: string;
          meetings: number;
          next_event_id: string;
          next_starts_at: string;
          next_time_zone: string;
          next_title: string;
          rivalry_id: string;
        }[];
      };
      notification_preferences: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['CompositeTypes']['notification_prefs_state'];
        SetofOptions: {
          from: '*';
          to: 'notification_prefs_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ojoro_now: {
        Args: { p_sport_id?: string; p_within_minutes?: number };
        Returns: {
          action: string;
          activity_id: string;
          capacity: number;
          distance_km: number;
          ends_at: string;
          kind: string;
          member_count: number;
          minutes_to_start: number;
          place_area: string;
          place_id: string;
          place_name: string;
          place_time_zone: string;
          plan_id: string;
          played_with_count: number;
          reason: string;
          reasons: string[];
          sport_id: string;
          sport_name: string;
          spots_left: number;
          starts_at: string;
          status: string;
          title: string;
        }[];
      };
      people_to_move_with: {
        Args: { p_limit?: number };
        Returns: {
          area: string;
          avatar_path: string;
          crews: number;
          display_name: string;
          games_with_me: number;
          handle: string;
          overlap_day_of_week: number;
          overlap_part: Database['public']['Enums']['day_part'];
          played_together: boolean;
          reason: string;
          sessions: number;
          shared_sports: string[];
          sports: string[];
          user_id: string;
        }[];
      };
      places_nearby: {
        Args: { p_limit?: number; p_sport_id?: string };
        Returns: {
          area: string;
          city: string;
          distance_km: number;
          floodlit_until: string;
          is_free: boolean;
          name: string;
          place_id: string;
          plans_forming: number;
          plans_tonight: number;
          sport_ids: string[];
          surface: string;
          time_zone: string;
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
      post_challenge_update: {
        Args: {
          p_body: string;
          p_event_id: string;
          p_idempotency_key: string;
          p_kind: Database['public']['Enums']['challenge_post_kind'];
          p_stats?: Json;
        };
        Returns: {
          author_id: string | null;
          body: string | null;
          created_at: string;
          deleted_at: string | null;
          event_id: string;
          id: string;
          kind: Database['public']['Enums']['challenge_post_kind'];
          milestone: string | null;
          stats: Json | null;
        };
        SetofOptions: {
          from: '*';
          to: 'challenge_posts';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      post_update: {
        Args: { p_activity_id: string; p_body: string; p_idempotency_key: string };
        Returns: {
          activity_id: string;
          audience: Database['public']['Enums']['update_audience'];
          author_id: string | null;
          body: string | null;
          created_at: string;
          deleted_at: string | null;
          id: string;
          kind: Database['public']['Enums']['update_kind'];
          reaction_counts: NonNullable<Json>;
          team_a_score: number | null;
          team_b_score: number | null;
        };
        SetofOptions: {
          from: '*';
          to: 'activity_updates';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      predict_challenge: {
        Args: { p_event_id: string; p_side: Database['public']['Enums']['team_side'] };
        Returns: Database['public']['CompositeTypes']['challenge_crowd_state'];
        SetofOptions: {
          from: '*';
          to: 'challenge_crowd_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      propose_challenge_organizer: {
        Args: { p_event_id: string; p_user_id: string };
        Returns: boolean;
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
          distance_km: number;
          free_at_plan_time: boolean;
          games_with_me: number;
          plays_sport: boolean;
          position: string;
          pull_me_in: boolean;
          reason: string;
          shared_title: string;
          tier: string;
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
      react: {
        Args: {
          p_activity_id: string;
          p_reaction: Database['public']['Enums']['reaction_word'];
          p_update_id?: string;
        };
        Returns: Database['public']['CompositeTypes']['reaction_state'];
        SetofOptions: {
          from: '*';
          to: 'reaction_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      react_challenge: {
        Args: { p_event_id: string; p_reaction: Database['public']['Enums']['reaction_word'] };
        Returns: Database['public']['CompositeTypes']['challenge_reaction_state'];
        SetofOptions: {
          from: '*';
          to: 'challenge_reaction_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ready_challenge: {
        Args: { p_event_id: string };
        Returns: Database['public']['CompositeTypes']['challenge_presence_state'];
        SetofOptions: {
          from: '*';
          to: 'challenge_presence_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      register_push_token: {
        Args: { p_platform: Database['public']['Enums']['push_platform']; p_token: string };
        Returns: string;
      };
      remove_challenge_organizer: {
        Args: { p_event_id: string; p_user_id: string };
        Returns: boolean;
      };
      remove_crew_member: { Args: { p_crew_id: string; p_user_id: string }; Returns: boolean };
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
      request_challenge_correction: {
        Args: { p_event_id: string; p_note?: string };
        Returns: Database['public']['CompositeTypes']['challenge_result_state'];
        SetofOptions: {
          from: '*';
          to: 'challenge_result_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      respect_challenge_comment: {
        Args: { p_comment_id: string };
        Returns: Database['public']['CompositeTypes']['comment_respect_state'];
        SetofOptions: {
          from: '*';
          to: 'comment_respect_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rivalry_meetings: {
        Args: { p_limit?: number; p_rivalry_id: string };
        Returns: {
          a_value: number;
          b_value: number;
          event_id: string;
          margin: number;
          place_name: string;
          scoring: Database['public']['Enums']['challenge_scoring'];
          source: Database['public']['Enums']['challenge_result_source'];
          sport_id: string;
          starts_at: string;
          time_zone: string;
          title: string;
          unit: string;
          verified_at: string;
          winner: string;
        }[];
      };
      rivalry_view: {
        Args: { p_rivalry_id: string };
        Returns: {
          a_id: string;
          a_name: string;
          a_wins: number;
          b_id: string;
          b_name: string;
          b_wins: number;
          draws: number;
          form: string[];
          i_am_in: boolean;
          kind: Database['public']['Enums']['rivalry_kind'];
          last_event_id: string;
          last_margin: number;
          last_scoring: Database['public']['Enums']['challenge_scoring'];
          last_title: string;
          last_unit: string;
          last_winner: string;
          meetings: number;
          next_event_id: string;
          next_stage: Database['public']['Enums']['challenge_stage'];
          next_starts_at: string;
          next_time_zone: string;
          next_title: string;
          rematch_call_out_id: string;
          rematch_can_answer: boolean;
          rematch_from: string;
          rematch_from_name: string;
          rematch_message: string;
          rematch_starts_at: string;
          rematch_title: string;
          rivalry_id: string;
          streak_length: number;
          streak_side: string;
        }[];
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
      run_it_back_challenge: {
        Args: {
          p_event_id: string;
          p_idempotency_key: string;
          p_message?: string;
          p_starts_at?: string;
        };
        Returns: Database['public']['CompositeTypes']['rematch_state'];
        SetofOptions: {
          from: '*';
          to: 'rematch_state';
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
      send_message: {
        Args: {
          p_activity_id?: string;
          p_body: string;
          p_crew_id?: string;
          p_idempotency_key: string;
          p_mention_ids?: string[];
          p_reply_to?: string;
        };
        Returns: {
          activity_id: string | null;
          body: string | null;
          created_at: string;
          crew_id: string | null;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          kind: Database['public']['Enums']['message_kind'];
          mention_ids: string[];
          payload: Json | null;
          reply_to: string | null;
          sender_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_area: {
        Args: { p_area: string; p_discovery_radius_km?: number };
        Returns: Database['public']['CompositeTypes']['area_state'];
        SetofOptions: {
          from: '*';
          to: 'area_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_crew_role: {
        Args: {
          p_crew_id: string;
          p_role: Database['public']['Enums']['crew_role'];
          p_user_id: string;
        };
        Returns: Database['public']['Enums']['crew_role'];
      };
      set_notification_preferences: {
        Args: {
          p_quiet_end?: string;
          p_quiet_hours_enabled?: boolean;
          p_quiet_start?: string;
          p_show_details?: boolean;
        };
        Returns: Database['public']['CompositeTypes']['notification_prefs_state'];
        SetofOptions: {
          from: '*';
          to: 'notification_prefs_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_notification_type: {
        Args: { p_push: boolean; p_type: Database['public']['Enums']['notification_type'] };
        Returns: Database['public']['CompositeTypes']['notification_prefs_state'];
        SetofOptions: {
          from: '*';
          to: 'notification_prefs_state';
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
      sports_nearby: {
        Args: Record<PropertyKey, never>;
        Returns: {
          has_demand: boolean;
          place_count: number;
          plan_count: number;
          sport_id: string;
          sport_name: string;
        }[];
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
      submit_challenge_result: {
        Args: {
          p_a_value: number;
          p_b_value: number;
          p_event_id: string;
          p_idempotency_key: string;
          p_note?: string;
        };
        Returns: Database['public']['CompositeTypes']['challenge_result_state'];
        SetofOptions: {
          from: '*';
          to: 'challenge_result_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      surprise_me: {
        Args: Record<PropertyKey, never>;
        Returns: {
          capacity: number;
          demand_count: number;
          distance_km: number;
          duration_minutes: number;
          kind: string;
          member_count: number;
          place_area: string;
          place_id: string;
          place_name: string;
          plan_id: string;
          played_with_count: number;
          reason: string;
          reasons: string[];
          sport_id: string;
          sport_name: string;
          starts_at: string;
          title: string;
          window_end: string;
          window_start: string;
        }[];
      };
      transfer_crew_ownership: { Args: { p_crew_id: string; p_user_id: string }; Returns: boolean };
      unblock_user: { Args: { p_user_id: string }; Returns: boolean };
      unfollow_activity: { Args: { p_activity_id: string }; Returns: boolean };
      unfollow_challenge_event: {
        Args: { p_event_id: string };
        Returns: Database['public']['CompositeTypes']['challenge_follow_state'];
        SetofOptions: {
          from: '*';
          to: 'challenge_follow_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      unmute_object: {
        Args: {
          p_object_id: string;
          p_object_kind: Database['public']['Enums']['notification_object'];
        };
        Returns: boolean;
      };
      unread_count: { Args: Record<PropertyKey, never>; Returns: number };
      unregister_push_token: { Args: { p_token: string }; Returns: boolean };
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
      vote_challenge_poll: {
        Args: { p_option: number; p_poll_id: string };
        Returns: Database['public']['CompositeTypes']['challenge_poll_state'];
        SetofOptions: {
          from: '*';
          to: 'challenge_poll_state';
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
      withdraw_call_out: {
        Args: { p_call_out_id: string };
        Returns: Database['public']['CompositeTypes']['call_out_state'];
        SetofOptions: {
          from: '*';
          to: 'call_out_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      withdraw_challenge_correction: {
        Args: { p_event_id: string };
        Returns: Database['public']['CompositeTypes']['challenge_result_state'];
        SetofOptions: {
          from: '*';
          to: 'challenge_result_state';
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      audience: 'public' | 'friends' | 'invite_only' | 'crew';
      call_out_status: 'proposed' | 'accepted' | 'countered' | 'declined' | 'withdrawn' | 'expired';
      challenge_audience: 'public' | 'friends' | 'participants';
      challenge_format: 'person_vs_person' | 'crew_vs_crew';
      challenge_poll_template: 'winner' | 'margin' | 'performance' | 'first_score' | 'rematch';
      challenge_post_kind: 'system' | 'statement' | 'training' | 'progress' | 'logistics';
      challenge_result_source:
        'participant_confirmation' | 'organizer_review' | 'unanswered_auto_confirmed';
      challenge_scoring: 'time' | 'distance' | 'score' | 'rounds';
      challenge_stage:
        | 'accepted'
        | 'days'
        | 'today'
        | 'soon'
        | 'live'
        | 'verifying'
        | 'disputed'
        | 'complete'
        | 'cancelled';
      challenge_status: 'scheduled' | 'live' | 'verifying' | 'disputed' | 'complete' | 'cancelled';
      challenge_submission_status: 'pending' | 'confirmed' | 'superseded';
      challenge_verification_method: 'participant_confirmation' | 'device';
      check_in_method: 'location' | 'host';
      crew_join_via: 'created' | 'added' | 'code';
      crew_role: 'owner' | 'admin' | 'member';
      day_part: 'morning' | 'midday' | 'evening';
      invite_kind: 'pull_in' | 'run_it_back';
      invite_status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
      member_via: 'host' | 'im_down' | 'down_for' | 'invite';
      message_kind: 'text' | 'system';
      notification_object: 'plan' | 'activity' | 'crew' | 'challenge' | 'challenge_event';
      notification_type:
        | 'need_one_more'
        | 'game_on'
        | 'participant_update'
        | 'activity_changed'
        | 'check_in_open'
        | 'live'
        | 'result_to_confirm'
        | 'recap_ready'
        | 'run_it_back_invite'
        | 'pull_in_invite'
        | 'waitlist_promoted'
        | 'crew_poll'
        | 'crew_plan'
        | 'mention'
        | 'crew_member_joined'
        | 'challenge_response'
        | 'call_out'
        | 'challenge_posts'
        | 'challenge_milestone'
        | 'challenge_to_confirm';
      plan_source: 'down_for' | 'quick' | 'run_it_back' | 'chat';
      plan_status: 'forming' | 'game_on' | 'expired' | 'cancelled';
      proposal_status: 'proposed' | 'verified' | 'superseded';
      pull_scope: 'connections' | 'nearby';
      push_platform: 'ios' | 'android' | 'web';
      reaction_word: 'lets_go' | 'respect' | 'hold_that' | 'run_it_back';
      report_reason: 'spam' | 'harassment' | 'unsafe' | 'impersonation' | 'inappropriate' | 'other';
      report_subject:
        | 'profile'
        | 'plan'
        | 'activity'
        | 'moment'
        | 'result'
        | 'message'
        | 'update'
        | 'call_out'
        | 'challenge_event'
        | 'challenge_post'
        | 'challenge_comment';
      reputation_kind: 'shows_up' | 'respectful' | 'welcomes_beginners' | 'great_host';
      rivalry_kind: 'people' | 'crews';
      signal_status: 'active' | 'matched' | 'withdrawn' | 'expired';
      skill_level: 'learning' | 'casual' | 'intermediate' | 'advanced';
      suggestion_status: 'open' | 'accepted' | 'expired';
      team_side: 'a' | 'b';
      update_audience: 'everyone' | 'participants';
      update_kind: 'kick_off' | 'score' | 'check_in' | 'full_time' | 'post';
      verification_level:
        | 'self_recorded'
        | 'participant_confirmed'
        | 'organizer_verified'
        | 'device_verified'
        | 'official_competition_verified';
      visibility: 'everyone' | 'friends' | 'crews' | 'only_me';
    };
    CompositeTypes: {
      area_state: {
        area: string | null;
        area_lat: number | null;
        area_lng: number | null;
        discovery_radius_km: number | null;
      };
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
      call_out_state: {
        call_out_id: string | null;
        status: Database['public']['Enums']['call_out_status'] | null;
        created: boolean | null;
        expires_at: string | null;
        countered_from: string | null;
        event_id: string | null;
      };
      challenge_accept_state: {
        call_out_id: string | null;
        event_id: string | null;
        rivalry_id: string | null;
        created: boolean | null;
      };
      challenge_crowd_state: {
        event_id: string | null;
        prediction_count: number | null;
        prediction_a_pct: number | null;
        prediction_b_pct: number | null;
        my_prediction: Database['public']['Enums']['team_side'] | null;
        predictions_locked: boolean | null;
        backing_a: number | null;
        backing_b: number | null;
        my_backing: Database['public']['Enums']['team_side'] | null;
        changed: boolean | null;
      };
      challenge_follow_state: {
        event_id: string | null;
        following: boolean | null;
        quiet: boolean | null;
        comments_muted: boolean | null;
        follower_count: number | null;
      };
      challenge_poll_state: {
        poll_id: string | null;
        vote_counts: number[] | null;
        total_votes: number | null;
        my_vote: number | null;
        closes_at: string | null;
      };
      challenge_presence_state: {
        event_id: string | null;
        stage: Database['public']['Enums']['challenge_stage'] | null;
        my_checked_in_at: string | null;
        my_ready_at: string | null;
        a_checked_in: boolean | null;
        b_checked_in: boolean | null;
        a_ready: boolean | null;
        b_ready: boolean | null;
        live_at: string | null;
      };
      challenge_progress_state: {
        event_id: string | null;
        a_progress: number | null;
        b_progress: number | null;
        live_period: number | null;
        progress_updated_at: string | null;
        changed: boolean | null;
      };
      challenge_reaction_state: {
        event_id: string | null;
        reaction_counts: Json | null;
        my_reaction: Database['public']['Enums']['reaction_word'] | null;
      };
      challenge_result_state: {
        event_id: string | null;
        submission_id: string | null;
        stage: Database['public']['Enums']['challenge_stage'] | null;
        a_value: number | null;
        b_value: number | null;
        confirmed_count: number | null;
        needed_count: number | null;
        i_confirmed: boolean | null;
        verified: boolean | null;
        winner_side: Database['public']['Enums']['team_side'] | null;
      };
      comment_respect_state: {
        comment_id: string | null;
        respect_count: number | null;
        respected: boolean | null;
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
      make_game_state: {
        plan_id: string | null;
        suggestion_id: string | null;
        crew_id: string | null;
        created: boolean | null;
        starts_at: string | null;
        time_option_count: number | null;
        message_id: string | null;
      };
      notification_prefs_state: {
        quiet_hours_enabled: boolean | null;
        quiet_start: string | null;
        quiet_end: string | null;
        show_details: boolean | null;
        time_zone: string | null;
        push_off: Database['public']['Enums']['notification_type'][] | null;
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
      reaction_state: {
        activity_id: string | null;
        update_id: string | null;
        reaction_counts: Json | null;
        my_reaction: Database['public']['Enums']['reaction_word'] | null;
      };
      rematch_state: {
        call_out_id: string | null;
        event_id: string | null;
        created: boolean | null;
        accepted: boolean | null;
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
      audience: ['public', 'friends', 'invite_only', 'crew'],
      call_out_status: ['proposed', 'accepted', 'countered', 'declined', 'withdrawn', 'expired'],
      challenge_audience: ['public', 'friends', 'participants'],
      challenge_format: ['person_vs_person', 'crew_vs_crew'],
      challenge_poll_template: ['winner', 'margin', 'performance', 'first_score', 'rematch'],
      challenge_post_kind: ['system', 'statement', 'training', 'progress', 'logistics'],
      challenge_result_source: [
        'participant_confirmation',
        'organizer_review',
        'unanswered_auto_confirmed',
      ],
      challenge_scoring: ['time', 'distance', 'score', 'rounds'],
      challenge_stage: [
        'accepted',
        'days',
        'today',
        'soon',
        'live',
        'verifying',
        'disputed',
        'complete',
        'cancelled',
      ],
      challenge_status: ['scheduled', 'live', 'verifying', 'disputed', 'complete', 'cancelled'],
      challenge_submission_status: ['pending', 'confirmed', 'superseded'],
      challenge_verification_method: ['participant_confirmation', 'device'],
      check_in_method: ['location', 'host'],
      crew_join_via: ['created', 'added', 'code'],
      crew_role: ['owner', 'admin', 'member'],
      day_part: ['morning', 'midday', 'evening'],
      invite_kind: ['pull_in', 'run_it_back'],
      invite_status: ['pending', 'accepted', 'declined', 'revoked', 'expired'],
      member_via: ['host', 'im_down', 'down_for', 'invite'],
      message_kind: ['text', 'system'],
      notification_object: ['plan', 'activity', 'crew', 'challenge', 'challenge_event'],
      notification_type: [
        'need_one_more',
        'game_on',
        'participant_update',
        'activity_changed',
        'check_in_open',
        'live',
        'result_to_confirm',
        'recap_ready',
        'run_it_back_invite',
        'pull_in_invite',
        'waitlist_promoted',
        'crew_poll',
        'crew_plan',
        'mention',
        'crew_member_joined',
        'challenge_response',
        'call_out',
        'challenge_posts',
        'challenge_milestone',
        'challenge_to_confirm',
      ],
      plan_source: ['down_for', 'quick', 'run_it_back', 'chat'],
      plan_status: ['forming', 'game_on', 'expired', 'cancelled'],
      proposal_status: ['proposed', 'verified', 'superseded'],
      pull_scope: ['connections', 'nearby'],
      push_platform: ['ios', 'android', 'web'],
      reaction_word: ['lets_go', 'respect', 'hold_that', 'run_it_back'],
      report_reason: ['spam', 'harassment', 'unsafe', 'impersonation', 'inappropriate', 'other'],
      report_subject: [
        'profile',
        'plan',
        'activity',
        'moment',
        'result',
        'message',
        'update',
        'call_out',
        'challenge_event',
        'challenge_post',
        'challenge_comment',
      ],
      reputation_kind: ['shows_up', 'respectful', 'welcomes_beginners', 'great_host'],
      rivalry_kind: ['people', 'crews'],
      signal_status: ['active', 'matched', 'withdrawn', 'expired'],
      skill_level: ['learning', 'casual', 'intermediate', 'advanced'],
      suggestion_status: ['open', 'accepted', 'expired'],
      team_side: ['a', 'b'],
      update_audience: ['everyone', 'participants'],
      update_kind: ['kick_off', 'score', 'check_in', 'full_time', 'post'],
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
