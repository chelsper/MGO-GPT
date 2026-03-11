async function upload({ url, buffer, base64 }) {
	const response = await fetch(`https://create.xyz/api/v0/upload`, {
		method: 'POST',
		headers: {
			'Content-Type': buffer ? 'application/octet-stream' : 'application/json',
		},
		body: buffer ? buffer : JSON.stringify({ base64, url }),
	});
	if (!response.ok) {
		const errorText = await response.text().catch(() => '');
		throw new Error(errorText || 'Upload provider request failed');
	}
	const data = await response.json();
	if (!data?.url) {
		throw new Error('Upload provider did not return a file URL');
	}
	return {
		url: data.url,
		mimeType: data.mimeType || null,
	};
}

export default upload;
