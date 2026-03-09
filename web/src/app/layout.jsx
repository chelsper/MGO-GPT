"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export default function RootLayout({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            gcTime: 1000 * 60 * 30,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <html lang="en">
      <head>
        <title>MGO-GPT</title>
        <meta
          name="description"
          content="AI-powered tool for Major Gift Officers"
        />

        {/* Open Graph / Link Preview */}
        <meta property="og:title" content="MGO-GPT" />
        <meta
          property="og:description"
          content="AI-powered tool for Major Gift Officers"
        />
        <meta
          property="og:image"
          content="https://raw.createusercontent.com/c630c19e-0da7-44f4-90e6-c12c9d895a6d/"
        />
        <meta property="og:image:width" content="1920" />
        <meta property="og:image:height" content="1080" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://jumgogpt.app" />
        <meta property="og:site_name" content="MGO-GPT" />

        {/* Twitter / iMessage / SMS Preview */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="MGO-GPT" />
        <meta
          name="twitter:description"
          content="AI-powered tool for Major Gift Officers"
        />
        <meta
          name="twitter:image"
          content="https://raw.createusercontent.com/c630c19e-0da7-44f4-90e6-c12c9d895a6d/"
        />

        <link
          rel="icon"
          href="https://ucarecdn.com/8291db54-6f2a-43f4-9fc2-e6ced1ab623d/-/format/auto/"
        />
        <link
          rel="apple-touch-icon"
          href="https://ucarecdn.com/8291db54-6f2a-43f4-9fc2-e6ced1ab623d/-/format/auto/"
        />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </body>
    </html>
  );
}
