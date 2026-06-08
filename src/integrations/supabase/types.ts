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
      audit_logs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      certification_bodies: {
        Row: {
          country: string | null
          created_at: string
          id: string
          licensing_code: string | null
          name: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          licensing_code?: string | null
          name: string
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          licensing_code?: string | null
          name?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          created_at: string
          gst_number: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          te_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          gst_number?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          te_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          gst_number?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          te_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      consumption_entries: {
        Row: {
          closing_balance_after_kg: number
          company_id: string
          consumed_weight_kg: number
          consumption_date: string | null
          created_at: string
          created_by: string | null
          id: string
          loss_percent: number | null
          loss_weight_kg: number | null
          opening_balance_before_kg: number
          outward_certified_weight_kg: number | null
          outward_sale_id: string | null
          product_lot_id: string
          remarks: string | null
          transaction_certificate_id: string | null
        }
        Insert: {
          closing_balance_after_kg: number
          company_id: string
          consumed_weight_kg: number
          consumption_date?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          loss_percent?: number | null
          loss_weight_kg?: number | null
          opening_balance_before_kg: number
          outward_certified_weight_kg?: number | null
          outward_sale_id?: string | null
          product_lot_id: string
          remarks?: string | null
          transaction_certificate_id?: string | null
        }
        Update: {
          closing_balance_after_kg?: number
          company_id?: string
          consumed_weight_kg?: number
          consumption_date?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          loss_percent?: number | null
          loss_weight_kg?: number | null
          opening_balance_before_kg?: number
          outward_certified_weight_kg?: number | null
          outward_sale_id?: string | null
          product_lot_id?: string
          remarks?: string | null
          transaction_certificate_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consumption_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_outward_sale_id_fkey"
            columns: ["outward_sale_id"]
            isOneToOne: false
            referencedRelation: "outward_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_product_lot_id_fkey"
            columns: ["product_lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_transaction_certificate_id_fkey"
            columns: ["transaction_certificate_id"]
            isOneToOne: false
            referencedRelation: "transaction_certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          company_id: string
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          customer_name: string
          id: string
          legal_name: string | null
          license_no: string | null
          notes: string | null
          postal_code: string | null
          state: string | null
          te_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_id: string
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          customer_name: string
          id?: string
          legal_name?: string | null
          license_no?: string | null
          notes?: string | null
          postal_code?: string | null
          state?: string | null
          te_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          company_id?: string
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          customer_name?: string
          id?: string
          legal_name?: string | null
          license_no?: string | null
          notes?: string | null
          postal_code?: string | null
          state?: string | null
          te_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mass_balance_workbooks: {
        Row: {
          company_id: string
          created_at: string
          error_message: string | null
          file_name: string | null
          id: string
          last_generated_at: string | null
          product_lot_id: string
          row_count: number | null
          status: string
          storage_path: string | null
          transaction_certificate_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          error_message?: string | null
          file_name?: string | null
          id?: string
          last_generated_at?: string | null
          product_lot_id: string
          row_count?: number | null
          status?: string
          storage_path?: string | null
          transaction_certificate_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          error_message?: string | null
          file_name?: string | null
          id?: string
          last_generated_at?: string | null
          product_lot_id?: string
          row_count?: number | null
          status?: string
          storage_path?: string | null
          transaction_certificate_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mass_balance_workbooks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mass_balance_workbooks_product_lot_id_fkey"
            columns: ["product_lot_id"]
            isOneToOne: true
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mass_balance_workbooks_transaction_certificate_id_fkey"
            columns: ["transaction_certificate_id"]
            isOneToOne: false
            referencedRelation: "transaction_certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_reviews: {
        Row: {
          company_id: string
          confidence: number | null
          corrected_value: string | null
          created_at: string
          extracted_value: string | null
          field_name: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          transaction_certificate_id: string | null
          uploaded_file_id: string | null
        }
        Insert: {
          company_id: string
          confidence?: number | null
          corrected_value?: string | null
          created_at?: string
          extracted_value?: string | null
          field_name?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          transaction_certificate_id?: string | null
          uploaded_file_id?: string | null
        }
        Update: {
          company_id?: string
          confidence?: number | null
          corrected_value?: string | null
          created_at?: string
          extracted_value?: string | null
          field_name?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          transaction_certificate_id?: string | null
          uploaded_file_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extraction_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_reviews_transaction_certificate_id_fkey"
            columns: ["transaction_certificate_id"]
            isOneToOne: false
            referencedRelation: "transaction_certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_reviews_uploaded_file_id_fkey"
            columns: ["uploaded_file_id"]
            isOneToOne: false
            referencedRelation: "uploaded_files"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_jobs: {
        Row: {
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          input_payload: Json | null
          job_type: string
          output_payload: Json | null
          started_at: string | null
          status: string | null
          updated_at: string | null
          uploaded_file_id: string
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_payload?: Json | null
          job_type: string
          output_payload?: Json | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          uploaded_file_id: string
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_payload?: Json | null
          job_type?: string
          output_payload?: Json | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          uploaded_file_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extraction_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_jobs_uploaded_file_id_fkey"
            columns: ["uploaded_file_id"]
            isOneToOne: false
            referencedRelation: "uploaded_files"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_model_runs: {
        Row: {
          company_id: string | null
          completion_tokens: number | null
          cost_usd: number | null
          created_at: string | null
          error_message: string | null
          extraction_job_id: string | null
          id: string
          model_name: string | null
          prompt_tokens: number | null
          provider: string
          response_json: Json | null
          success: boolean | null
          uploaded_file_id: string
        }
        Insert: {
          company_id?: string | null
          completion_tokens?: number | null
          cost_usd?: number | null
          created_at?: string | null
          error_message?: string | null
          extraction_job_id?: string | null
          id?: string
          model_name?: string | null
          prompt_tokens?: number | null
          provider: string
          response_json?: Json | null
          success?: boolean | null
          uploaded_file_id: string
        }
        Update: {
          company_id?: string | null
          completion_tokens?: number | null
          cost_usd?: number | null
          created_at?: string | null
          error_message?: string | null
          extraction_job_id?: string | null
          id?: string
          model_name?: string | null
          prompt_tokens?: number | null
          provider?: string
          response_json?: Json | null
          success?: boolean | null
          uploaded_file_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extraction_model_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_model_runs_extraction_job_id_fkey"
            columns: ["extraction_job_id"]
            isOneToOne: false
            referencedRelation: "extraction_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_model_runs_uploaded_file_id_fkey"
            columns: ["uploaded_file_id"]
            isOneToOne: false
            referencedRelation: "uploaded_files"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_adjustments: {
        Row: {
          adjustment_type: string
          approved_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          product_lot_id: string
          quantity_kg: number
          reason: string
        }
        Insert: {
          adjustment_type: string
          approved_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_lot_id: string
          quantity_kg: number
          reason: string
        }
        Update: {
          adjustment_type?: string
          approved_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_lot_id?: string
          quantity_kg?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_adjustments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_adjustments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_adjustments_product_lot_id_fkey"
            columns: ["product_lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      outward_sales: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name_snapshot: string | null
          destination: string | null
          id: string
          normalized_yarn_key: string | null
          notes: string | null
          outward_certified_weight_kg: number | null
          outward_gross_weight_kg: number | null
          outward_invoice_date: string | null
          outward_invoice_no: string | null
          outward_net_weight_kg: number | null
          outward_tc_no: string | null
          product_name: string | null
          transport_doc_no: string | null
          updated_at: string
          vehicle_no: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          destination?: string | null
          id?: string
          normalized_yarn_key?: string | null
          notes?: string | null
          outward_certified_weight_kg?: number | null
          outward_gross_weight_kg?: number | null
          outward_invoice_date?: string | null
          outward_invoice_no?: string | null
          outward_net_weight_kg?: number | null
          outward_tc_no?: string | null
          product_name?: string | null
          transport_doc_no?: string | null
          updated_at?: string
          vehicle_no?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          destination?: string | null
          id?: string
          normalized_yarn_key?: string | null
          notes?: string | null
          outward_certified_weight_kg?: number | null
          outward_gross_weight_kg?: number | null
          outward_invoice_date?: string | null
          outward_invoice_no?: string | null
          outward_net_weight_kg?: number | null
          outward_tc_no?: string | null
          product_name?: string | null
          transport_doc_no?: string | null
          updated_at?: string
          vehicle_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outward_sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outward_sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outward_sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_aliases: {
        Row: {
          alias_text: string
          alias_type: string | null
          company_id: string
          confidence: number | null
          created_at: string
          id: string
          product_master_id: string
        }
        Insert: {
          alias_text: string
          alias_type?: string | null
          company_id: string
          confidence?: number | null
          created_at?: string
          id?: string
          product_master_id: string
        }
        Update: {
          alias_text?: string
          alias_type?: string | null
          company_id?: string
          confidence?: number | null
          created_at?: string
          id?: string
          product_master_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_aliases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_aliases_product_master_id_fkey"
            columns: ["product_master_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
        ]
      }
      product_lots: {
        Row: {
          additional_info_raw: string | null
          article_no: string | null
          certified_weight_kg: number
          company_id: string
          consumed_stock_kg: number | null
          created_at: string
          extraction_confidence: number | null
          id: string
          last_processor: string | null
          last_processor_te_id: string | null
          material_composition: string | null
          needs_manual_review: boolean | null
          net_shipping_weight_kg: number
          normalized_yarn_key: string | null
          number_of_units: number | null
          opening_stock_kg: number
          order_no: string | null
          origin_country: string | null
          product_category: string | null
          product_detail: string | null
          product_master_id: string | null
          product_no: string | null
          production_date: string | null
          raw_block_text: string | null
          remaining_stock_kg: number
          reserved_stock_kg: number | null
          shipment_id: string | null
          shipment_product_no: string | null
          standard_label_grade: string | null
          status: string
          supplementary_weight_kg: number | null
          transaction_certificate_id: string
          unit_type: string | null
          updated_at: string
          yarn_count_raw: string | null
        }
        Insert: {
          additional_info_raw?: string | null
          article_no?: string | null
          certified_weight_kg: number
          company_id: string
          consumed_stock_kg?: number | null
          created_at?: string
          extraction_confidence?: number | null
          id?: string
          last_processor?: string | null
          last_processor_te_id?: string | null
          material_composition?: string | null
          needs_manual_review?: boolean | null
          net_shipping_weight_kg: number
          normalized_yarn_key?: string | null
          number_of_units?: number | null
          opening_stock_kg: number
          order_no?: string | null
          origin_country?: string | null
          product_category?: string | null
          product_detail?: string | null
          product_master_id?: string | null
          product_no?: string | null
          production_date?: string | null
          raw_block_text?: string | null
          remaining_stock_kg: number
          reserved_stock_kg?: number | null
          shipment_id?: string | null
          shipment_product_no?: string | null
          standard_label_grade?: string | null
          status?: string
          supplementary_weight_kg?: number | null
          transaction_certificate_id: string
          unit_type?: string | null
          updated_at?: string
          yarn_count_raw?: string | null
        }
        Update: {
          additional_info_raw?: string | null
          article_no?: string | null
          certified_weight_kg?: number
          company_id?: string
          consumed_stock_kg?: number | null
          created_at?: string
          extraction_confidence?: number | null
          id?: string
          last_processor?: string | null
          last_processor_te_id?: string | null
          material_composition?: string | null
          needs_manual_review?: boolean | null
          net_shipping_weight_kg?: number
          normalized_yarn_key?: string | null
          number_of_units?: number | null
          opening_stock_kg?: number
          order_no?: string | null
          origin_country?: string | null
          product_category?: string | null
          product_detail?: string | null
          product_master_id?: string | null
          product_no?: string | null
          production_date?: string | null
          raw_block_text?: string | null
          remaining_stock_kg?: number
          reserved_stock_kg?: number | null
          shipment_id?: string | null
          shipment_product_no?: string | null
          standard_label_grade?: string | null
          status?: string
          supplementary_weight_kg?: number | null
          transaction_certificate_id?: string
          unit_type?: string | null
          updated_at?: string
          yarn_count_raw?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_lots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lots_product_master_id_fkey"
            columns: ["product_master_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lots_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lots_transaction_certificate_id_fkey"
            columns: ["transaction_certificate_id"]
            isOneToOne: false
            referencedRelation: "transaction_certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      product_master: {
        Row: {
          company_id: string
          created_at: string
          default_unit: string | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          material: string | null
          normalized_key: string
          product_family: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          default_unit?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          material?: string | null
          normalized_key: string
          product_family?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          default_unit?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          material?: string | null
          normalized_key?: string
          product_family?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_master_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          company_id: string
          created_at: string
          filters: Json | null
          id: string
          name: string
          query: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          filters?: Json | null
          id?: string
          name: string
          query?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          filters?: Json | null
          id?: string
          name?: string
          query?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_searches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          company_id: string
          consignee_address: string | null
          consignee_name: string | null
          consignee_te_id: string | null
          created_at: string
          gross_shipping_weight_kg: number | null
          id: string
          invoice_reference: string | null
          raw_block_text: string | null
          shipment_date: string | null
          shipment_doc_no: string | null
          shipment_no: string
          transaction_certificate_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          consignee_address?: string | null
          consignee_name?: string | null
          consignee_te_id?: string | null
          created_at?: string
          gross_shipping_weight_kg?: number | null
          id?: string
          invoice_reference?: string | null
          raw_block_text?: string | null
          shipment_date?: string | null
          shipment_doc_no?: string | null
          shipment_no: string
          transaction_certificate_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          consignee_address?: string | null
          consignee_name?: string | null
          consignee_te_id?: string | null
          created_at?: string
          gross_shipping_weight_kg?: number | null
          id?: string
          invoice_reference?: string | null
          raw_block_text?: string | null
          shipment_date?: string | null
          shipment_doc_no?: string | null
          shipment_no?: string
          transaction_certificate_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_transaction_certificate_id_fkey"
            columns: ["transaction_certificate_id"]
            isOneToOne: false
            referencedRelation: "transaction_certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_ledger: {
        Row: {
          balance_after_kg: number | null
          balance_before_kg: number | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          product_lot_id: string
          qty_in_kg: number | null
          qty_out_kg: number | null
          reference_id: string | null
          reference_type: string | null
          remarks: string | null
          transaction_type: string
        }
        Insert: {
          balance_after_kg?: number | null
          balance_before_kg?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_lot_id: string
          qty_in_kg?: number | null
          qty_out_kg?: number | null
          reference_id?: string | null
          reference_type?: string | null
          remarks?: string | null
          transaction_type: string
        }
        Update: {
          balance_after_kg?: number | null
          balance_before_kg?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_lot_id?: string
          qty_in_kg?: number | null
          qty_out_kg?: number | null
          reference_id?: string | null
          reference_type?: string | null
          remarks?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_product_lot_id_fkey"
            columns: ["product_lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          city: string | null
          client_no: string | null
          company_id: string
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          id: string
          legal_name: string | null
          license_no: string | null
          notes: string | null
          postal_code: string | null
          sc_number: string | null
          state: string | null
          supplier_name: string
          te_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_no?: string | null
          company_id: string
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          id?: string
          legal_name?: string | null
          license_no?: string | null
          notes?: string | null
          postal_code?: string | null
          sc_number?: string | null
          state?: string | null
          supplier_name: string
          te_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          client_no?: string | null
          company_id?: string
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          id?: string
          legal_name?: string | null
          license_no?: string | null
          notes?: string | null
          postal_code?: string | null
          sc_number?: string | null
          state?: string | null
          supplier_name?: string
          te_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_certificates: {
        Row: {
          buyer_company_id: string | null
          buyer_name: string | null
          buyer_te_id: string | null
          certification_body_id: string | null
          certified_weight_kg: number | null
          company_id: string
          created_at: string
          created_by: string | null
          extraction_confidence: number | null
          gross_shipping_weight_kg: number | null
          id: string
          input_tcs: string | null
          issue_date: string | null
          last_updated_date: string | null
          net_shipping_weight_kg: number | null
          notes: string | null
          place_of_issue: string | null
          raw_text: string | null
          review_status: string
          seller_license_no: string | null
          seller_te_id: string | null
          standard: string
          status: string | null
          supplier_id: string | null
          tc_number: string
          updated_at: string
          uploaded_file_id: string | null
          version: string | null
        }
        Insert: {
          buyer_company_id?: string | null
          buyer_name?: string | null
          buyer_te_id?: string | null
          certification_body_id?: string | null
          certified_weight_kg?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          extraction_confidence?: number | null
          gross_shipping_weight_kg?: number | null
          id?: string
          input_tcs?: string | null
          issue_date?: string | null
          last_updated_date?: string | null
          net_shipping_weight_kg?: number | null
          notes?: string | null
          place_of_issue?: string | null
          raw_text?: string | null
          review_status?: string
          seller_license_no?: string | null
          seller_te_id?: string | null
          standard?: string
          status?: string | null
          supplier_id?: string | null
          tc_number: string
          updated_at?: string
          uploaded_file_id?: string | null
          version?: string | null
        }
        Update: {
          buyer_company_id?: string | null
          buyer_name?: string | null
          buyer_te_id?: string | null
          certification_body_id?: string | null
          certified_weight_kg?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          extraction_confidence?: number | null
          gross_shipping_weight_kg?: number | null
          id?: string
          input_tcs?: string | null
          issue_date?: string | null
          last_updated_date?: string | null
          net_shipping_weight_kg?: number | null
          notes?: string | null
          place_of_issue?: string | null
          raw_text?: string | null
          review_status?: string
          seller_license_no?: string | null
          seller_te_id?: string | null
          standard?: string
          status?: string | null
          supplier_id?: string | null
          tc_number?: string
          updated_at?: string
          uploaded_file_id?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_certificates_buyer_company_id_fkey"
            columns: ["buyer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_certificates_certification_body_id_fkey"
            columns: ["certification_body_id"]
            isOneToOne: false
            referencedRelation: "certification_bodies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_certificates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_certificates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_certificates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_certificates_uploaded_file_id_fkey"
            columns: ["uploaded_file_id"]
            isOneToOne: false
            referencedRelation: "uploaded_files"
            referencedColumns: ["id"]
          },
        ]
      }
      uploaded_files: {
        Row: {
          ai_model_used: string | null
          ai_structuring_confidence: number | null
          company_id: string
          created_at: string
          embedded_text: string | null
          extraction_completed_at: string | null
          extraction_pipeline_version: string | null
          extraction_started_at: string | null
          extracted_json: Json | null
          file_name: string
          file_size: number | null
          file_type: string | null
          final_extracted_text: string | null
          id: string
          ocr_average_confidence: number | null
          ocr_engine_used: string | null
          ocr_text: string | null
          parser_error: string | null
          parsing_status: string
          public_url: string | null
          source_type: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          ai_model_used?: string | null
          ai_structuring_confidence?: number | null
          company_id: string
          created_at?: string
          embedded_text?: string | null
          extraction_completed_at?: string | null
          extraction_pipeline_version?: string | null
          extraction_started_at?: string | null
          extracted_json?: Json | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          final_extracted_text?: string | null
          id?: string
          ocr_average_confidence?: number | null
          ocr_engine_used?: string | null
          ocr_text?: string | null
          parser_error?: string | null
          parsing_status?: string
          public_url?: string | null
          source_type?: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          ai_model_used?: string | null
          ai_structuring_confidence?: number | null
          company_id?: string
          created_at?: string
          embedded_text?: string | null
          extraction_completed_at?: string | null
          extraction_pipeline_version?: string | null
          extraction_started_at?: string | null
          extracted_json?: Json | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          final_extracted_text?: string | null
          id?: string
          ocr_average_confidence?: number | null
          ocr_engine_used?: string | null
          ocr_text?: string | null
          parser_error?: string | null
          parsing_status?: string
          public_url?: string | null
          source_type?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploaded_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_stock: {
        Args: {
          _consumed_weight_kg: number
          _consumption_date?: string | null
          _outward_certified_weight_kg: number
          _outward_sale_id: string
          _product_lot_id: string
          _remarks?: string
        }
        Returns: {
          closing_balance_after_kg: number
          company_id: string
          consumed_weight_kg: number
          consumption_date: string | null
          created_at: string
          created_by: string | null
          id: string
          loss_percent: number | null
          loss_weight_kg: number | null
          opening_balance_before_kg: number
          outward_certified_weight_kg: number | null
          outward_sale_id: string | null
          product_lot_id: string
          remarks: string | null
          transaction_certificate_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "consumption_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_company_id: { Args: never; Returns: string }
      ensure_user_company: {
        Args: { _company_name?: string | null }
        Returns: string
      }
      reverse_consumption: {
        Args: { _consumption_entry_id: string; _reason?: string | null }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      normalize_product_key: {
        Args: { article_no?: string; raw_text: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "manager" | "operator" | "viewer"
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
      app_role: ["owner", "admin", "manager", "operator", "viewer"],
    },
  },
} as const
