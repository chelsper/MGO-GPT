import React from 'react';

export const useUser = () => {
	const [user, setUser] = React.useState(null);
	const [loading, setLoading] = React.useState(true);

	const fetchUser = React.useCallback(async () => {
		const response = await fetch('/api/auth/session', {
			credentials: 'include',
			cache: 'no-store',
		});

		if (!response.ok) {
			return null;
		}

		const session = await response.json();
		return session?.user ?? null;
	}, []);

	const refetchUser = React.useCallback(() => {
		setLoading(true);
		fetchUser()
			.then(setUser)
			.catch(() => {
				setUser(null);
			})
			.finally(() => {
				setLoading(false);
			});
	}, [fetchUser]);

	React.useEffect(() => {
		refetchUser();
	}, [refetchUser]);

	React.useEffect(() => {
		const handleFocus = () => {
			refetchUser();
		};

		window.addEventListener('focus', handleFocus);
		return () => {
			window.removeEventListener('focus', handleFocus);
		};
	}, [refetchUser]);

	const clearUser = React.useCallback(() => {
			setUser(null);
			setLoading(false);
	}, []);

	return {
		user,
		data: user,
		loading,
		refetch: refetchUser,
		clear: clearUser,
	};
};

export default useUser;
