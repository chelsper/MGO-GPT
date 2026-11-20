import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SessionAccessNotice from './SessionAccessNotice';

afterEach(cleanup);

it('explains the bounded session check without enabling duplicate retries', () => {
  render(<SessionAccessNotice loading returnTo="/my-top-prospects" onRetry={vi.fn()} />);
  expect(screen.getByRole('heading', { name: 'Checking your sign-in...' })).toBeVisible();
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByRole('link')).toBeNull();
});

it('offers sign-in that returns to the original workflow and a read-only retry', () => {
  const retry = vi.fn();
  render(<SessionAccessNotice returnTo="/my-top-prospects?category=active#portfolio" onRetry={retry} />);
  expect(screen.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/account/signin?returnTo=%2Fmy-top-prospects%3Fcategory%3Dactive%23portfolio');
  expect(retry).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Try checking again' }));
  expect(retry).toHaveBeenCalledWith({ showLoading: true });
});

it('distinguishes a failed check from an expired session and hides technical details', () => {
  render(<SessionAccessNotice error="private diagnostic details" returnTo="/my-top-prospects" />);
  expect(screen.getByRole('heading', { name: 'Could not check your sign-in' })).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Your saved records have not changed');
  expect(screen.queryByText(/private diagnostic/)).toBeNull();
  expect(screen.getByRole('link', { name: 'Sign in' })).toBeVisible();
});

it.each(['https://evil.example/', '//evil.example/', '/account/signin'])('does not create an unsafe or looping return link: %s', returnTo => {
  render(<SessionAccessNotice returnTo={returnTo} />);
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/account/signin?returnTo=%2F');
});
