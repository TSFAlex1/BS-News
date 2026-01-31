import { onAuthReady, signInWithGoogle, logOut, getIsAdmin, getCurrentUser } from "./app.js";

function qs(sel) { return document.querySelector(sel); }

const els = {
  authPanel: qs("#authPanel"),
  profilePanel: qs("#profilePanel"),

  googleSignInBtn: qs("#googleSignInBtn"),
  authNotice: qs("#authNotice"),

  profilePhoto: qs("#profilePhoto"),
  profileName: qs("#profileName"),
  profileEmail: qs("#profileEmail"),
  profileUid: qs("#profileUid"),
  profileDisplayName: qs("#profileDisplayName"),
  profilePhotoUrl: qs("#profilePhotoUrl"),

  logoutBtn: qs("#logoutBtn"),
  adminIndicator: qs("#adminIndicator"),
};

if (els.googleSignInBtn) {
  els.googleSignInBtn.addEventListener("click", async () => {
    setAuthNotice("Opening Google sign-in…");
    try {
      await signInWithGoogle();
      setAuthNotice("");
    } catch (err) {
      console.error(err);
      setAuthNotice(`Sign-in failed: ${humanError(err)}`);
    }
  });
}

if (els.logoutBtn) {
  els.logoutBtn.addEventListener("click", async () => {
    try { await logOut(); } catch (_) {}
  });
}

onAuthReady(({ user, isAdmin }) => {
  render(user, isAdmin);
});

function render(user, isAdmin) {
  if (!els.authPanel || !els.profilePanel) return;

  if (!user) {
    els.authPanel.hidden = false;
    els.profilePanel.hidden = true;
    if (els.adminIndicator) els.adminIndicator.hidden = true;
    return;
  }

  els.authPanel.hidden = true;
  els.profilePanel.hidden = false;

  const name = user.displayName || "User";
  const photo = user.photoURL || fallbackAvatar(name);

  if (els.profilePhoto) els.profilePhoto.src = photo;
  if (els.profileName) els.profileName.textContent = name;
  if (els.profileEmail) els.profileEmail.textContent = user.email || "—";
  if (els.profileUid) els.profileUid.textContent = user.uid;
  if (els.profileDisplayName) els.profileDisplayName.textContent = name;
  if (els.profilePhotoUrl) els.profilePhotoUrl.textContent = user.photoURL || "—";

  // Admin indicator must not appear for non-admin users
  if (els.adminIndicator) els.adminIndicator.hidden = !isAdmin;
}

function setAuthNotice(msg) {
  if (!els.authNotice) return;
  els.authNotice.textContent = msg || "";
}

function humanError(err) {
  const msg = String(err?.message || err || "");
  if (msg.includes("popup-closed-by-user")) return "Popup closed.";
  if (msg.includes("cancelled-popup-request")) return "Popup request cancelled.";
  if (msg.includes("permission")) return "Missing permissions (check Firebase rules).";
  return msg.slice(0, 160);
}

function fallbackAvatar(seed) {
  const initials = String(seed || "U").trim().slice(0, 1).toUpperCase();
  return "data:image/svg+xml;utf8," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#3aa0ff" offset="0"/>
          <stop stop-color="#67c1ff" offset="1"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" rx="40" fill="url(#g)" opacity="0.35"/>
      <text x="50%" y="54%" text-anchor="middle" font-family="system-ui" font-size="32" fill="#dff2ff" opacity="0.9">${initials}</text>
    </svg>
  `);
}
