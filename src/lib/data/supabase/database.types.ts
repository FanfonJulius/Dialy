// Mirrors supabase/migrations in the format of `supabase gen types typescript`.
// Regenerate with `npm run db:types` once the CLI is linked to the project.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type PointRow = {
	id: string;
	network_id: string;
	code: string;
	lat: number;
	lng: number;
	accuracy_m: number;
	withdrawal_count: number;
	last_withdrawal_at: string | null;
	updated_at: string;
};

export type Database = {
	public: {
		Tables: {
			networks: {
				Row: {
					id: string;
					name: string;
					color: string;
					code_pattern: string;
					min_amount: number;
					max_amount: number | null;
					quick_amounts: number[];
					sort_order: number;
					active: boolean;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id: string;
					name: string;
					color: string;
					code_pattern: string;
					min_amount: number;
					max_amount?: number | null;
					quick_amounts?: number[];
					sort_order?: number;
					active?: boolean;
					created_at?: string;
					updated_at?: string;
				};
				Update: Partial<Database['public']['Tables']['networks']['Insert']>;
				Relationships: [];
			};
			ussd_templates: {
				Row: {
					id: string;
					network_id: string;
					kind: string;
					template: string;
					active: boolean;
					notes: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					network_id: string;
					kind?: string;
					template: string;
					active?: boolean;
					notes?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: Partial<Database['public']['Tables']['ussd_templates']['Insert']>;
				Relationships: [
					{
						foreignKeyName: 'ussd_templates_network_id_fkey';
						columns: ['network_id'];
						isOneToOne: false;
						referencedRelation: 'networks';
						referencedColumns: ['id'];
					}
				];
			};
			points: {
				Row: {
					id: string;
					network_id: string;
					code: string;
					location: unknown;
					accuracy_m: number;
					withdrawal_count: number;
					last_withdrawal_at: string | null;
					status: string;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					network_id: string;
					code: string;
					location: unknown;
					accuracy_m: number;
					withdrawal_count?: number;
					last_withdrawal_at?: string | null;
					status?: string;
					created_at?: string;
					updated_at?: string;
				};
				Update: Partial<Database['public']['Tables']['points']['Insert']>;
				Relationships: [
					{
						foreignKeyName: 'points_network_id_fkey';
						columns: ['network_id'];
						isOneToOne: false;
						referencedRelation: 'networks';
						referencedColumns: ['id'];
					}
				];
			};
			withdrawals: {
				Row: {
					id: string;
					client_uuid: string;
					user_id: string;
					point_id: string;
					amount: number;
					location: unknown | null;
					accuracy_m: number | null;
					captured_at: string;
					created_point: boolean;
					counted: boolean;
					created_at: string;
				};
				Insert: {
					id?: string;
					client_uuid: string;
					user_id: string;
					point_id: string;
					amount: number;
					location?: unknown | null;
					accuracy_m?: number | null;
					captured_at: string;
					created_point?: boolean;
					counted?: boolean;
					created_at?: string;
				};
				Update: Partial<Database['public']['Tables']['withdrawals']['Insert']>;
				Relationships: [
					{
						foreignKeyName: 'withdrawals_point_id_fkey';
						columns: ['point_id'];
						isOneToOne: false;
						referencedRelation: 'points';
						referencedColumns: ['id'];
					}
				];
			};
			saved_points: {
				Row: { user_id: string; point_id: string; created_at: string };
				Insert: { user_id?: string; point_id: string; created_at?: string };
				Update: Partial<Database['public']['Tables']['saved_points']['Insert']>;
				Relationships: [
					{
						foreignKeyName: 'saved_points_point_id_fkey';
						columns: ['point_id'];
						isOneToOne: false;
						referencedRelation: 'points';
						referencedColumns: ['id'];
					}
				];
			};
			profiles: {
				Row: {
					id: string;
					locale: string | null;
					theme: string;
					privacy_version: number | null;
					onboarded_at: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id: string;
					locale?: string | null;
					theme?: string;
					privacy_version?: number | null;
					onboarded_at?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
				Relationships: [];
			};
		};
		Views: { [_ in never]: never };
		Functions: {
			record_withdrawal: {
				Args: {
					p_client_uuid: string;
					p_network_id: string;
					p_code: string;
					p_amount: number;
					p_lat?: number;
					p_lng?: number;
					p_accuracy_m?: number;
					p_captured_at?: string;
					p_point_id?: string;
				};
				Returns: Database['public']['CompositeTypes']['withdrawal_result'];
			};
			points_in_bbox: {
				Args: {
					p_west: number;
					p_south: number;
					p_east: number;
					p_north: number;
					p_since?: string;
					p_since_id?: string;
					p_limit?: number;
				};
				Returns: (PointRow & { status: string })[];
			};
			nearby_points: {
				Args: { p_lat: number; p_lng: number; p_radius_m?: number; p_limit?: number };
				Returns: (PointRow & { distance_m: number })[];
			};
			delete_my_account: { Args: never; Returns: undefined };
			my_saved_points: {
				Args: never;
				Returns: (Omit<PointRow, 'id'> & { point_id: string; saved_at: string })[];
			};
			my_withdrawals: {
				Args: never;
				Returns: (Omit<PointRow, 'id'> & {
					client_uuid: string;
					amount: number;
					captured_at: string;
					point_id: string;
					status: string;
				})[];
			};
		};
		Enums: { [_ in never]: never };
		CompositeTypes: {
			withdrawal_result: { point_id: string | null; outcome: string | null };
		};
	};
};
