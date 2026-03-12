/**
 * WARNING: This file connects this app to Create's internal auth system. Do
 * not attempt to edit it. Do not import @auth/create or @auth/create
 * anywhere else or it may break. This is an internal package.
 */
import CreateAuth from '@auth/create';
import Credentials from '@auth/core/providers/credentials';
import { isAllowedWorkspaceEmail } from '@/utils/authDomain';

const result = CreateAuth({
	providers: [
		Credentials({
			credentials: {
				email: {
					label: 'Email',
					type: 'email',
				},
				password: {
					label: 'Password',
					type: 'password',
				},
			},
		}),
	],
	pages: {
		signIn: '/account/signin',
		signOut: '/account/logout',
		error: '/account/signin',
	},
});
const { auth: baseAuth } = result;

export async function auth(...args) {
	const session = await baseAuth(...args);

	if (!session?.user?.email) {
		return null;
	}

	if (!isAllowedWorkspaceEmail(session.user.email)) {
		return null;
	}

	return session;
}
