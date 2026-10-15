import { describe, expect, it } from 'vitest';
import { NetworkError, apiError } from './errors.js';

describe('apiError', () => {
	it('marks requests that never got an answer as network errors', () => {
		expect(apiError({ message: 'TypeError: Failed to fetch' }, 0)).toBeInstanceOf(NetworkError);
	});

	it('passes server answers through unchanged', () => {
		const rejection = { message: 'too_close', code: 'P0001' };
		expect(apiError(rejection, 400)).toBe(rejection);
	});
});
