import { onAuthReady, getCurrentUser, getIsAdmin, db, storage } from "./app.js";

import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

function qs(sel) { return document.querySelector(sel); }

const els = {
  composerPanel: qs("#composerPanel"),
  loggedOutPanel: qs("#loggedOutPanel"),
  adminPanel: qs("#adminPanel"),

  composerForm: qs("#composerForm"),
  postText: qs("#postText"),
  postMedia: qs("#postMedia"),
  mediaPreview: qs("#mediaPreview"),
  previewImg: qs("#previewImg"),
  clearMediaBtn: qs("#clearMediaBtn"),

  submitPostBtn: qs("#submitPostBtn"),
  submitSpinner: qs("#submitSpinner"),
  composerNotice: qs("#composerNotice"),
  charCount: qs("#charCount"),

  feed: qs("#feed"),
  feedSkeleton: qs("#feedSkeleton"),
  feedEmpty: qs("#feedEmpty"),
  refreshFeedBtn: qs("#refreshFeedBtn"),

  pendingList: qs("#pendingList"),
  pendingSkeleton: qs("#pendingSkeleton"),
  refreshPendingBtn: qs("#refreshPendingBtn"),
};

// If this page isn't index.html, do nothing.
if (!els.feed) {
  // This script is included only on index.html; safe no-op if missing.
} else {
  wireUI();
  onAuthReady(({ user, isAdmin }) => {
    toggleComposer(user);
    toggleAdminPanel(isAdmin);
    // Always refresh the public feed on auth change
    loadApprovedFeed().catch(() => {});
    // Only load pending list for admins
    if (isAdmin) loadPending().catch(() => {});
  });
}

function wireUI() {
  els.postText?.addEventListener("input", () => {
    const len = (els.postText.value || "").length;
    if (els.charCount) els.charCount.textContent = String(len);
  });

  els.postMedia?.addEventListener("change", () => {
    const f = els.postMedia.files?.[0];
    if (!f) return clearPreview();
    if (!f.type.startsWith("image/")) {
      setNotice("Only image/GIF files are allowed.", "warn");
      els.postMedia.value = "";
      clearPreview();
      return;
    }
    const url = URL.createObjectURL(f);
    els.previewImg.src = url;
    els.mediaPreview.hidden = false;
  });

  els.clearMediaBtn?.addEventListener("click", () => {
    els.postMedia.value = "";
    clearPreview();
  });

  els.composerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitPost();
  });

  els.refreshFeedBtn?.addEventListener("click", async () => {
    await loadApprovedFeed(true);
  });

  els.refreshPendingBtn?.addEventListener("click", async () => {
    await loadPending(true);
  });

  // Initial skeleton
  showFeedSkeleton(true);
  showPendingSkeleton(true);
}

function toggleComposer(user) {
  if (!els.composerPanel || !els.loggedOutPanel) return;
  els.composerPanel.hidden = !user;
  els.loggedOutPanel.hidden = !!user;
  if (!user) setNotice("", "clear");
}

function toggleAdminPanel(isAdmin) {
  if (!els.adminPanel) return;
  els.adminPanel.hidden = !isAdmin;
}

function clearPreview() {
  if (!els.mediaPreview) return;
  els.mediaPreview.hidden = true;
  if (els.previewImg) els.previewImg.src = "";
}

function setNotice(msg, mode = "info") {
  if (!els.composerNotice) return;
  if (mode === "clear") {
    els.composerNotice.textContent = "";
    return;
  }
  els.composerNotice.textContent = msg;
}

function showFeedSkeleton(show) {
  if (els.feedSkeleton) els.feedSkeleton.style.display = show ? "block" : "none";
}
function showPendingSkeleton(show) {
  if (els.pendingSkeleton) els.pendingSkeleton.style.display = show ? "block" : "none";
}

function normalizePhotoURL(u) {
  if (typeof u === "string" && u.trim().length > 0) return u.trim();
  return "";
}

