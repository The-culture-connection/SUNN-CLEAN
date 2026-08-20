import { LoginForm } from '@/components/LoginForm';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="login">
      <div className="loginbox">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <img src="/logo-mark.png" alt="" style={{ height: 38 }} />
          <div>
            <b style={{ display: 'block', color: 'var(--navy)', fontSize: '1rem' }}>SUNN CLEAN</b>
            <span style={{ fontSize: '.56rem', letterSpacing: '.15em', color: 'var(--navy-soft)', fontWeight: 700 }}>
              ADMIN PORTAL
            </span>
          </div>
        </div>
        <h1 style={{ fontSize: '1.3rem', marginBottom: 18 }}>Sign in</h1>
        <LoginForm />
      </div>
    </div>
  );
}
