'use client';

import * as pdfjs from 'pdfjs-dist';

import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export const extractTextFromPDF = async (file) => {
	const blobUrl = URL.createObjectURL(file);
	let loadingTask;
	try {
		loadingTask = pdfjs.getDocument({ url: blobUrl, isEvalSupported: false });

		const pdf = await loadingTask.promise;
		const { numPages } = pdf;
		let extractedText = '';

		for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
			const page = await pdf.getPage(pageNumber);

			const textContent = await page.getTextContent();
			const pageText = textContent.items
				.map((item) => ('str' in item ? item.str : ''))
				.join(' ');
			extractedText += pageText;
		}
		if (extractedText.length > 0) {
			return extractedText;
		}
		return undefined;
	} catch (_error) {
		return undefined;
	} finally {
		URL.revokeObjectURL(blobUrl);
		await loadingTask?.destroy().catch(() => {});
	}
};
