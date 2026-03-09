import { ReactNativeAsset, UploadClient } from '@uploadcare/upload-client';
import React, {
	useState,
	useEffect,
	useCallback,
	useMemo,
	useRef,
	useContext,
	useReducer,
	useLayoutEffect,
	useImperativeHandle,
	useDebugValue,
} from 'react';

export function useHandleStreamResponse({ onChunk, onFinish }) {
	const handleStreamResponse = React.useCallback(
		async (response) => {
			if (response.body) {
				const reader = response.body.getReader();
				if (reader) {
					const decoder = new TextDecoder();
					let content = '';
					while (true) {
						const { done, value } = await reader.read();
						if (done) {
							onFinish(content);
							break;
						}
						const chunk = decoder.decode(value, { stream: true });
						content += chunk;
						onChunk(content);
					}
				}
			}
		},
		[onChunk, onFinish]
	);
	return handleStreamResponse;
}

export default useHandleStreamResponse;
