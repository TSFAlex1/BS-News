import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const INITIAL_ADMIN_EMAIL = "ar3navr@gmail.com";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();

// Shared state (read-only exports, set via internal setters)
let _currentUser = null;
let _isAdmin = false;

export function getCurrentUser() { return _currentUser; }
export function getIsAdmin() { return _isAdmin; }

function qs(sel) { return document.querySelector(sel); }

function normalizePhotoURL(u) {
  if (typeof u === "string" && u.trim().length > 0) return u.trim();
  return "data:image/svg+xml;utf8," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#3aa0ff" offset="0"/>
          <stop stop-color="#67c1ff" offset="1"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" rx="16" fill="url(#g)" opacity="0.35"/>
      <circle cx="40" cy="34" r="14" fill="#cfeaff" opacity="0.75"/>
      <rect x="18" y="52" width="44" height="18" rx="9" fill="#cfeaff" opacity="0.55"/>
    </svg>
  `);
}

export function setStatusLine(text) {
  const el = qs("#statusLine");
  if (el) el.textContent = text;
}

export function setYear() {
  const y = qs("#year");
  if (y) y.textContent = String(new Date().getFullYear());
}

export function getActivePath() {
  const p = (location.pathname || "").split("/").pop() || "index.html";
  return p.toLowerCase();
}

export async function signInWithGoogle() {
  const res = await signInWithPopup(auth, googleProvider);
  return res.user;
}

export async function logOut() {
  await signOut(auth);
}

/**
 * Admin roles live at: roles/{uid} { admin: true, email, createdAt }
 * - On first login, if the user email matches INITIAL_ADMIN_EMAIL and there's no role doc, create it.
 * - For future admins, you add roles/{uid} docs in Firestore (no code changes).
 */
async function ensureInitialAdminRoleIfNeeded(user) {
  if (!user?.uid || !user?.email) return false;

  const rolesRef = doc(db, "roles", user.uid);
  const snap = await getDoc(rolesRef);

  // Only auto-create role for the initial admin email (first time they sign in)
  if (!snap.exists() && user.email.toLowerCase() === INITIAL_ADMIN_EMAIL.toLowerCase()) {
    await setDoc(rolesRef, {
      admin: true,
      email: user.email,
      createdAt: serverTimestamp(),
      source: "auto-initial-admin",
    });
    return true;
  }
  return false;
}

async function fetchIsAdmin(user) {
  if (!user?.uid) return false;
  const rolesRef = doc(db, "roles", user.uid);
  const snap = await getDoc(rolesRef);
  return !!(snap.exists() && snap.data()?.admin === true);
}

function renderNavbar(user, isAdmin) {
  const nav = qs("#navbar");
  if (!nav) return;

  const active = getActivePath();

  const linkClass = (file) =>
    "navlink" + (active === file ? " navlink--active" : "");

  const displayName = user?.displayName || "User";
  const photoURL = normalizePhotoURL(user?.photoURL);

  nav.innerHTML = `
    <a class="brand" href="./index.html" aria-label="BS News home">
      <span class="brand__mark" aria-hidden="true"></span>
      <span class="brand__name">BS News</span>
    </a>

    <div class="navlinks" role="navigation" aria-label="Primary">
      <a class="${linkClass("index.html")}" href="./index.html">Home</a>
      <a class="${linkClass("extras.html")}" href="./extras.html">Extras</a>
      <a class="${linkClass("accounts.html")}" href="./accounts.html">Account</a>

      ${user ? `
        <div class="navuser" title="${displayName}${isAdmin ? " (Admin)" : ""}">
          <img class="avatar" src="${photoURL}" alt="Profile picture" />
          <span class="navuser__name">${escapeHTML(displayName)}</span>
        </div>
      ` : ``}
    </div>
  `;
}

function escapeHTML(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function onAuthReady(cb) {
  // Single place where pages can react to auth/admin state changes
  return onAuthStateChanged(auth, async (user) => {
    _currentUser = user;

    if (user) {
      // Attempt initial admin role bootstrap, then re-check admin state
      try { await ensureInitialAdminRoleIfNeeded(user); } catch (_) {}
      try { _isAdmin = await fetchIsAdmin(user); } catch (_) { _isAdmin = false; }
      setStatusLine(_isAdmin ? `Signed in as ${user.displayName || "User"} (Admin)` : `Signed in as ${user.displayName || "User"}`);
    } else {
      _isAdmin = false;
      setStatusLine("Signed out");
    }

    renderNavbar(_currentUser, _isAdmin);
    cb?.({ user: _currentUser, isAdmin: _isAdmin });
  });
}

// Initialize shared UI bits
setYear();

// Default behavior: keep navbar updated even if a page doesn't register a callback
onAuthReady(() => {});
