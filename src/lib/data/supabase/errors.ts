/** The request never reached the server (offline, no data, captive portal). */
export class NetworkError extends Error {
	override name = 'NetworkError';
}

/** supabase-js reports a request that never got an HTTP response with status 0. */
export function apiError(error: { message: string }, status: number): Error | { message: string } {
	return status === 0 ? new NetworkError(error.message) : error;
}
