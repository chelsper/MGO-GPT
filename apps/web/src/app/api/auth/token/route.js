import { getToken } from '@auth/core/jwt';

function isSecureRequest(request) {
	const proto = request.headers.get('x-forwarded-proto');
	if (proto) return proto.includes('https');

	try {
		return new URL(request.url).protocol === 'https:';
	} catch {
		return false;
	}
}

export async function GET(request) {
	const secureCookie = isSecureRequest(request);

	const [token, jwt] = await Promise.all([
		getToken({
			req: request,
			secret: process.env.AUTH_SECRET,
			secureCookie,
			raw: true,
		}),
		getToken({
			req: request,
			secret: process.env.AUTH_SECRET,
			secureCookie,
		}),
	]);

	if (!jwt) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}

	return new Response(
		JSON.stringify({
			jwt: token,
			user: {
				id: jwt.sub,
				email: jwt.email,
				name: jwt.name,
			},
		}),
		{
			headers: {
				'Content-Type': 'application/json',
			},
		}
	);
}
