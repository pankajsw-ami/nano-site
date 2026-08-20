import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { getChatError } from "./chatUtils";

export default function AdminLogin({ onSuccess, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    let cancelled = false;

    const checkExistingAdminSession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || cancelled) {
        if (!cancelled) setCheckingSession(false);
        return;
      }

      const user = data.session?.user;
      if (!user || user.is_anonymous) {
        if (!cancelled) setCheckingSession(false);
        return;
      }

      const { data: isAdmin, error: adminError } = await supabase.rpc("chat_is_admin");
      if (!cancelled && !adminError && isAdmin) {
        onSuccessRef.current();
        return;
      }
      if (!cancelled) setCheckingSession(false);
    };

    checkExistingAdminSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your admin email and password.");
      return;
    }

    setLoading(true);
    setError("");
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(getChatError(signInError, "Unable to sign in."));
      setLoading(false);
      return;
    }

    if (!data.user || data.user.is_anonymous) {
      setError("This account cannot access the admin dashboard.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    const { data: isAdmin, error: adminError } = await supabase.rpc("chat_is_admin");
    if (adminError || !isAdmin) {
      setError("This account is not authorized as a Nano Aakriti admin.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    onSuccessRef.current();
    setLoading(false);
  };

  return (
    <div className="chat-admin-login-page">
      <div className="chat-admin-login-card">
        <div className="chat-admin-login-mark">NA</div>
        <h2>Admin Login</h2>
        <p>Sign in with the authorized Supabase account to manage customer enquiries.</p>
        {checkingSession ? (
          <div className="chat-status-card">
            <span className="chat-spinner" aria-hidden="true" />
            <p>Checking secure session...</p>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="chat-admin-login-form">
            <label>
              Admin email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Your Supabase Auth password"
                required
              />
            </label>
            {error && <p className="chat-inline-error">{error}</p>}
            <button type="submit" className="chat-primary-button" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
            <button type="button" className="chat-secondary-button" onClick={onBack}>
              ← Back to store
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
