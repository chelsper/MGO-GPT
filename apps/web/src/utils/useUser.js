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

	const refetchUser = React.useCallback((options = {}) => {
		const { showLoading = true } = options;
		if (showLoading) {
			setLoading(true);
		}
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
		refetchUser({ showLoading: true });
	}, [refetchUser]);

	React.useEffect(() => {
		const handleFocus = () => {
			// File pickers and other browser dialogs briefly remove focus. Refresh the
			// session in the background so they do not unmount in-progress forms.
			refetchUser({ showLoading: false });
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
