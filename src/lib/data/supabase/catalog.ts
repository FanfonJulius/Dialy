import type { DailyDatabase, StoredNetwork } from '#lib/data/local/db.js';
import { isValidUssdTemplate } from '#lib/domain/ussd.js';
import { supabase } from './client.js';

/** Replaces the local copy of active networks (names, code formats, amount limits, dial templates). */
export async function refreshNetworks(db: DailyDatabase): Promise<void> {
	const [networksResult, templatesResult] = await Promise.all([
		supabase
			.from('networks')
			.select('id, name, color, code_pattern, min_amount, max_amount, quick_amounts, sort_order')
			.eq('active', true)
			.order('sort_order'),
		supabase.from('ussd_templates').select('network_id, template').eq('active', true).eq('kind', 'withdrawal')
	]);
	if (networksResult.error) throw networksResult.error;
	if (templatesResult.error) throw templatesResult.error;

	const templates = new Map(
		templatesResult.data
			.filter((row) => isValidUssdTemplate(row.template))
			.map((row) => [row.network_id, row.template])
	);
	const networks: StoredNetwork[] = networksResult.data.map((row) => ({
		id: row.id,
		name: row.name,
		color: row.color,
		codePattern: row.code_pattern,
		minAmount: row.min_amount,
		maxAmount: row.max_amount,
		quickAmounts: row.quick_amounts,
		sortOrder: row.sort_order,
		withdrawalTemplate: templates.get(row.id) ?? null
	}));
	await db.transaction('rw', db.networks, async () => {
		await db.networks.clear();
		await db.networks.bulkPut(networks);
	});
}
