/**
 * Generated from the database schema. Do not edit by hand.
 *
 * Regenerate against the local stack (supabase start, then supabase db reset):
 *   supabase gen types typescript --local --schema public > packages/api/src/database.types.ts
 * or against the linked project with `pnpm db:types`.
 *
 * Note: set-returning functions (search_games, tier_list) are generated with
 * every column non-nullable, which the database does not guarantee. The
 * wrappers in ranking.ts and catalog.ts re-add nullability for the columns that
 * are genuinely optional.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      comparisons: {
        Row: {
          context: Json
          created_at: string
          id: string
          item_a: string
          item_b: string
          medium: Database["public"]["Enums"]["medium"]
          outcome: Database["public"]["Enums"]["comparison_outcome"]
          user_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          item_a: string
          item_b: string
          medium: Database["public"]["Enums"]["medium"]
          outcome: Database["public"]["Enums"]["comparison_outcome"]
          user_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          item_a?: string
          item_b?: string
          medium?: Database["public"]["Enums"]["medium"]
          outcome?: Database["public"]["Enums"]["comparison_outcome"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comparisons_item_a_fkey"
            columns: ["item_a"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comparisons_item_b_fkey"
            columns: ["item_b"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      external_scores: {
        Row: {
          fetched_at: string
          media_item_id: string
          score: number | null
          score_count: number | null
          source: string
        }
        Insert: {
          fetched_at?: string
          media_item_id: string
          score?: number | null
          score_count?: number | null
          source: string
        }
        Update: {
          fetched_at?: string
          media_item_id?: string
          score?: number | null
          score_count?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_scores_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      game_availability: {
        Row: {
          first_seen_at: string
          last_seen_at: string
          media_item_id: string
          region: string
          removed_at: string | null
          service: string
          source_ref: string | null
        }
        Insert: {
          first_seen_at?: string
          last_seen_at?: string
          media_item_id: string
          region?: string
          removed_at?: string | null
          service: string
          source_ref?: string | null
        }
        Update: {
          first_seen_at?: string
          last_seen_at?: string
          media_item_id?: string
          region?: string
          removed_at?: string | null
          service?: string
          source_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_availability_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      game_details: {
        Row: {
          developer: string | null
          genres: string[]
          igdb_id: number
          media_item_id: string
          platforms: string[]
          summary: string | null
          time_to_beat_completely_seconds: number | null
          time_to_beat_hastily_seconds: number | null
          time_to_beat_normally_seconds: number | null
        }
        Insert: {
          developer?: string | null
          genres?: string[]
          igdb_id: number
          media_item_id: string
          platforms?: string[]
          summary?: string | null
          time_to_beat_completely_seconds?: number | null
          time_to_beat_hastily_seconds?: number | null
          time_to_beat_normally_seconds?: number | null
        }
        Update: {
          developer?: string | null
          genres?: string[]
          igdb_id?: number
          media_item_id?: string
          platforms?: string[]
          summary?: string | null
          time_to_beat_completely_seconds?: number | null
          time_to_beat_hastily_seconds?: number | null
          time_to_beat_normally_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_details_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: true
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_prior: {
        Row: {
          baseline_score: number
          computed_at: string
          external_score: number | null
          external_source: string | null
          mean_score: number | null
          media_item_id: string
          medium: Database["public"]["Enums"]["medium"]
          n_rankers: number
          prior_score: number
        }
        Insert: {
          baseline_score: number
          computed_at?: string
          external_score?: number | null
          external_source?: string | null
          mean_score?: number | null
          media_item_id: string
          medium: Database["public"]["Enums"]["medium"]
          n_rankers?: number
          prior_score: number
        }
        Update: {
          baseline_score?: number
          computed_at?: string
          external_score?: number | null
          external_source?: string | null
          mean_score?: number | null
          media_item_id?: string
          medium?: Database["public"]["Enums"]["medium"]
          n_rankers?: number
          prior_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_prior_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: true
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      list_items: {
        Row: {
          list_id: string
          media_item_id: string
          position: number
        }
        Insert: {
          list_id: string
          media_item_id: string
          position: number
        }
        Update: {
          list_id?: string
          media_item_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_items_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      media_aliases: {
        Row: {
          alias: string
          alias_key: string | null
          media_item_id: string
          source: string
        }
        Insert: {
          alias: string
          alias_key?: string | null
          media_item_id: string
          source: string
        }
        Update: {
          alias?: string
          alias_key?: string | null
          media_item_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_aliases_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      media_certifications: {
        Row: {
          certification: string
          media_item_id: string
          region: string
        }
        Insert: {
          certification: string
          media_item_id: string
          region: string
        }
        Update: {
          certification?: string
          media_item_id?: string
          region?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_certifications_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      media_items: {
        Row: {
          cover_image_id: string | null
          external_ids: Json
          id: string
          medium: Database["public"]["Enums"]["medium"]
          metadata: Json
          refreshed_at: string
          release_date: string | null
          title: string
          year: number | null
        }
        Insert: {
          cover_image_id?: string | null
          external_ids?: Json
          id?: string
          medium: Database["public"]["Enums"]["medium"]
          metadata?: Json
          refreshed_at?: string
          release_date?: string | null
          title: string
          year?: number | null
        }
        Update: {
          cover_image_id?: string | null
          external_ids?: Json
          id?: string
          medium?: Database["public"]["Enums"]["medium"]
          metadata?: Json
          refreshed_at?: string
          release_date?: string | null
          title?: string
          year?: number | null
        }
        Relationships: []
      }
      media_release_dates: {
        Row: {
          certification: string | null
          media_item_id: string
          note: string | null
          region: string
          release_type: number
          released_on: string
        }
        Insert: {
          certification?: string | null
          media_item_id: string
          note?: string | null
          region: string
          release_type: number
          released_on: string
        }
        Update: {
          certification?: string | null
          media_item_id?: string
          note?: string | null
          region?: string
          release_type?: number
          released_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_release_dates_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      movie_details: {
        Row: {
          backdrop_image_id: string | null
          collection_name: string | null
          collection_tmdb_id: number | null
          directors: string[]
          genres: string[]
          media_item_id: string
          overview: string | null
          runtime_minutes: number | null
          studio: string | null
          tagline: string | null
          tmdb_id: number
          top_cast: Json
          writers: string[]
        }
        Insert: {
          backdrop_image_id?: string | null
          collection_name?: string | null
          collection_tmdb_id?: number | null
          directors?: string[]
          genres?: string[]
          media_item_id: string
          overview?: string | null
          runtime_minutes?: number | null
          studio?: string | null
          tagline?: string | null
          tmdb_id: number
          top_cast?: Json
          writers?: string[]
        }
        Update: {
          backdrop_image_id?: string | null
          collection_name?: string | null
          collection_tmdb_id?: number | null
          directors?: string[]
          genres?: string[]
          media_item_id?: string
          overview?: string | null
          runtime_minutes?: number | null
          studio?: string | null
          tagline?: string | null
          tmdb_id?: number
          top_cast?: Json
          writers?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "movie_details_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: true
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_links: {
        Row: {
          external_user_id: string
          last_synced_at: string | null
          platform: string
          sync_status: string | null
          token_ref: string | null
          user_id: string
        }
        Insert: {
          external_user_id: string
          last_synced_at?: string | null
          platform: string
          sync_status?: string | null
          token_ref?: string | null
          user_id: string
        }
        Update: {
          external_user_id?: string
          last_synced_at?: string | null
          platform?: string
          sync_status?: string | null
          token_ref?: string | null
          user_id?: string
        }
        Relationships: []
      }
      player_counts: {
        Row: {
          media_item_id: string
          observed_at: string
          players: number
        }
        Insert: {
          media_item_id: string
          observed_at: string
          players: number
        }
        Update: {
          media_item_id?: string
          observed_at?: string
          players?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_counts_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_log: {
        Row: {
          components: Json
          confidence: string
          id: string
          media_item_id: string
          medium: Database["public"]["Enums"]["medium"]
          model_version: string
          predicted_score: number
          request_id: string | null
          shown_at: string
          surface: string
          user_id: string
        }
        Insert: {
          components?: Json
          confidence: string
          id?: string
          media_item_id: string
          medium: Database["public"]["Enums"]["medium"]
          model_version: string
          predicted_score: number
          request_id?: string | null
          shown_at?: string
          surface: string
          user_id?: string
        }
        Update: {
          components?: Json
          confidence?: string
          id?: string
          media_item_id?: string
          medium?: Database["public"]["Enums"]["medium"]
          model_version?: string
          predicted_score?: number
          request_id?: string | null
          shown_at?: string
          surface?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_log_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_log_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "suggestion_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          media: Database["public"]["Enums"]["medium"][] | null
          platforms: string[]
          username: string | null
          watch_provider_ids: number[]
          watch_region: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          media?: Database["public"]["Enums"]["medium"][] | null
          platforms?: string[]
          username?: string | null
          watch_provider_ids?: number[]
          watch_region?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          media?: Database["public"]["Enums"]["medium"][] | null
          platforms?: string[]
          username?: string | null
          watch_provider_ids?: number[]
          watch_region?: string
        }
        Relationships: []
      }
      ranking_entries: {
        Row: {
          media_item_id: string
          medium: Database["public"]["Enums"]["medium"]
          placed_at: string
          placed_by: string
          position: number
          tier: Database["public"]["Enums"]["tier"]
          updated_at: string
          user_id: string
        }
        Insert: {
          media_item_id: string
          medium: Database["public"]["Enums"]["medium"]
          placed_at?: string
          placed_by?: string
          position: number
          tier: Database["public"]["Enums"]["tier"]
          updated_at?: string
          user_id: string
        }
        Update: {
          media_item_id?: string
          medium?: Database["public"]["Enums"]["medium"]
          placed_at?: string
          placed_by?: string
          position?: number
          tier?: Database["public"]["Enums"]["tier"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ranking_entries_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      steam_library: {
        Row: {
          fetched_at: string
          last_played_at: string | null
          media_item_id: string | null
          name: string | null
          playtime_2weeks_minutes: number | null
          playtime_forever_minutes: number
          steam_app_id: number
          user_id: string
        }
        Insert: {
          fetched_at?: string
          last_played_at?: string | null
          media_item_id?: string | null
          name?: string | null
          playtime_2weeks_minutes?: number | null
          playtime_forever_minutes?: number
          steam_app_id: number
          user_id: string
        }
        Update: {
          fetched_at?: string
          last_played_at?: string | null
          media_item_id?: string | null
          name?: string | null
          playtime_2weeks_minutes?: number | null
          playtime_forever_minutes?: number
          steam_app_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "steam_library_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      steam_link_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          response_nonce: string | null
          state_hash: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          response_nonce?: string | null
          state_hash: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          response_nonce?: string | null
          state_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      suggestion_requests: {
        Row: {
          candidate_count: number
          created_at: string
          id: string
          input_tokens: number
          kind: string
          medium: Database["public"]["Enums"]["medium"]
          model: string | null
          output_tokens: number
          picks: Json
          request: Json
          user_id: string
        }
        Insert: {
          candidate_count?: number
          created_at?: string
          id?: string
          input_tokens?: number
          kind: string
          medium: Database["public"]["Enums"]["medium"]
          model?: string | null
          output_tokens?: number
          picks?: Json
          request?: Json
          user_id?: string
        }
        Update: {
          candidate_count?: number
          created_at?: string
          id?: string
          input_tokens?: number
          kind?: string
          medium?: Database["public"]["Enums"]["medium"]
          model?: string | null
          output_tokens?: number
          picks?: Json
          request?: Json
          user_id?: string
        }
        Relationships: []
      }
      tv_details: {
        Row: {
          backdrop_image_id: string | null
          creators: string[]
          episode_count: number | null
          episode_runtime_minutes: number | null
          first_air_date: string | null
          genres: string[]
          in_production: boolean | null
          last_air_date: string | null
          last_episode_air_date: string | null
          last_episode_number: number | null
          last_episode_season: number | null
          media_item_id: string
          networks: string[]
          next_episode_air_date: string | null
          next_episode_name: string | null
          next_episode_number: number | null
          next_episode_season: number | null
          origin_country: string[]
          overview: string | null
          season_count: number | null
          show_type: string | null
          status: string | null
          tmdb_id: number
          top_cast: Json
        }
        Insert: {
          backdrop_image_id?: string | null
          creators?: string[]
          episode_count?: number | null
          episode_runtime_minutes?: number | null
          first_air_date?: string | null
          genres?: string[]
          in_production?: boolean | null
          last_air_date?: string | null
          last_episode_air_date?: string | null
          last_episode_number?: number | null
          last_episode_season?: number | null
          media_item_id: string
          networks?: string[]
          next_episode_air_date?: string | null
          next_episode_name?: string | null
          next_episode_number?: number | null
          next_episode_season?: number | null
          origin_country?: string[]
          overview?: string | null
          season_count?: number | null
          show_type?: string | null
          status?: string | null
          tmdb_id: number
          top_cast?: Json
        }
        Update: {
          backdrop_image_id?: string | null
          creators?: string[]
          episode_count?: number | null
          episode_runtime_minutes?: number | null
          first_air_date?: string | null
          genres?: string[]
          in_production?: boolean | null
          last_air_date?: string | null
          last_episode_air_date?: string | null
          last_episode_number?: number | null
          last_episode_season?: number | null
          media_item_id?: string
          networks?: string[]
          next_episode_air_date?: string | null
          next_episode_name?: string | null
          next_episode_number?: number | null
          next_episode_season?: number | null
          origin_country?: string[]
          overview?: string | null
          season_count?: number | null
          show_type?: string | null
          status?: string | null
          tmdb_id?: number
          top_cast?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tv_details_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: true
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_seasons: {
        Row: {
          air_date: string | null
          episode_count: number | null
          media_item_id: string
          name: string | null
          overview: string | null
          poster_image_id: string | null
          season_number: number
          tmdb_season_id: number | null
        }
        Insert: {
          air_date?: string | null
          episode_count?: number | null
          media_item_id: string
          name?: string | null
          overview?: string | null
          poster_image_id?: string | null
          season_number: number
          tmdb_season_id?: number | null
        }
        Update: {
          air_date?: string | null
          episode_count?: number | null
          media_item_id?: string
          name?: string | null
          overview?: string | null
          poster_image_id?: string | null
          season_number?: number
          tmdb_season_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tv_seasons_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_entries: {
        Row: {
          added_at: string
          backlog_position: number | null
          finished_at: string | null
          id: string
          media_item_id: string
          medium: Database["public"]["Enums"]["medium"]
          notes: string | null
          planned_on: string | null
          played_platforms: string[]
          playtime_minutes: number | null
          playtime_source: string | null
          purchased_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["entry_status"]
          user_id: string
        }
        Insert: {
          added_at?: string
          backlog_position?: number | null
          finished_at?: string | null
          id?: string
          media_item_id: string
          medium?: Database["public"]["Enums"]["medium"]
          notes?: string | null
          planned_on?: string | null
          played_platforms?: string[]
          playtime_minutes?: number | null
          playtime_source?: string | null
          purchased_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["entry_status"]
          user_id: string
        }
        Update: {
          added_at?: string
          backlog_position?: number | null
          finished_at?: string | null
          id?: string
          media_item_id?: string
          medium?: Database["public"]["Enums"]["medium"]
          notes?: string | null
          planned_on?: string | null
          played_platforms?: string[]
          playtime_minutes?: number | null
          playtime_source?: string | null
          purchased_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["entry_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_entries_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_availability: {
        Row: {
          first_seen_at: string
          last_seen_at: string
          media_item_id: string
          offer_type: string
          provider_id: number
          region: string
          removed_at: string | null
        }
        Insert: {
          first_seen_at?: string
          last_seen_at?: string
          media_item_id: string
          offer_type: string
          provider_id: number
          region: string
          removed_at?: string | null
        }
        Update: {
          first_seen_at?: string
          last_seen_at?: string
          media_item_id?: string
          offer_type?: string
          provider_id?: number
          region?: string
          removed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_availability_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_availability_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "watch_providers"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      watch_log: {
        Row: {
          created_at: string
          id: string
          media_item_id: string
          note: string | null
          place: string | null
          user_id: string
          watched_on: string
        }
        Insert: {
          created_at?: string
          id?: string
          media_item_id: string
          note?: string | null
          place?: string | null
          user_id?: string
          watched_on: string
        }
        Update: {
          created_at?: string
          id?: string
          media_item_id?: string
          note?: string | null
          place?: string | null
          user_id?: string
          watched_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_log_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_providers: {
        Row: {
          display_priorities: Json
          logo_image_id: string | null
          name: string
          provider_id: number
          refreshed_at: string
        }
        Insert: {
          display_priorities?: Json
          logo_image_id?: string | null
          name: string
          provider_id: number
          refreshed_at?: string
        }
        Update: {
          display_priorities?: Json
          logo_image_id?: string | null
          name?: string
          provider_id?: number
          refreshed_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      latest_player_counts: {
        Row: {
          media_item_id: string | null
          observed_at: string | null
          players: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_counts_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_percentiles: {
        Row: {
          media_item_id: string | null
          medium: Database["public"]["Enums"]["medium"] | null
          n_ranked: number | null
          overall_rank: number | null
          pct: number | null
          position: number | null
          score: number | null
          tier: Database["public"]["Enums"]["tier"] | null
          tier_size: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ranking_entries_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_external_scores: {
        Row: {
          media_item_id: string | null
          score: number | null
          source: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_scores_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_feature_rows: {
        Row: {
          feature: string | null
          media_item_id: string | null
          medium: Database["public"]["Enums"]["medium"] | null
        }
        Relationships: []
      }
      user_rank_stats: {
        Row: {
          max_score: number | null
          mean_score: number | null
          medium: Database["public"]["Enums"]["medium"] | null
          min_score: number | null
          n_ranked: number | null
          sd_score: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_steam_played_platforms: {
        Args: { p_user_id: string }
        Returns: number
      }
      apply_steam_playtime: { Args: { p_user_id: string }; Returns: number }
      batch_predictions: {
        Args: {
          p_items: string[]
          p_medium: Database["public"]["Enums"]["medium"]
        }
        Returns: {
          confidence: string
          media_item_id: string
          predicted_score: number
        }[]
      }
      begin_steam_import: {
        Args: { p_min_interval?: string; p_user_id: string }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
          steam_id: string
        }[]
      }
      consume_steam_link_state: {
        Args: { p_response_nonce?: string; p_state_hash: string }
        Returns: string
      }
      count_suggestion_requests: { Args: { p_since?: string }; Returns: number }
      deck_candidates: {
        Args: { p_limit?: number; p_offset?: number; p_platforms?: string[] }
        Returns: {
          boost: number
          cover_image_id: string
          external_ids: Json
          genres: string[]
          media_item_id: string
          platforms: string[]
          popularity_rank: number
          title: string
          year: number
        }[]
      }
      delete_my_account: { Args: never; Returns: undefined }
      finish_insertion: {
        Args: {
          p_comparisons: Json
          p_media_item_id: string
          p_medium: Database["public"]["Enums"]["medium"]
          p_placed_by?: string
          p_position: number
          p_tier: Database["public"]["Enums"]["tier"]
        }
        Returns: number
      }
      forget_steam_link_attempts: { Args: never; Returns: undefined }
      funnel_report: {
        Args: { p_since?: string; p_until?: string }
        Returns: {
          step: string
          step_order: number
          users: number
        }[]
      }
      funnel_report_by_cohort: {
        Args: { p_since?: string; p_until?: string }
        Returns: {
          cohort_week: string
          day_7_return: number
          first_pick: number
          first_session: number
          signed_up: number
          ten_ranked: number
        }[]
      }
      funnel_users: {
        Args: { p_since?: string; p_until?: string }
        Returns: {
          day_7_return: boolean
          first_pick: boolean
          first_session: boolean
          signed_up_at: string
          ten_ranked: boolean
          user_id: string
        }[]
      }
      insert_ranking_entry: {
        Args: {
          p_media_item_id: string
          p_medium: Database["public"]["Enums"]["medium"]
          p_placed_by?: string
          p_position: number
          p_tier: Database["public"]["Enums"]["tier"]
        }
        Returns: number
      }
      move_backlog_entry: {
        Args: { p_entry_id: string; p_new_position: number }
        Returns: number
      }
      move_ranking_entry: {
        Args: {
          p_media_item_id: string
          p_position: number
          p_tier: Database["public"]["Enums"]["tier"]
        }
        Returns: number
      }
      movie_calendar: {
        Args: { p_today?: string }
        Returns: {
          cover_image_id: string
          digital_on: string
          external_ids: Json
          kind: string
          media_item_id: string
          on_date: string
          planned_on: string
          runtime_minutes: number
          status: Database["public"]["Enums"]["entry_status"]
          theatrical_on: string
          title: string
          year: number
        }[]
      }
      movie_release_state: {
        Args: { p_media_item_id: string; p_region?: string; p_today?: string }
        Returns: {
          digital_on: string
          media_item_id: string
          placement: string
          placement_on: string
          streams_now: boolean
          theatrical_on: string
        }[]
      }
      movie_watchlist: {
        Args: {
          p_genres?: string[]
          p_max_minutes?: number
          p_on_my_services?: boolean
          p_today?: string
        }
        Returns: {
          added_at: string
          cover_image_id: string
          directors: string[]
          external_ids: Json
          genres: string[]
          media_item_id: string
          on_my_services: number[]
          release_date: string
          rent_or_buy: number[]
          runtime_minutes: number
          streams_on: number[]
          title: string
          tmdb_score: number
          tmdb_vote_count: number
          year: number
        }[]
      }
      played_not_ranked: {
        Args: { p_medium: Database["public"]["Enums"]["medium"] }
        Returns: {
          added_at: string
          cover_image_id: string
          external_ids: Json
          finished_at: string
          genres: string[]
          media_item_id: string
          platforms: string[]
          title: string
          year: number
        }[]
      }
      player_count_history: {
        Args: { p_media_item_id: string; p_since?: string }
        Returns: {
          observed_at: string
          players: number
        }[]
      }
      popular_games: {
        Args: {
          p_limit?: number
          p_medium?: Database["public"]["Enums"]["medium"]
        }
        Returns: {
          cover_image_id: string
          external_ids: Json
          id: string
          platforms: string[]
          title: string
          year: number
        }[]
      }
      ranking_score: {
        Args: {
          p_position: number
          p_tier: Database["public"]["Enums"]["tier"]
          p_tier_size: number
        }
        Returns: number
      }
      ranking_tier_for_score: {
        Args: { p_score: number }
        Returns: Database["public"]["Enums"]["tier"]
      }
      recommendation_content_profile: {
        Args: {
          p_exclude_item?: string
          p_medium: Database["public"]["Enums"]["medium"]
          p_user_id: string
        }
        Returns: {
          feature: string
          weight: number
        }[]
      }
      recommendation_feature_idf: {
        Args: {
          p_features: string[]
          p_medium: Database["public"]["Enums"]["medium"]
        }
        Returns: {
          feature: string
          idf: number
          item_count: number
        }[]
      }
      recommendation_item_features: {
        Args: {
          p_features?: string[]
          p_items?: string[]
          p_medium: Database["public"]["Enums"]["medium"]
        }
        Returns: {
          feature: string
          media_item_id: string
        }[]
      }
      recommendation_loo: {
        Args: {
          p_medium: Database["public"]["Enums"]["medium"]
          p_user_id: string
        }
        Returns: {
          abs_error: number
          confidence: string
          content_abs_error: number
          content_score: number
          mean_abs_error: number
          mean_baseline: number
          media_item_id: string
          predicted_score: number
          predicted_tier: Database["public"]["Enums"]["tier"]
          prior_abs_error: number
          prior_baseline: number
          true_score: number
          true_tier: Database["public"]["Enums"]["tier"]
        }[]
      }
      recommendation_loo_summary: {
        Args: {
          p_medium: Database["public"]["Enums"]["medium"]
          p_user_id: string
        }
        Returns: {
          mae_content: number
          mae_predicted: number
          mae_prior: number
          mae_user_mean: number
          n: number
          spearman: number
          tier_accuracy: number
        }[]
      }
      recommendation_scores: {
        Args: {
          p_exclude_item?: string
          p_items: string[]
          p_medium: Database["public"]["Enums"]["medium"]
          p_user_id: string
        }
        Returns: {
          confidence: string
          content_score: number
          media_item_id: string
          predicted_score: number
          prior_score: number
          why: Json
        }[]
      }
      recommendation_user_scores: {
        Args: {
          p_exclude_item?: string
          p_medium: Database["public"]["Enums"]["medium"]
          p_user_id: string
        }
        Returns: {
          media_item_id: string
          score: number
          tier: Database["public"]["Enums"]["tier"]
        }[]
      }
      refresh_item_priors: {
        Args: { p_medium?: Database["public"]["Enums"]["medium"] }
        Returns: number
      }
      remove_ranking_entry: {
        Args: { p_media_item_id: string }
        Returns: undefined
      }
      search_games: {
        Args: {
          p_limit?: number
          p_medium?: Database["public"]["Enums"]["medium"]
          p_query: string
        }
        Returns: {
          cover_image_id: string
          developer: string
          external_ids: Json
          genres: string[]
          igdb_id: number
          media_item_id: string
          platforms: string[]
          score: number
          title: string
          year: number
        }[]
      }
      search_key: { Args: { p_text: string }; Returns: string }
      set_played_platforms: {
        Args: { p_media_item_id: string; p_platforms: string[] }
        Returns: {
          added_at: string
          backlog_position: number | null
          finished_at: string | null
          id: string
          media_item_id: string
          medium: Database["public"]["Enums"]["medium"]
          notes: string | null
          planned_on: string | null
          played_platforms: string[]
          playtime_minutes: number | null
          playtime_source: string | null
          purchased_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["entry_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_steam_link_state: {
        Args: {
          p_state_hash: string
          p_ttl_seconds?: number
          p_user_id: string
        }
        Returns: string
      }
      steam_backlog_candidates: {
        Args: { p_limit?: number }
        Returns: {
          cover_image_id: string
          external_ids: Json
          last_played_at: string
          media_item_id: string
          name: string
          playtime_forever_minutes: number
          steam_app_id: number
          title: string
          year: number
        }[]
      }
      suggestion_candidates: {
        Args: {
          p_exclude_genres?: string[]
          p_genres?: string[]
          p_include_backlog?: boolean
          p_limit?: number
          p_max_minutes?: number
          p_medium: Database["public"]["Enums"]["medium"]
          p_platforms?: string[]
          p_provider_ids?: number[]
          p_region?: string
        }
        Returns: {
          confidence: string
          content_score: number
          cover_image_id: string
          genres: string[]
          media_item_id: string
          minutes: number
          predicted_score: number
          prior_score: number
          title: string
          why: Json
          year: number
        }[]
      }
      tier_list: {
        Args: {
          p_medium: Database["public"]["Enums"]["medium"]
          p_tier: Database["public"]["Enums"]["tier"]
        }
        Returns: {
          cover_image_id: string
          external_ids: Json
          genres: string[]
          media_item_id: string
          placed_by: string
          platforms: string[]
          played_platforms: string[]
          position: number
          title: string
          year: number
        }[]
      }
      title_initialisms: { Args: { p_title: string }; Returns: string[] }
      unlink_steam: { Args: never; Returns: undefined }
    }
    Enums: {
      comparison_outcome: "a" | "b" | "too_close" | "cant_compare"
      entry_status: "backlog" | "playing" | "played" | "dropped"
      medium: "game" | "movie" | "tv"
      tier: "loved" | "liked" | "fine" | "disliked"
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
      comparison_outcome: ["a", "b", "too_close", "cant_compare"],
      entry_status: ["backlog", "playing", "played", "dropped"],
      medium: ["game", "movie", "tv"],
      tier: ["loved", "liked", "fine", "disliked"],
    },
  },
} as const

