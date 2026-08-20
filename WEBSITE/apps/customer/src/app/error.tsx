'use client';
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <section><div className="wrap center">
      <h1>Something went wrong</h1>
      <p className="lede" style={{ margin: '14px auto 22px' }}>
        Sorry — that page failed to load. Please try again, or call us and we&apos;ll sort it out.
      </p>
      <button className="btn btn-navy" onClick={reset}>Try again</button>
    </div></section>
  );
}
