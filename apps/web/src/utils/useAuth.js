import { signIn, signOut } from '@auth/create/react';
import { useCallback } from 'react';

function useAuth() {
	const resolveCallbackUrl = (options) => {
		return options?.callbackUrl || '/';
	};

	const signInWithCredentials = useCallback(
		(options) => {
			return signIn('credentials-signin', {
				...options,
				callbackUrl: resolveCallbackUrl(options),
			});
		},
		[]
	);

	const signUpWithCredentials = useCallback(
		(options) => {
			return signIn('credentials-signup', {
				...options,
				callbackUrl: resolveCallbackUrl(options),
			});
		},
		[]
	);

	const signInWithGoogle = useCallback(
		(options) => {
			return signIn('google', {
				...options,
				callbackUrl: resolveCallbackUrl(options),
			});
		},
		[]
	);
	const signInWithFacebook = useCallback((options) => {
		return signIn('facebook', options);
	}, []);
	const signInWithTwitter = useCallback((options) => {
		return signIn('twitter', options);
	}, []);

	return {
		signInWithCredentials,
		signUpWithCredentials,
		signInWithGoogle,
		signInWithFacebook,
		signInWithTwitter,
		signOut,
	};
}

export default useAuth;