function escapeHTML(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Time-ago formatter (approvedAt-based) */
function timeAgo(date) {
  const now = Date.now();
  const then = date.getTime();
  const diff = Math.max(0, now - then);

  const sec = Math.floor(diff / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;

  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;

  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;

  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

function tsToDate(ts) {
  if (!ts) return null;
  if (ts instanceof Timestamp) return ts.toDate();
  if (typeof ts?.toDate === "function") return ts.toDate();
  return null;
}

async function submitPost() {
  const user = getCurrentUser();
  if (!user) {
    setNotice("Please sign in to post.", "warn");
    return;
  }

  const text = (els.postText.value || "").trim();
  if (!text) {
    setNotice("Text is required.", "warn");
    return;
  }

  const file = els.postMedia.files?.[0] || null;

  els.submitPostBtn.disabled = true;
  if (els.submitSpinner) els.submitSpinner.hidden = false;
  setNotice("Submitting…", "info");

  try {
    // Pre-create Firestore doc ID so storage path can include postId
    const postsCol = collection(db, "posts");
    const postRef = doc(postsCol);
    const postId = postRef.id;

    let media = null;

    if (file) {
      // Upload media first (requirement)
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
      const mediaRef = ref(storage, `posts/${postId}/${Date.now()}_${safeName}`);
      const snap = await uploadBytes(mediaRef, file, {
        contentType: file.type || "application/octet-stream",
      });
      const url = await getDownloadURL(snap.ref);

      media = {
        url,
        path: snap.ref.fullPath,
        contentType: file.type || null,
        name: file.name || null,
      };
    }

    const author = {
      uid: user.uid,
      displayName: user.displayName || "User",
      photoURL: normalizePhotoURL(user.photoURL),
      email: user.email || null,
    };

    // Create post document as pending
    await setDoc(postRef, {
      text,
      media,                    // null or object
      author,
      status: "pending",        // pending | approved | rejected
      createdAt: serverTimestamp(),
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
    });

    // UI: pending acknowledgement
    els.postText.value = "";
    if (els.charCount) els.charCount.textContent = "0";
    els.postMedia.value = "";
    clearPreview();

    setNotice("Submitted. Awaiting admin approval.", "ok");
  } catch (err) {
    console.error(err);
    setNotice(`Error submitting post: ${humanError(err)}`, "warn");
  } finally {
    els.submitPostBtn.disabled = false;
    if (els.submitSpinner) els.submitSpinner.hidden = true;
  }
}

function humanError(err) {
  const msg = String(err?.message || err || "");
  if (msg.includes("permission")) return "Missing permissions (check Firebase rules).";
  if (msg.includes("storage")) return "Storage error (check Storage rules/bucket settings).";
  return msg.slice(0, 160);
}

async function loadApprovedFeed(force = false) {
  // Skeleton handling
  showFeedSkeleton(true);
  if (els.feedEmpty) els.feedEmpty.hidden = true;

  try {
    // Public query: only approved, sorted by approvedAt desc
    const q = query(
      collection(db, "posts"),
      where("status", "==", "approved"),
      orderBy("approvedAt", "desc"),
      limit(50)
    );

    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    renderApprovedFeed(docs);
  } catch (err) {
    console.error(err);
    // If this fails (it shouldn't for public reads), show an informative empty state
    renderApprovedFeed([]);
  } finally {
    showFeedSkeleton(false);
  }
}

function renderApprovedFeed(items) {
  if (!els.feed) return;

  els.feed.innerHTML = "";

  if (!items.length) {
    if (els.feedEmpty) els.feedEmpty.hidden = false;
    return;
  }

  if (els.feedEmpty) els.feedEmpty.hidden = true;

  for (const p of items) {
    const name = p.author?.displayName || "User";
    const photo = p.author?.photoURL || "";
    const approvedDate = tsToDate(p.approvedAt) || tsToDate(p.createdAt) || new Date();
    const when = timeAgo(approvedDate);

    const mediaHtml = p.media?.url
      ? `
        <div class="post__media">
          <img src="${p.media.url}" alt="Post media" loading="lazy" />
        </div>
      `
      : "";

    const el = document.createElement("article");
    el.className = "post";
    el.innerHTML = `
      <div class="post__top">
        <div class="post__author">
          <img class="avatar" src="${photo || fallbackAvatar(name)}" alt="Author avatar" />
          <div style="min-width:0">
            <div class="post__name">${escapeHTML(name)}</div>
            <div class="post__meta">Approved • ${escapeHTML(p.author?.uid || "")}</div>
          </div>
        </div>
        <div class="post__time" title="${approvedDate.toISOString()}">${when}</div>
      </div>

      <div class="post__content">
        <p class="post__text">${escapeHTML(p.text)}</p>
        ${mediaHtml}
      </div>
    `;
    els.feed.appendChild(el);
  }
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

/* Admin: pending list */
async function loadPending(force = false) {
  if (!getIsAdmin()) return;

  showPendingSkeleton(true);

  try {
    const q = query(
      collection(db, "posts"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const snap = await getDocs(q);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPending(items);
  } catch (err) {
    console.error(err);
    renderPending([]);
  } finally {
    showPendingSkeleton(false);
  }
}

function renderPending(items) {
  if (!els.pendingList) return;

  // Keep skeleton node if present
  els.pendingList.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = `<h3>No pending posts</h3><p class="muted">All caught up.</p>`;
    els.pendingList.appendChild(empty);
    return;
  }

  for (const p of items) {
    const name = p.author?.displayName || "User";
    const photo = p.author?.photoURL || fallbackAvatar(name);
    const created = tsToDate(p.createdAt) || new Date();

    const row = document.createElement("div");
    row.className = "pending";
    row.innerHTML = `
      <div class="pending__left">
        <div class="pending__title">
          <img class="avatar" src="${photo}" alt="Author avatar" />
          <div style="min-width:0">
            <div class="post__name">${escapeHTML(name)}</div>
            <div class="post__meta">Created • ${escapeHTML(p.author?.uid || "")} • ${escapeHTML(created.toISOString())}</div>
          </div>
        </div>
        <div class="pending__text">${escapeHTML(p.text || "")}</div>
      </div>

      <div class="pending__actions">
        <button class="btn btn--sm btn--ok" data-act="approve" data-id="${p.id}">Approve</button>
        <button class="btn btn--sm btn--danger" data-act="reject" data-id="${p.id}">Reject</button>
      </div>
    `;

    row.querySelectorAll("button[data-act]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        btn.disabled = true;
        try {
          if (act === "approve") await approvePost(id);
          else await rejectPost(id);
          await loadPending(true);
          await loadApprovedFeed(true);
        } catch (err) {
          console.error(err);
        } finally {
          btn.disabled = false;
        }
      });
    });

    els.pendingList.appendChild(row);
  }
}

async function approvePost(postId) {
  // Firestore rules enforce admin-only update
  const user = getCurrentUser();
  if (!user) throw new Error("Not signed in.");

  const postRef = doc(db, "posts", postId);
  await updateDoc(postRef, {
    status: "approved",
    approvedAt: serverTimestamp(),
    approvedBy: user.uid,
    rejectedAt: null,
    rejectedBy: null,
  });
}

async function rejectPost(postId) {
  const user = getCurrentUser();
  if (!user) throw new Error("Not signed in.");

  const postRef = doc(db, "posts", postId);
  await updateDoc(postRef, {
    status: "rejected",
    rejectedAt: serverTimestamp(),
    rejectedBy: user.uid,
  });
}
