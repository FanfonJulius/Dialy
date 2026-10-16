import { fillUssdTemplate } from './ussd.ts';
import type { AmountLimits } from './withdrawal.ts';

export const DONATION_NETWORKS = ['mtn', 'orange'] as const;
export type DonationNetwork = (typeof DONATION_NETWORKS)[number];

export type DonationTarget = {
	name: string;
	/** Daily's mobile money number on this network. */
	number: string;
	/** Mobile money transfer to `number`'s wallet (not airtime); `{code}` is filled with `number`. */
	template: string;
};

export const DONATION_TARGETS: Readonly<Record<DonationNetwork, DonationTarget>> = {
	mtn: { name: 'MTN MoMo', number: '654571914', template: '*126*9*{code}*{amount}#' },
	// #150*1# is "Transfert d'argent"; option 1 sends to an Orange Money account.
	orange: { name: 'Orange Money', number: '691425334', template: '#150*1*1*{code}*{amount}#' }
};

export const DONATION_LIMITS: AmountLimits = { minAmount: 100, maxAmount: null };
export const DONATION_QUICK_AMOUNTS: readonly number[] = [500, 1000, 2000, 5000];

/** The USSD string that sends `amount` to Daily, e.g. `*126*9*654571914*1000#`. */
export function donationUssd(target: DonationTarget, amount: number): string {
	return fillUssdTemplate(target.template, target.number, amount);
}
