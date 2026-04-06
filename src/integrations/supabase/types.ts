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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      blueprint_comments: {
        Row: {
          blueprint_id: string
          content: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blueprint_id: string
          content: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          blueprint_id?: string
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_comments_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_youtube_comments: {
        Row: {
          author_avatar_url: string | null
          author_name: string | null
          blueprint_id: string
          content: string
          created_at: string
          display_order: number
          fetched_at: string
          id: string
          like_count: number | null
          published_at: string | null
          sort_mode: string
          source_comment_id: string
          youtube_video_id: string
        }
        Insert: {
          author_avatar_url?: string | null
          author_name?: string | null
          blueprint_id: string
          content: string
          created_at?: string
          display_order: number
          fetched_at?: string
          id?: string
          like_count?: number | null
          published_at?: string | null
          sort_mode: string
          source_comment_id: string
          youtube_video_id: string
        }
        Update: {
          author_avatar_url?: string | null
          author_name?: string | null
          blueprint_id?: string
          content?: string
          created_at?: string
          display_order?: number
          fetched_at?: string
          id?: string
          like_count?: number | null
          published_at?: string | null
          sort_mode?: string
          source_comment_id?: string
          youtube_video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_youtube_comments_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_youtube_refresh_state: {
        Row: {
          blueprint_id: string
          comments_auto_stage: number
          comments_manual_cooldown_until: string | null
          consecutive_comments_failures: number
          consecutive_view_failures: number
          created_at: string
          enabled: boolean
          last_comments_refresh_at: string | null
          last_comments_manual_refresh_at: string | null
          last_comments_manual_triggered_by: string | null
          last_comments_refresh_status: string | null
          last_error_message: string | null
          last_view_refresh_at: string | null
          last_view_refresh_status: string | null
          next_comments_refresh_at: string | null
          next_view_refresh_at: string | null
          source_item_id: string | null
          updated_at: string
          youtube_video_id: string
        }
        Insert: {
          blueprint_id: string
          comments_auto_stage?: number
          comments_manual_cooldown_until?: string | null
          consecutive_comments_failures?: number
          consecutive_view_failures?: number
          created_at?: string
          enabled?: boolean
          last_comments_manual_refresh_at?: string | null
          last_comments_manual_triggered_by?: string | null
          last_comments_refresh_at?: string | null
          last_comments_refresh_status?: string | null
          last_error_message?: string | null
          last_view_refresh_at?: string | null
          last_view_refresh_status?: string | null
          next_comments_refresh_at?: string | null
          next_view_refresh_at?: string | null
          source_item_id?: string | null
          updated_at?: string
          youtube_video_id: string
        }
        Update: {
          blueprint_id?: string
          comments_auto_stage?: number
          comments_manual_cooldown_until?: string | null
          consecutive_comments_failures?: number
          consecutive_view_failures?: number
          created_at?: string
          enabled?: boolean
          last_comments_manual_refresh_at?: string | null
          last_comments_manual_triggered_by?: string | null
          last_comments_refresh_at?: string | null
          last_comments_refresh_status?: string | null
          last_error_message?: string | null
          last_view_refresh_at?: string | null
          last_view_refresh_status?: string | null
          next_comments_refresh_at?: string | null
          next_view_refresh_at?: string | null
          source_item_id?: string | null
          updated_at?: string
          youtube_video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_youtube_refresh_state_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: true
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprint_youtube_refresh_state_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "source_items"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_youtube_search_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          fetched_at: string
          kind: string
          last_served_at: string | null
          page_token: string | null
          query: string
          response_json: Json
          updated_at: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          fetched_at?: string
          kind: string
          last_served_at?: string | null
          page_token?: string | null
          query: string
          response_json: Json
          updated_at?: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          fetched_at?: string
          kind?: string
          last_served_at?: string | null
          page_token?: string | null
          query?: string
          response_json?: Json
          updated_at?: string
        }
        Relationships: []
      }
      blueprint_likes: {
        Row: {
          blueprint_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          blueprint_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          blueprint_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_likes_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_tags: {
        Row: {
          blueprint_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          blueprint_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          blueprint_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_tags_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprint_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprints: {
        Row: {
          banner_url: string | null
          created_at: string
          creator_user_id: string
          id: string
          inventory_id: string | null
          is_public: boolean
          likes_count: number
          llm_review: string | null
          mix_notes: string | null
          preview_summary: string | null
          review_prompt: string | null
          sections_json: Json | null
          selected_items: Json
          source_blueprint_id: string | null
          steps: Json | null
          title: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          creator_user_id: string
          id?: string
          inventory_id?: string | null
          is_public?: boolean
          likes_count?: number
          llm_review?: string | null
          mix_notes?: string | null
          preview_summary?: string | null
          review_prompt?: string | null
          sections_json?: Json | null
          selected_items?: Json
          source_blueprint_id?: string | null
          steps?: Json | null
          title: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          creator_user_id?: string
          id?: string
          inventory_id?: string | null
          is_public?: boolean
          likes_count?: number
          llm_review?: string | null
          mix_notes?: string | null
          preview_summary?: string | null
          review_prompt?: string | null
          sections_json?: Json | null
          selected_items?: Json
          source_blueprint_id?: string | null
          steps?: Json | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blueprints_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blueprints_source_blueprint_id_fkey"
            columns: ["source_blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_candidates: {
        Row: {
          channel_slug: string
          created_at: string
          id: string
          status: string
          submitted_by_user_id: string | null
          updated_at: string
          user_feed_item_id: string
        }
        Insert: {
          channel_slug?: string
          created_at?: string
          id?: string
          status?: string
          submitted_by_user_id?: string | null
          updated_at?: string
          user_feed_item_id: string
        }
        Update: {
          channel_slug?: string
          created_at?: string
          id?: string
          status?: string
          submitted_by_user_id?: string | null
          updated_at?: string
          user_feed_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_candidates_user_feed_item_id_fkey"
            columns: ["user_feed_item_id"]
            isOneToOne: false
            referencedRelation: "user_feed_items"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_gate_decisions: {
        Row: {
          candidate_id: string
          created_at: string
          gate_id: string
          id: string
          method_version: string | null
          outcome: string
          policy_version: string | null
          reason_code: string
          score: number | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          gate_id?: string
          id?: string
          method_version?: string | null
          outcome?: string
          policy_version?: string | null
          reason_code?: string
          score?: number | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          gate_id?: string
          id?: string
          method_version?: string | null
          outcome?: string
          policy_version?: string | null
          reason_code?: string
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_gate_decisions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "channel_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "wall_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          created_at: string
          delta: number
          entry_type: string
          id: string
          idempotency_key: string
          metadata: Json | null
          reason_code: string
          source_item_id: string | null
          source_page_id: string | null
          unlock_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta?: number
          entry_type?: string
          id?: string
          idempotency_key: string
          metadata?: Json | null
          reason_code?: string
          source_item_id?: string | null
          source_page_id?: string | null
          unlock_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          entry_type?: string
          id?: string
          idempotency_key?: string
          metadata?: Json | null
          reason_code?: string
          source_item_id?: string | null
          source_page_id?: string | null
          unlock_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      inventories: {
        Row: {
          created_at: string
          creator_user_id: string
          generated_schema: Json
          generation_controls: Json | null
          id: string
          include_score: boolean
          is_public: boolean
          likes_count: number
          prompt_categories: string
          prompt_inventory: string
          review_sections: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_user_id: string
          generated_schema?: Json
          generation_controls?: Json | null
          id?: string
          include_score?: boolean
          is_public?: boolean
          likes_count?: number
          prompt_categories: string
          prompt_inventory: string
          review_sections?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_user_id?: string
          generated_schema?: Json
          generation_controls?: Json | null
          id?: string
          include_score?: boolean
          is_public?: boolean
          likes_count?: number
          prompt_categories?: string
          prompt_inventory?: string
          review_sections?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_likes: {
        Row: {
          created_at: string
          id: string
          inventory_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_likes_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_remixes: {
        Row: {
          created_at: string
          id: string
          inventory_id: string
          source_inventory_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_id: string
          source_inventory_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_id?: string
          source_inventory_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_remixes_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_remixes_source_inventory_id_fkey"
            columns: ["source_inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_tags: {
        Row: {
          created_at: string
          inventory_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          inventory_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          inventory_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_tags_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      mvp_events: {
        Row: {
          blueprint_id: string | null
          created_at: string
          event_name: string
          id: string
          metadata: Json | null
          path: string | null
          user_id: string | null
        }
        Insert: {
          blueprint_id?: string | null
          created_at?: string
          event_name: string
          id?: string
          metadata?: Json | null
          path?: string | null
          user_id?: string | null
        }
        Update: {
          blueprint_id?: string | null
          created_at?: string
          event_name?: string
          id?: string
          metadata?: Json | null
          path?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      post_bookmarks: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "wall_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "wall_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          follower_count: number
          following_count: number
          id: string
          is_public: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          follower_count?: number
          following_count?: number
          id?: string
          is_public?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          follower_count?: number
          following_count?: number
          id?: string
          is_public?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recipe_tags: {
        Row: {
          created_at: string
          recipe_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          recipe_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          recipe_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_tags_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "user_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      source_item_unlocks: {
        Row: {
          blueprint_id: string | null
          created_at: string
          estimated_cost: number
          id: string
          job_id: string | null
          last_error_code: string | null
          last_error_message: string | null
          reservation_expires_at: string | null
          reserved_by_user_id: string | null
          reserved_ledger_id: string | null
          source_item_id: string
          source_page_id: string | null
          status: string
          transcript_attempt_count: number | null
          transcript_last_probe_at: string | null
          transcript_no_caption_hits: number | null
          transcript_probe_meta: Json | null
          transcript_retry_after: string | null
          transcript_status: string | null
          updated_at: string
        }
        Insert: {
          blueprint_id?: string | null
          created_at?: string
          estimated_cost?: number
          id?: string
          job_id?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          reservation_expires_at?: string | null
          reserved_by_user_id?: string | null
          reserved_ledger_id?: string | null
          source_item_id: string
          source_page_id?: string | null
          status?: string
          transcript_attempt_count?: number | null
          transcript_last_probe_at?: string | null
          transcript_no_caption_hits?: number | null
          transcript_probe_meta?: Json | null
          transcript_retry_after?: string | null
          transcript_status?: string | null
          updated_at?: string
        }
        Update: {
          blueprint_id?: string | null
          created_at?: string
          estimated_cost?: number
          id?: string
          job_id?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          reservation_expires_at?: string | null
          reserved_by_user_id?: string | null
          reserved_ledger_id?: string | null
          source_item_id?: string
          source_page_id?: string | null
          status?: string
          transcript_attempt_count?: number | null
          transcript_last_probe_at?: string | null
          transcript_no_caption_hits?: number | null
          transcript_probe_meta?: Json | null
          transcript_retry_after?: string | null
          transcript_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_item_unlocks_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_item_unlocks_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: true
            referencedRelation: "source_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_item_unlocks_source_page_id_fkey"
            columns: ["source_page_id"]
            isOneToOne: false
            referencedRelation: "source_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      source_items: {
        Row: {
          canonical_key: string
          created_at: string
          id: string
          ingest_status: string
          metadata: Json
          source_channel_id: string | null
          source_channel_title: string | null
          source_native_id: string
          source_page_id: string | null
          source_type: string
          source_url: string
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          canonical_key: string
          created_at?: string
          id?: string
          ingest_status?: string
          metadata?: Json
          source_channel_id?: string | null
          source_channel_title?: string | null
          source_native_id?: string
          source_page_id?: string | null
          source_type?: string
          source_url?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          canonical_key?: string
          created_at?: string
          id?: string
          ingest_status?: string
          metadata?: Json
          source_channel_id?: string | null
          source_channel_title?: string | null
          source_native_id?: string
          source_page_id?: string | null
          source_type?: string
          source_url?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_items_source_page_id_fkey"
            columns: ["source_page_id"]
            isOneToOne: false
            referencedRelation: "source_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      source_pages: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          created_at: string
          external_id: string
          external_url: string
          id: string
          is_active: boolean
          metadata: Json
          platform: string
          title: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          created_at?: string
          external_id: string
          external_url?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          platform?: string
          title?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          created_at?: string
          external_id?: string
          external_url?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          platform?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      tag_follows: {
        Row: {
          created_at: string
          id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_follows_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_mutes: {
        Row: {
          created_at: string
          id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_mutes_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          created_by: string | null
          follower_count: number
          id: string
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          follower_count?: number
          id?: string
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          follower_count?: number
          id?: string
          slug?: string
        }
        Relationships: []
      }
      user_credit_wallets: {
        Row: {
          balance: number
          capacity: number
          created_at: string
          last_refill_at: string
          refill_rate_per_sec: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          capacity?: number
          created_at?: string
          last_refill_at?: string
          refill_rate_per_sec?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          capacity?: number
          created_at?: string
          last_refill_at?: string
          refill_rate_per_sec?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_generation_entitlements: {
        Row: {
          created_at: string
          daily_limit_override: number | null
          plan: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_limit_override?: number | null
          plan?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_limit_override?: number | null
          plan?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_generation_daily_usage: {
        Row: {
          created_at: string
          updated_at: string
          usage_day: string
          used_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          updated_at?: string
          usage_day: string
          used_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          updated_at?: string
          usage_day?: string
          used_count?: number
          user_id?: string
        }
        Relationships: []
      }
      user_feed_items: {
        Row: {
          blueprint_id: string | null
          created_at: string
          generated_at_on_wall: string | null
          id: string
          last_decision_code: string | null
          source_item_id: string | null
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blueprint_id?: string | null
          created_at?: string
          generated_at_on_wall?: string | null
          id?: string
          last_decision_code?: string | null
          source_item_id?: string | null
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          blueprint_id?: string | null
          created_at?: string
          generated_at_on_wall?: string | null
          id?: string
          last_decision_code?: string | null
          source_item_id?: string | null
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feed_items_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_feed_items_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "source_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      user_recipes: {
        Row: {
          analysis: Json | null
          created_at: string
          id: string
          is_public: boolean | null
          items: Json
          name: string
          recipe_type: Database["public"]["Enums"]["recipe_type"]
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["recipe_visibility"]
        }
        Insert: {
          analysis?: Json | null
          created_at?: string
          id?: string
          is_public?: boolean | null
          items?: Json
          name: string
          recipe_type: Database["public"]["Enums"]["recipe_type"]
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["recipe_visibility"]
        }
        Update: {
          analysis?: Json | null
          created_at?: string
          id?: string
          is_public?: boolean | null
          items?: Json
          name?: string
          recipe_type?: Database["public"]["Enums"]["recipe_type"]
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["recipe_visibility"]
        }
        Relationships: []
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
          role?: Database["public"]["Enums"]["app_role"]
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
      user_source_subscriptions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          source_channel_id: string | null
          source_page_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          source_channel_id?: string | null
          source_page_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          source_channel_id?: string | null
          source_page_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_source_subscriptions_source_page_id_fkey"
            columns: ["source_page_id"]
            isOneToOne: false
            referencedRelation: "source_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_quota_state: {
        Row: {
          cooldown_until: string | null
          created_at: string
          day_started_at: string | null
          last_403_at: string | null
          last_429_at: string | null
          live_calls_day: number
          live_calls_window: number
          provider: string
          updated_at: string
          window_started_at: string | null
        }
        Insert: {
          cooldown_until?: string | null
          created_at?: string
          day_started_at?: string | null
          last_403_at?: string | null
          last_429_at?: string | null
          live_calls_day?: number
          live_calls_window?: number
          provider: string
          updated_at?: string
          window_started_at?: string | null
        }
        Update: {
          cooldown_until?: string | null
          created_at?: string
          day_started_at?: string | null
          last_403_at?: string | null
          last_429_at?: string | null
          live_calls_day?: number
          live_calls_window?: number
          provider?: string
          updated_at?: string
          window_started_at?: string | null
        }
        Relationships: []
      }
      wall_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          likes_count: number
          parent_id: string | null
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          likes_count?: number
          parent_id?: string | null
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          likes_count?: number
          parent_id?: string | null
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wall_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "wall_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wall_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "wall_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      wall_posts: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          likes_count: number | null
          recipe_id: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          likes_count?: number | null
          recipe_id: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          likes_count?: number | null
          recipe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wall_posts_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "user_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_generation_daily_quota: {
        Args: {
          p_limit: number
          p_reset_hour_utc?: number
          p_units: number
          p_user_id: string
        }
        Returns: {
          allowed: boolean
          limit_count: number
          remaining_count: number
          reset_at: string
          usage_day: string
          used_count: number
        }[]
      }
      get_generation_plan_for_user: {
        Args: {
          p_user_id: string
        }
        Returns: {
          daily_limit_override: number | null
          plan: string
        }[]
      }
      get_generation_daily_quota_status: {
        Args: {
          p_limit: number
          p_reset_hour_utc?: number
          p_user_id: string
        }
        Returns: {
          limit_count: number
          remaining_count: number
          reset_at: string
          usage_day: string
          used_count: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      set_generation_plan_by_email: {
        Args: {
          p_daily_limit_override?: number
          p_email: string
          p_plan: string
        }
        Returns: {
          result_daily_limit_override: number | null
          result_email: string
          result_plan: string
          result_user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      recipe_type: "blend" | "protein" | "stack"
      recipe_visibility: "private" | "unlisted" | "public"
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
      app_role: ["admin", "moderator", "user"],
      recipe_type: ["blend", "protein", "stack"],
      recipe_visibility: ["private", "unlisted", "public"],
    },
  },
} as const
