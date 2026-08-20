import Link from 'next/link';
export default function NotFound() {
  return (
    <section><div className="wrap center">
      <h1>Page not found</h1>
      <p className="lede" style={{ margin: '14px auto 22px' }}>
        That link doesn&apos;t go anywhere. Let&apos;s get you back on track.
      </p>
      <Link className="btn btn-primary" href="/">Back to home</Link>
    </div></section>
  );
}
