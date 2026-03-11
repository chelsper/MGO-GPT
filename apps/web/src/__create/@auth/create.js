import { getToken } from '@auth/core/jwt';
import { getContext } from 'hono/context-storage';

function isSecureRequest(request) {
	const proto = request.headers.get('x-forwarded-proto');
	if (proto) return proto.includes('https');

	try {
		return new URL(request.url).protocol === 'https:';
	} catch {
		return false;
	}
}

export default function CreateAuth() {
	const auth = async () => {
		const c = getContext();
		const token = await getToken({
			req: c.req.raw,
			secret: process.env.AUTH_SECRET,
			secureCookie: isSecureRequest(c.req.raw),
		});
		if (token) {
			return {
				user: {
					id: token.sub,
					email: token.email,
					name: token.name,
					image: token.picture,
				},
				expires: token.exp.toString(),
			};
		}
	};
	return {
		auth,
	};
}
