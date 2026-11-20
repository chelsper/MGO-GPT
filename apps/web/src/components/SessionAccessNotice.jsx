import { buildSignInHref } from '@/utils/signInNavigation';

export default function SessionAccessNotice({ loading, error, onRetry, returnTo }) {
  return (
    <main className="min-h-screen bg-[#F5F9F8] px-5 py-20 text-[#173D35] sm:py-28">
      <section className="mx-auto max-w-lg rounded-2xl border border-[#D6E5E0] bg-white p-6 shadow-sm sm:p-8" aria-labelledby="session-access-heading" aria-busy={loading || undefined}>
        <h1 id="session-access-heading" className="text-2xl font-semibold">
          {loading ? 'Checking your sign-in...' : error ? 'Could not check your sign-in' : 'Sign in to continue'}
        </h1>
        <p className="mt-3 leading-relaxed text-[#526B64]" role="status">
          {loading
            ? 'This usually takes a few seconds.'
            : error
              ? 'The connection did not finish. Try again, or open sign-in. Your saved records have not changed.'
              : 'Your session may have ended. Sign in to return to this page. JU staff can choose Jacksonville University SSO.'}
        </p>
        {!loading && (
          <div className="mt-6 flex flex-wrap gap-3">
            <a className="rounded-lg bg-[#007F66] px-5 py-3 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007F66]" href={buildSignInHref(returnTo)}>Sign in</a>
            {onRetry && <button type="button" className="rounded-lg border border-[#ACCBC1] px-5 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007F66]" onClick={() => onRetry({ showLoading: true })}>Try checking again</button>}
          </div>
        )}
      </section>
    </main>
  );
}
