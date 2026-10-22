import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { signInDev, signInWithGoogle, signOut, useStore } from "../store";
import { IconExpand, IconLogout, IconShrink, IconUser } from "./Icons";

declare global {
  interface Window {
    google?: any;
  }
}

let gsiPromise: Promise<void> | null = null;
function loadGsi() {
  gsiPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return gsiPromise;
}

let gsiInitFor: string | null = null;
async function initGsi(clientId: string) {
  await loadGsi();
  if (gsiInitFor === clientId) return;
  gsiInitFor = clientId;
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (r: { credential: string }) => signInWithGoogle(r.credential),
    auto_select: true,
    use_fedcm_for_prompt: true,
    itp_support: true,
  });
}

function useFullscreen() {
  const [fs, setFs] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const supported = !!document.documentElement.requestFullscreen;
  const toggle = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen({ navigationUI: "hide" })).catch(() => {});
  return { fs, toggle, supported };
}

export function Account() {
  const auth = useStore((s) => s.auth);
  const user = useStore((s) => s.user);
  const clientId = useStore((s) => s.googleClientId);
  const devAuth = useStore((s) => s.devAuth);
  const [open, setOpen] = useState(false);
  const btnHost = useRef<HTMLDivElement>(null);
  const { fs, toggle, supported } = useFullscreen();

  // Offer One Tap once when signed out.
  useEffect(() => {
    if (auth !== "out" || !clientId) return;
    initGsi(clientId).then(() => window.google.accounts.id.prompt()).catch(() => {});
  }, [auth, clientId]);

  useEffect(() => {
    if (!open || auth !== "out" || !clientId) return;
    initGsi(clientId).then(() => {
      if (!btnHost.current) return;
      window.google.accounts.id.renderButton(btnHost.current, { theme: "outline", size: "large", shape: "pill", text: "signin_with", locale: "ja", width: 232 });
    });
  }, [open, auth, clientId]);

  useEffect(() => {
    if (auth === "in") setOpen(false);
  }, [auth]);

  return (
    <>
      <motion.button className="avatar glass" aria-label="アカウント" data-testid="account-btn" whileTap={{ scale: 0.88 }} onClick={() => setOpen((v) => !v)}>
        <AnimatePresence mode="wait" initial={false}>
          {auth === "loading" ? (
            <motion.span key="l" className="spinner" style={{ color: "var(--ink-3)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          ) : user?.picture ? (
            <motion.img key="p" src={user.picture} alt="" referrerPolicy="no-referrer" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} />
          ) : user ? (
            <motion.b key="i" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} style={{ fontSize: 16, color: "var(--accent)" }}>
              {(user.name ?? user.email)[0]?.toUpperCase()}
            </motion.b>
          ) : (
            <motion.span key="o" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} style={{ display: "grid", color: "var(--ink-2)" }}>
              <IconUser style={{ width: 20, height: 20 }} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div className="scrim" style={{ background: "transparent", zIndex: 59 }} onClick={() => setOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div
              className="menu glass strong"
              data-testid="account-menu"
              initial={{ opacity: 0, scale: 0.6, y: -10, filter: "blur(8px)" }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.7, y: -8, filter: "blur(6px)" }}
              transition={{ type: "spring", stiffness: 520, damping: 34 }}
            >
              {user ? (
                <div className="who">
                  {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : null}
                  <div>
                    <b>{user.name ?? user.email}</b>
                    <span>{user.email}</span>
                  </div>
                </div>
              ) : (
                <div style={{ paddingBottom: 8 }}>
                  {clientId ? <div className="gsi-wrap" ref={btnHost} data-testid="google-btn" /> : null}
                  {devAuth && (
                    <button className="row" data-testid="dev-login" onClick={() => signInDev()} style={{ justifyContent: "center", background: "rgba(255,255,255,.6)" }}>
                      開発用ログイン
                    </button>
                  )}
                </div>
              )}
              {supported && (
                <button className="row" onClick={toggle}>
                  {fs ? <IconShrink /> : <IconExpand />}
                  {fs ? "全画面を終了" : "全画面"}
                </button>
              )}
              {user && (
                <button className="row" data-testid="logout" onClick={() => (setOpen(false), signOut())}>
                  <IconLogout />
                  ログアウト
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
