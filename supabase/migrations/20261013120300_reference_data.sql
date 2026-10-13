-- Networks, USSD templates and storage. Edit these rows in the dashboard to change formats
-- without an app release (keep exactly one active template per network).

insert into public.networks (id, name, color, code_pattern, min_amount, max_amount, quick_amounts, sort_order)
values
	('mtn', 'MTN MoMo', '#FFCC00', '^[0-9]{4,6}$', 500, null, '{5000,10000,20000,50000,100000}', 1),
	('orange', 'Orange Money', '#FF7900', '^[0-9]{4,6}$', 500, null, '{5000,10000,20000,50000,100000}', 2)
on conflict (id) do update
	set name = excluded.name,
	    color = excluded.color,
	    code_pattern = excluded.code_pattern,
	    min_amount = excluded.min_amount,
	    max_amount = excluded.max_amount,
	    quick_amounts = excluded.quick_amounts,
	    sort_order = excluded.sort_order;

insert into public.ussd_templates (network_id, kind, template, notes)
values
	('mtn', 'withdrawal', '*126*16*{code}*{amount}#', 'Agent cash-out. The user types the PIN in the dialer.'),
	('orange', 'withdrawal', '#150*14*{code}*{amount}#', 'Agent cash-out. The user types the PIN in the dialer.');

-- Public bucket for offline map tile archives (OpenStreetMap data, no user content).
insert into storage.buckets (id, name, public)
values ('tiles', 'tiles', true)
on conflict (id) do update set public = excluded.public;
