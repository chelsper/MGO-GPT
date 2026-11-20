import React from 'react';

export const SESSION_CHECK_TIMEOUT_MS = 15_000;

export const useUser = () => {
	const [user, setUser] = React.useState(null);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState(null);
	const mounted = React.useRef(false);
	const inFlight = React.useRef(null);

	const refetchUser = React.useCallback(async (options = {}) => {
		if (!mounted.current || inFlight.current) return;
		const { showLoading = true } = options;
		if (showLoading) setLoading(true);
		setError(null);

		const controller = new AbortController();
		let timer;
		let cancel;
		const deadline = new Promise((_, reject) => {
			cancel = () => {
				clearTimeout(timer);
				controller.abort();
				reject(new Error('Session check stopped'));
			};
			timer = setTimeout(cancel, SESSION_CHECK_TIMEOUT_MS);
		});
		const request = { cancel };
		inFlight.current = request;

		try {
			const readSession = async () => {
				const response = await fetch('/api/auth/session', {
					credentials: 'include',
					cache: 'no-store',
					signal: controller.signal,
				});
				if (response.status === 401) return null;
				if (!response.ok) throw new Error('Session check unavailable');
				const session = await response.json();
				return session?.user ?? null;
			};
			// Bound the whole check, including the response body, even if abort is ignored.
			const nextUser = await Promise.race([readSession(), deadline]);
			if (mounted.current && inFlight.current === request) setUser(nextUser);
		} catch {
			if (mounted.current && inFlight.current === request) {
				// A connection failure is not proof of sign-out. Keep an open form mounted.
				setError('We could not check your sign-in. Please try again or sign in again.');
			}
		} finally {
			clearTimeout(timer);
			if (mounted.current && inFlight.current === request) {
				inFlight.current = null;
				setLoading(false);
			}
		}
	}, []);

	React.useEffect(() => {
		mounted.current = true;
		refetchUser();
		const handleFocus = () => refetchUser({ showLoading: false });
		window.addEventListener('focus', handleFocus);
		return () => {
			mounted.current = false;
			const request = inFlight.current;
			inFlight.current = null;
			request?.cancel();
			window.removeEventListener('focus', handleFocus);
		};
	}, [refetchUser]);

	const clearUser = React.useCallback(() => {
		const request = inFlight.current;
		inFlight.current = null;
		request?.cancel();
		setUser(null);
		setError(null);
		setLoading(false);
	}, []);

	return { user, data: user, loading, error, refetch: refetchUser, clear: clearUser };
};

export default useUser;
