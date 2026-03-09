import { UploadClient } from '@uploadcare/upload-client';
import * as React from 'react';
const client = new UploadClient({ publicKey: process.env.EXPO_PUBLIC_UPLOADCARE_PUBLIC_KEY });

function useUpload() {
  const [loading, setLoading] = React.useState(false);
  const upload = React.useCallback(async (input) => {
    try {
      setLoading(true);
      let response;
      if ('reactNativeAsset' in input && input.reactNativeAsset) {
        if (input.reactNativeAsset.file) {
          const formData = new FormData();
          formData.append('file', input.reactNativeAsset.file);
          response = await fetch('/_create/api/upload/', {
            method: 'POST',
            body: formData,
          });
        } else {
          const response = await fetch('/_create/api/upload/presign/', {
            method: 'POST',
          });
          const { secureSignature, secureExpire } = await response.json();
          const result = await client.uploadFile(input.reactNativeAsset, {
            fileName: input.reactNativeAsset.name ?? input.reactNativeAsset.uri.split('/').pop(),
            contentType: input.reactNativeAsset.mimeType,
            secureSignature,
            secureExpire,
          });
          return {
            url: `${process.env.EXPO_PUBLIC_BASE_CREATE_USER_CONTENT_URL}/${result.uuid}/`,
            mimeType: result.mimeType || null,
          };
        }
      } else if ('url' in input) {
        response = await fetch('/_create/api/upload/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: input.url }),
        });
      } else if ('base64' in input) {
        response = await fetch('/_create/api/upload/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ base64: input.base64 }),
        });
      } else {
        response = await fetch('/_create/api/upload/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          body: input.buffer,
        });
      }
      if (!response.ok) {
        if (response.status === 413) {
          throw new Error('Upload failed: File too large.');
        }
        throw new Error('Upload failed');
      }
      const data = await response.json();
      return { url: data.url, mimeType: data.mimeType || null };
    } catch (uploadError) {
      if (uploadError instanceof Error) {
        return { error: uploadError.message };
      }
      if (typeof uploadError === 'string') {
        return { error: uploadError };
      }
      return { error: 'Upload failed' };
    } finally {
      setLoading(false);
    }
  }, []);

  return [upload, { loading }];
}

export { useUpload };
export default useUpload;
