"use strict";

const socket = io();

const state = {
  user: null,
  currentView: "home",
  members: [],
  groups: [],
  watchRooms: [],
  reviews: [],
  tickets: [],
  applications: [],
  adminTab: "groups"
};


// =========================
// HELPERS
// =========================

const $ = (selector) => document.querySelector(selector);

const $$ = (selector) => Array.from(
  document.querySelectorAll(selector)
);

async function api(url, options = {}) {
  const config = {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  };

  if (
    config.body &&
    typeof config.body !== "string"
  ) {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.error || "حدث خطأ غير متوقع"
    );
  }

  return data;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(date) {
  if (!date) return "—";

  try {
    return new Date(date).toLocaleString(
      "ar-SA",
      {
        dateStyle: "medium",
        timeStyle: "short"
      }
    );
  } catch {
    return date;
  }
}

function stars(rating) {
  const value = Number(rating) || 0;

  return "★".repeat(value) +
    "☆".repeat(5 - value);
}

function showToast(message, type = "success") {
  const toast = $("#toast");

  if (!toast) return;

  toast.textContent = message;

  toast.className =
    `toast ${type}`;

  clearTimeout(
    showToast.timer
  );

  showToast.timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3500);
}

function requireLogin() {
  if (state.user) return true;

  showToast(
    "يجب تسجيل الدخول أولاً",
    "error"
  );

  navigate("login");

  return false;
}

function isAdmin() {
  return Boolean(
    state.user &&
    (
      state.user.role === "owner" ||
      state.user.role === "admin"
    )
  );
}


// =========================
// NAVIGATION
// =========================

function navigate(view) {
  state.currentView = view;

  $$(".page-view").forEach(section => {
    section.classList.add("hidden");
  });

  const target = $(`#${view}-view`);

  if (target) {
    target.classList.remove("hidden");
  }

  $$(".desktop-nav button, .mobile-menu button")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.view === view
      );
    });

  const mobileMenu = $("#mobile-menu");

  if (mobileMenu) {
    mobileMenu.classList.remove("open");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  loadView(view);
}

async function loadView(view) {
  try {
    switch (view) {
      case "home":
        await loadHome();
        break;

      case "members":
        await loadMembers();
        break;

      case "groups":
        await loadGroups();
        break;

      case "watch":
        await loadWatchRooms();
        break;

      case "reviews":
        await loadReviews();
        break;

      case "tickets":
        await loadTickets();
        break;

      case "applications":
        await loadApplications();
        break;

      case "account":
        renderAccount();
        break;

      case "admin":
        await loadAdmin();
        break;
    }
  } catch (error) {
    console.error(error);

    showToast(
      error.message,
      "error"
    );
  }
}


// =========================
// HOME
// =========================

async function loadHome() {
  try {
    const data = await api(
      "/api/public/server"
    );

    if (data.name) {
      $("#server-name").textContent =
        data.name;
    }

    if (
      typeof data.memberCount !==
      "undefined"
    ) {
      $("#server-count").textContent =
        data.memberCount;
    }

  } catch (error) {
    console.error(
      "Home loading error:",
      error
    );
  }
}


// =========================
// AUTH
// =========================

async function checkAuth() {
  try {
    const data = await api(
      "/api/auth/me"
    );

    state.user =
      data.user || null;

  } catch {
    state.user = null;
  }

  updateAuthUI();
}

function updateAuthUI() {
  const loginNav =
    $("#login-nav");

  const accountNav =
    $("#account-nav");

  const mobileLogin =
    $("#mobile-login");

  const mobileAccount =
    $("#mobile-account");

  if (state.user) {

    loginNav?.classList.add(
      "hidden"
    );

    accountNav?.classList.remove(
      "hidden"
    );

    mobileLogin?.classList.add(
      "hidden"
    );

    mobileAccount?.classList.remove(
      "hidden"
    );

  } else {

    loginNav?.classList.remove(
      "hidden"
    );

    accountNav?.classList.add(
      "hidden"
    );

    mobileLogin?.classList.remove(
      "hidden"
    );

    mobileAccount?.classList.add(
      "hidden"
    );
  }
}

async function login(username, password) {
  const data = await api(
    "/api/auth/login",
    {
      method: "POST",
      body: {
        username,
        password
      }
    }
  );

  state.user =
    data.user;

  updateAuthUI();

  showToast(
    "تم تسجيل الدخول بنجاح"
  );

  navigate("account");
}

async function register(
  username,
  password,
  confirmPassword
) {
  if (
    password !==
    confirmPassword
  ) {
    throw new Error(
      "كلمتا المرور غير متطابقتين"
    );
  }

  const data = await api(
    "/api/auth/register",
    {
      method: "POST",
      body: {
        username,
        password
      }
    }
  );

  state.user =
    data.user;

  updateAuthUI();

  showToast(
    "تم إنشاء الحساب بنجاح"
  );

  navigate("account");
}

async function logout() {
  try {
    await api(
      "/api/auth/logout",
      {
        method: "POST"
      }
    );
  } finally {
    state.user = null;

    updateAuthUI();

    showToast(
      "تم تسجيل الخروج"
    );

    navigate("home");
  }
}


// =========================
// MEMBERS
// =========================

async function loadMembers() {
  const status =
    $("#members-status");

  const content =
    $("#members-content");

  if (!status || !content) {
    return;
  }

  status.textContent =
    "جاري التحميل...";

  try {
    const data = await api(
      "/api/public/members"
    );

    state.members =
      data.members || [];

    renderMembers(
      state.members
    );

    status.textContent =
      `${state.members.length} عضو`;

  } catch (error) {

    status.textContent =
      error.message;

    content.innerHTML = "";
  }
}

function renderMembers(members) {
  const content =
    $("#members-content");

  if (!content) return;

  if (!members.length) {
    content.innerHTML = `
      <div class="empty-state">
        لا يوجد أعضاء.
      </div>
    `;

    return;
  }

  content.innerHTML =
    members.map(member => {

      const avatar =
        member.avatar ||
        member.user?.displayAvatarURL ||
        "/logo.svg";

      const name =
        member.displayName ||
        member.username ||
        member.user?.username ||
        "عضو";

      const username =
        member.username ||
        member.user?.username ||
        "";

      return `
        <article class="member-card">

          <img
            class="avatar"
            src="${escapeHTML(avatar)}"
            onerror="this.src='/logo.svg'"
            alt=""
          >

          <div class="member-info">

            <strong>
              ${escapeHTML(name)}
            </strong>

            <small>
              @${escapeHTML(username)}
            </small>

            ${
              member.roles?.length
                ? `
                  <div class="tags">
                    ${member.roles
                      .slice(0, 5)
                      .map(role => `
                        <span class="tag">
                          ${escapeHTML(
                            role.name ||
                            role
                          )}
                        </span>
                      `)
                      .join("")}
                  </div>
                `
                : ""
            }

          </div>

        </article>
      `;
    }).join("");
}


// =========================
// GROUPS
// =========================

async function loadGroups() {
  const status =
    $("#groups-status");

  const content =
    $("#groups-content");

  if (!status || !content) {
    return;
  }

  status.textContent =
    "جاري تحميل المجموعات...";

  try {
    const data = await api(
      "/api/groups"
    );

    state.groups =
      data.groups || [];

    renderGroups(
      state.groups
    );

    status.textContent =
      `${state.groups.length} مجموعة`;

  } catch (error) {

    status.textContent =
      error.message;
  }
}

function renderGroups(groups) {
  const content =
    $("#groups-content");

  if (!content) return;

  if (!groups.length) {
    content.innerHTML = `
      <div class="empty-state">
        لا توجد مجموعات حالياً.
      </div>
    `;

    return;
  }

  content.innerHTML =
    groups.map(group => `
      <article
        class="group-card"
        data-group-id="${escapeHTML(group.id)}"
      >

        <div class="card-top">

          <div class="card-icon">
            👥
          </div>

          <span class="status-badge">
            ${escapeHTML(
              group.status || "approved"
            )}
          </span>

        </div>

        <h3>
          ${escapeHTML(group.name)}
        </h3>

        <p>
          ${escapeHTML(
            group.description ||
            "لا يوجد وصف."
          )}
        </p>

        <div class="card-meta">
          <span>
            المالك:
            ${escapeHTML(
              group.ownerUsername ||
              "—"
            )}
          </span>

          <span>
            الأعضاء:
            ${group.memberCount || 0}
          </span>
        </div>

        <button
          class="secondary full"
          data-group-open="${escapeHTML(group.id)}"
        >
          عرض المجموعة
        </button>

      </article>
    `).join("");
}

async function createGroup() {
  if (!requireLogin()) {
    return;
  }

  const name =
    prompt("اسم المجموعة:");

  if (!name) return;

  const description =
    prompt("وصف المجموعة:");

  try {

    await api(
      "/api/groups",
      {
        method: "POST",
        body: {
          name,
          description:
            description || ""
        }
      }
    );

    showToast(
      "تم إرسال المجموعة للمراجعة"
    );

    await loadGroups();

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}

async function openGroup(id) {
  try {

    const data = await api(
      `/api/groups/${encodeURIComponent(id)}`
    );

    const group =
      data.group;

    openModal(`
      <div class="modal-head">

        <p class="eyebrow">
          COMMUNITY GROUP
        </p>

        <h2>
          ${escapeHTML(group.name)}
        </h2>

      </div>

      <p class="modal-description">
        ${escapeHTML(
          group.description ||
          "لا يوجد وصف."
        )}
      </p>

      <div class="details-list">

        <div>
          <span>المالك</span>
          <strong>
            ${escapeHTML(
              group.ownerUsername ||
              "—"
            )}
          </strong>
        </div>

        <div>
          <span>الأعضاء</span>
          <strong>
            ${group.memberCount || 0}
          </strong>
        </div>

        <div>
          <span>الحالة</span>
          <strong>
            ${escapeHTML(
              group.status ||
              "approved"
            )}
          </strong>
        </div>

      </div>

      ${
        state.user
          ? `
            <button
              class="primary full"
              data-group-join="${escapeHTML(group.id)}"
            >
              طلب الانضمام
            </button>
          `
          : `
            <button
              class="primary full"
              data-view="login"
            >
              سجل الدخول للانضمام
            </button>
          `
      }

    `);

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}

async function joinGroup(id) {
  if (!requireLogin()) {
    return;
  }

  try {

    await api(
      `/api/groups/${encodeURIComponent(id)}/join`,
      {
        method: "POST"
      }
    );

    closeModal();

    showToast(
      "تم إرسال طلب الانضمام"
    );

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}


// =========================
// WATCH ROOMS
// =========================

async function loadWatchRooms() {
  const status =
    $("#watch-status");

  const content =
    $("#watch-content");

  if (!status || !content) {
    return;
  }

  try {

    const data = await api(
      "/api/watch-rooms"
    );

    state.watchRooms =
      data.rooms || [];

    renderWatchRooms(
      state.watchRooms
    );

    status.textContent =
      `${state.watchRooms.length} غرفة`;

  } catch (error) {

    status.textContent =
      error.message;
  }
}

function renderWatchRooms(rooms) {
  const content =
    $("#watch-content");

  if (!content) return;

  if (!rooms.length) {

    content.innerHTML = `
      <div class="empty-state">
        لا توجد غرف مشاهدة حالياً.
      </div>
    `;

    return;
  }

  content.innerHTML =
    rooms.map(room => `
      <article class="watch-card">

        <div class="card-icon">
          🎬
        </div>

        <h3>
          ${escapeHTML(room.title)}
        </h3>

        <p>
          ${escapeHTML(
            room.description ||
            "غرفة مشاهدة"
          )}
        </p>

        <div class="card-meta">

          <span>
            المضيف:
            ${escapeHTML(
              room.ownerUsername
            )}
          </span>

          <span>
            المشاركون:
            ${room.members?.length || 0}
          </span>

        </div>

        <button
          class="primary full"
          data-watch-open="${escapeHTML(room.id)}"
        >
          دخول الغرفة
        </button>

      </article>
    `).join("");
}

async function createWatchRoom() {
  if (!requireLogin()) {
    return;
  }

  const title =
    prompt("اسم غرفة المشاهدة:");

  if (!title) return;

  const mediaUrl =
    prompt(
      "رابط المحتوى المصرح لك بعرضه:"
    );

  if (!mediaUrl) return;

  const description =
    prompt("وصف الغرفة:");

  try {

    const data = await api(
      "/api/watch-rooms",
      {
        method: "POST",
        body: {
          title,
          mediaUrl,
          mediaType: "video",
          description:
            description || ""
        }
      }
    );

    showToast(
      "تم إنشاء غرفة المشاهدة"
    );

    await loadWatchRooms();

    openWatchRoom(
      data.room.id
    );

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}

async function openWatchRoom(id) {
  if (!requireLogin()) {
    return;
  }

  try {

    const data = await api(
      `/api/watch-rooms/${encodeURIComponent(id)}`
    );

    const room =
      data.room;

    await api(
      `/api/watch-rooms/${encodeURIComponent(id)}/join`,
      {
        method: "POST"
      }
    );

    openModal(`
      <div class="modal-head">

        <p class="eyebrow">
          WATCH ROOM
        </p>

        <h2>
          ${escapeHTML(room.title)}
        </h2>

      </div>

      <div class="watch-player">

        <video
          id="watch-video"
          controls
          playsinline
          src="${escapeHTML(room.mediaUrl)}"
        ></video>

      </div>

      <div class="watch-chat">

        <div
          id="watch-chat-messages"
          class="chat-messages"
        ></div>

        <div class="chat-input">

          <input
            id="watch-chat-input"
            placeholder="اكتب رسالة..."
          >

          <button
            class="primary"
            id="watch-chat-send"
          >
            إرسال
          </button>

        </div>

      </div>
    `);

    socket.emit(
      "watch:join",
      {
        roomId: room.id
      }
    );

    setupWatchRoom(
      room
    );

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}

function setupWatchRoom(room) {
  const video =
    $("#watch-video");

  if (!video) return;

  video.currentTime =
    Number(room.currentTime || 0);

  const chatInput =
    $("#watch-chat-input");

  const chatSend =
    $("#watch-chat-send");

  function sendChat() {

    const message =
      chatInput?.value.trim();

    if (!message) return;

    socket.emit(
      "watch:chat",
      {
        roomId: room.id,
        username:
          state.user?.username ||
          "زائر",
        message
      }
    );

    chatInput.value = "";
  }

  chatSend?.addEventListener(
    "click",
    sendChat
  );

  chatInput?.addEventListener(
    "keydown",
    event => {

      if (event.key === "Enter") {
        sendChat();
      }

    }
  );

  video.addEventListener(
    "play",
    () => {

      if (
        room.ownerId !==
        state.user?.id
      ) {
        return;
      }

      socket.emit(
        "watch:state",
        {
          roomId: room.id,
          playing: true,
          currentTime:
            video.currentTime
        }
      );

    }
  );

  video.addEventListener(
    "pause",
    () => {

      if (
        room.ownerId !==
        state.user?.id
      ) {
        return;
      }

      socket.emit(
        "watch:state",
        {
          roomId: room.id,
          playing: false,
          currentTime:
            video.currentTime
        }
      );

    }
  );
}

socket.on(
  "watch:state",
  stateData => {

    const video =
      $("#watch-video");

    if (!video) return;

    if (
      Number.isFinite(
        Number(stateData.currentTime)
      )
    ) {
      video.currentTime =
        Number(stateData.currentTime);
    }

    if (stateData.playing) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }
);

socket.on(
  "watch:chat",
  message => {

    const container =
      $("#watch-chat-messages");

    if (!container) return;

    const item =
      document.createElement("div");

    item.className =
      "chat-message";

    item.innerHTML = `
      <strong>
        ${escapeHTML(message.username)}
      </strong>

      <span>
        ${escapeHTML(message.message)}
      </span>
    `;

    container.appendChild(item);

    container.scrollTop =
      container.scrollHeight;
  }
);


// =========================
// REVIEWS
// =========================

async function loadReviews() {
  const status =
    $("#reviews-status");

  const content =
    $("#reviews-content");

  if (!status || !content) {
    return;
  }

  try {

    const data = await api(
      "/api/reviews"
    );

    state.reviews =
      data.reviews || [];

    renderReviews(
      state.reviews
    );

    status.textContent =
      `${state.reviews.length} تقييم`;

  } catch (error) {

    status.textContent =
      error.message;
  }
}

function renderReviews(reviews) {
  const content =
    $("#reviews-content");

  if (!content) return;

  if (!reviews.length) {

    content.innerHTML = `
      <div class="empty-state">
        لا توجد تقييمات منشورة حتى الآن.
      </div>
    `;

    return;
  }

  content.innerHTML =
    reviews.map(review => `
      <article class="review-card">

        <div class="review-top">

          <strong>
            ${escapeHTML(
              review.targetName
            )}
          </strong>

          <span class="stars">
            ${stars(review.rating)}
          </span>

        </div>

        <p>
          ${escapeHTML(
            review.comment
          )}
        </p>

        <div class="card-meta">

          <span>
            بواسطة:
            ${escapeHTML(
              review.username
            )}
          </span>

          <span>
            ${formatDate(
              review.createdAt
            )}
          </span>

        </div>

      </article>
    `).join("");
}

async function createReview() {
  if (!requireLogin()) {
    return;
  }

  const targetType =
    prompt(
      "نوع العنصر: site / game / service"
    );

  if (!targetType) return;

  const targetId =
    prompt("معرف العنصر:");

  if (!targetId) return;

  const targetName =
    prompt("اسم العنصر:");

  const rating =
    Number(
      prompt("التقييم من 1 إلى 5:")
    );

  const comment =
    prompt("اكتب تعليقك:");

  if (!comment) return;

  try {

    await api(
      "/api/reviews",
      {
        method: "POST",
        body: {
          targetType,
          targetId,
          targetName:
            targetName || targetId,
          rating,
          comment
        }
      }
    );

    showToast(
      "تم إرسال التقييم للمراجعة"
    );

    await loadReviews();

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}


// =========================
// TICKETS
// =========================

async function loadTickets() {
  const status =
    $("#tickets-status");

  const content =
    $("#tickets-content");

  if (!status || !content) {
    return;
  }

  if (!state.user) {

    status.textContent =
      "يجب تسجيل الدخول أولاً.";

    content.innerHTML = "";

    return;
  }

  try {

    const data = await api(
      "/api/tickets"
    );

    state.tickets =
      data.tickets || [];

    renderTickets(
      state.tickets
    );

    status.textContent =
      `${state.tickets.length} تذكرة`;

  } catch (error) {

    status.textContent =
      error.message;
  }
}

function renderTickets(tickets) {
  const content =
    $("#tickets-content");

  if (!content) return;

  if (!tickets.length) {

    content.innerHTML = `
      <div class="empty-state">
        لا توجد تذاكر.
      </div>
    `;

    return;
  }

  content.innerHTML =
    tickets.map(ticket => `
      <article class="ticket-card">

        <div class="card-top">

          <div class="card-icon">
            🎫
          </div>

          <span class="status-badge">
            ${escapeHTML(
              ticket.status
            )}
          </span>

        </div>

        <h3>
          ${escapeHTML(
            ticket.subject
          )}
        </h3>

        <p>
          النوع:
          ${escapeHTML(
            ticket.type
          )}
        </p>

        <div class="card-meta">

          <span>
            الأولوية:
            ${escapeHTML(
              ticket.priority
            )}
          </span>

          <span>
            ${formatDate(
              ticket.updatedAt
            )}
          </span>

        </div>

        <button
          class="secondary full"
          data-ticket-open="${escapeHTML(ticket.id)}"
        >
          فتح التذكرة
        </button>

      </article>
    `).join("");
}

async function createTicket() {
  if (!requireLogin()) {
    return;
  }

  const subject =
    prompt("عنوان التذكرة:");

  if (!subject) return;

  const type =
    prompt(
      "نوع التذكرة:",
      "عام"
    );

  const priority =
    prompt(
      "الأولوية: low / normal / high",
      "normal"
    );

  const message =
    prompt("اكتب تفاصيل التذكرة:");

  if (!message) return;

  try {

    await api(
      "/api/tickets",
      {
        method: "POST",
        body: {
          subject,
          type:
            type || "عام",
          priority:
            priority || "normal",
          message
        }
      }
    );

    showToast(
      "تم إنشاء التذكرة"
    );

    await loadTickets();

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}

async function openTicket(id) {
  if (!requireLogin()) {
    return;
  }

  try {

    const data = await api(
      `/api/tickets/${encodeURIComponent(id)}`
    );

    const ticket =
      data.ticket;

    const messages =
      data.messages || [];

    openModal(`
      <div class="modal-head">

        <p class="eyebrow">
          TICKET
        </p>

        <h2>
          ${escapeHTML(ticket.subject)}
        </h2>

      </div>

      <div class="ticket-details">

        <span>
          الحالة:
          ${escapeHTML(ticket.status)}
        </span>

        <span>
          النوع:
          ${escapeHTML(ticket.type)}
        </span>

      </div>

      <div class="ticket-messages">

        ${
          messages.length
            ? messages.map(message => `
                <div class="ticket-message">

                  <strong>
                    ${escapeHTML(
                      message.username
                    )}
                  </strong>

                  <p>
                    ${escapeHTML(
                      message.message
                    )}
                  </p>

                  <small>
                    ${formatDate(
                      message.createdAt
                    )}
                  </small>

                </div>
              `).join("")
            : `
              <div class="empty-state">
                لا توجد رسائل.
              </div>
            `
        }

      </div>

      ${
        ticket.status !== "closed"
          ? `
            <form
              id="ticket-reply-form"
              class="inline-form"
            >

              <input
                name="message"
                placeholder="اكتب ردك..."
                required
              >

              <button
                class="primary"
                type="submit"
              >
                إرسال
              </button>

            </form>
          `
          : ""
      }

    `);

    $("#ticket-reply-form")
      ?.addEventListener(
        "submit",
        async event => {

          event.preventDefault();

          const form =
            event.currentTarget;

          const message =
            form.message.value.trim();

          if (!message) return;

          try {

            await api(
              `/api/tickets/${encodeURIComponent(id)}/messages`,
              {
                method: "POST",
                body: {
                  message
                }
              }
            );

            await openTicket(id);

          } catch (error) {

            showToast(
              error.message,
              "error"
            );
          }
        }
      );

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}


// =========================
// APPLICATIONS
// =========================

async function loadApplications() {
  const status =
    $("#applications-status");

  const content =
    $("#applications-content");

  if (!status || !content) {
    return;
  }

  if (!state.user) {

    status.textContent =
      "يجب تسجيل الدخول أولاً.";

    content.innerHTML = "";

    return;
  }

  try {

    const data = await api(
      "/api/applications"
    );

    state.applications =
      data.applications || [];

    renderApplications(
      state.applications
    );

    status.textContent =
      `${state.applications.length} طلب`;

  } catch (error) {

    status.textContent =
      error.message;
  }
}

function renderApplications(applications) {
  const content =
    $("#applications-content");

  if (!content) return;

  if (!applications.length) {

    content.innerHTML = `
      <div class="empty-state">
        لا توجد تقديمات.
      </div>
    `;

    return;
  }

  content.innerHTML =
    applications.map(application => `
      <article class="application-card">

        <div class="card-top">

          <div class="card-icon">
            📋
          </div>

          <span class="status-badge">
            ${escapeHTML(
              application.status
            )}
          </span>

        </div>

        <h3>
          ${escapeHTML(
            application.type
          )}
        </h3>

        <p>
          ${escapeHTML(
            application.note ||
            "بدون ملاحظات"
          )}
        </p>

        <div class="card-meta">

          <span>
            ${formatDate(
              application.createdAt
            )}
          </span>

          ${
            application.reviewer
              ? `
                <span>
                  المراجع:
                  ${escapeHTML(
                    application.reviewer
                  )}
                </span>
              `
              : ""
          }

        </div>

      </article>
    `).join("");
}

async function createApplication() {
  if (!requireLogin()) {
    return;
  }

  const type =
    prompt(
      "نوع التقديم:",
      "Staff"
    );

  if (!type) return;

  const note =
    prompt(
      "اكتب معلومات التقديم:"
    );

  if (!note) return;

  try {

    await api(
      "/api/applications",
      {
        method: "POST",
        body: {
          type,
          note,
          answers: {
            details: note
          }
        }
      }
    );

    showToast(
      "تم إرسال التقديم"
    );

    await loadApplications();

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}


// =========================
// ACCOUNT
// =========================

function renderAccount() {
  const content =
    $("#account-content");

  if (!content) return;

  if (!state.user) {

    content.innerHTML = `
      <div class="empty-state">

        <p>
          يجب تسجيل الدخول أولاً.
        </p>

        <button
          class="primary"
          data-view="login"
        >
          تسجيل الدخول
        </button>

      </div>
    `;

    return;
  }

  content.innerHTML = `

    <div class="account-card">

      <div class="account-avatar">
        ${escapeHTML(
          (
            state.user.username ||
            "U"
          ).charAt(0)
        ).toUpperCase()}
      </div>

      <div>

        <small>
          اسم المستخدم
        </small>

        <h3>
          ${escapeHTML(
            state.user.username
          )}
        </h3>

      </div>

    </div>


    <div class="account-card">

      <small>
        نوع الحساب
      </small>

      <strong>
        ${escapeHTML(
          state.user.role ||
          "user"
        )}
      </strong>

    </div>


    <div class="account-card">

      <small>
        Discord
      </small>

      ${
        state.user.discordId
          ? `
            <strong>
              مرتبط
            </strong>

            <small>
              ${escapeHTML(
                state.user.discordId
              )}
            </small>
          `
          : `
            <strong>
              غير مرتبط
            </strong>

            <button
              class="secondary"
              data-action="link-discord"
            >
              ربط Discord
            </button>
          `
      }

    </div>


    ${
      isAdmin()
        ? `
          <div class="account-card admin-card">

            <small>
              الإدارة
            </small>

            <strong>
              لديك صلاحيات إدارية
            </strong>

            <button
              class="primary"
              data-view="admin"
            >
              فتح لوحة الإدارة
            </button>

          </div>
        `
        : ""
    }

  `;
}


// =========================
// LINK DISCORD
// =========================

async function linkDiscord() {
  if (!requireLogin()) {
    return;
  }

  const discordId =
    prompt(
      "أدخل Discord User ID الخاص بك:"
    );

  if (!discordId) return;

  try {

    const data = await api(
      "/api/profile/discord",
      {
        method: "POST",
        body: {
          discordId
        }
      }
    );

    state.user =
      data.user;

    updateAuthUI();

    renderAccount();

    showToast(
      "تم ربط حساب Discord"
    );

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}


// =========================
// ADMIN
// =========================

async function loadAdmin() {
  if (!isAdmin()) {

    showToast(
      "غير مصرح لك بالدخول",
      "error"
    );

    navigate("home");

    return;
  }

  await loadAdminStats();

  await loadAdminTab(
    state.adminTab
  );
}

async function loadAdminStats() {
  const container =
    $("#admin-stats");

  if (!container) return;

  try {

    const data = await api(
      "/api/admin/stats"
    );

    const stats = [
      [
        "المستخدمون",
        data.users
      ],
      [
        "المجموعات",
        data.groups
      ],
      [
        "المجموعات المعلقة",
        data.pendingGroups
      ],
      [
        "طلبات الانضمام",
        data.joinRequests
      ],
      [
        "التذاكر",
        data.tickets
      ],
      [
        "التقديمات",
        data.applications
      ],
      [
        "التقييمات",
        data.reviews
      ],
      [
        "غرف المشاهدة",
        data.watchRooms
      ]
    ];

    container.innerHTML =
      stats.map(item => `
        <div class="stat-card">

          <small>
            ${escapeHTML(item[0])}
          </small>

          <strong>
            ${item[1] ?? 0}
          </strong>

        </div>
      `).join("");

  } catch (error) {

    container.innerHTML = `
      <div class="empty-state">
        ${escapeHTML(error.message)}
      </div>
    `;
  }
}

async function loadAdminTab(tab) {
  state.adminTab =
    tab;

  const content =
    $("#admin-content");

  if (!content) return;

  content.innerHTML =
    `<div class="status">
      جاري التحميل...
    </div>`;

  try {

    switch (tab) {

      case "groups":
        await renderAdminGroups();
        break;

      case "applications":
        await renderAdminApplications();
        break;

      case "tickets":
        await renderAdminTickets();
        break;

      case "reviews":
        await renderAdminReviews();
        break;

      case "users":
        await renderAdminUsers();
        break;

      case "logs":
        await renderAdminLogs();
        break;
    }

  } catch (error) {

    content.innerHTML = `
      <div class="empty-state">
        ${escapeHTML(error.message)}
      </div>
    `;
  }
}

async function renderAdminGroups() {
  const data = await api(
    "/api/admin/groups/pending"
  );

  const groups =
    data.groups || [];

  const content =
    $("#admin-content");

  if (!groups.length) {

    content.innerHTML = `
      <div class="empty-state">
        لا توجد مجموعات معلقة.
      </div>
    `;

    return;
  }

  content.innerHTML =
    groups.map(group => `
      <article class="admin-item">

        <div>

          <strong>
            ${escapeHTML(group.name)}
          </strong>

          <p>
            ${escapeHTML(
              group.description || ""
            )}
          </p>

          <small>
            المالك:
            ${escapeHTML(
              group.ownerUsername
            )}
          </small>

        </div>

        <div class="admin-actions">

          <button
            class="primary"
            data-admin-group-review="${escapeHTML(group.id)}"
            data-status="approved"
          >
            قبول
          </button>

          <button
            class="danger-button"
            data-admin-group-review="${escapeHTML(group.id)}"
            data-status="rejected"
          >
            رفض
          </button>

        </div>

      </article>
    `).join("");
}

async function renderAdminApplications() {
  const data = await api(
    "/api/applications"
  );

  const applications =
    (data.applications || [])
      .filter(
        application =>
          application.status ===
          "pending"
      );

  const content =
    $("#admin-content");

  if (!applications.length) {

    content.innerHTML = `
      <div class="empty-state">
        لا توجد تقديمات معلقة.
      </div>
    `;

    return;
  }

  content.innerHTML =
    applications.map(application => `
      <article class="admin-item">

        <div>

          <strong>
            ${escapeHTML(
              application.type
            )}
          </strong>

          <p>
            ${escapeHTML(
              application.note || ""
            )}
          </p>

          <small>
            المستخدم:
            ${escapeHTML(
              application.username
            )}
          </small>

        </div>

        <div class="admin-actions">

          <button
            class="primary"
            data-admin-application-review="${escapeHTML(application.id)}"
            data-status="approved"
          >
            قبول
          </button>

          <button
            class="danger-button"
            data-admin-application-review="${escapeHTML(application.id)}"
            data-status="rejected"
          >
            رفض
          </button>

        </div>

      </article>
    `).join("");
}

async function renderAdminTickets() {
  const data = await api(
    "/api/tickets"
  );

  const tickets =
    data.tickets || [];

  const content =
    $("#admin-content");

  if (!tickets.length) {

    content.innerHTML = `
      <div class="empty-state">
        لا توجد تذاكر.
      </div>
    `;

    return;
  }

  content.innerHTML =
    tickets.map(ticket => `
      <article class="admin-item">

        <div>

          <strong>
            ${escapeHTML(
              ticket.subject
            )}
          </strong>

          <p>
            ${escapeHTML(
              ticket.type
            )}
          </p>

          <small>
            ${escapeHTML(
              ticket.username
            )}
          </small>

        </div>

        <div class="admin-actions">

          <button
            class="secondary"
            data-ticket-open="${escapeHTML(ticket.id)}"
          >
            فتح
          </button>

          <button
            class="primary"
            data-admin-ticket-status="${escapeHTML(ticket.id)}"
            data-status="closed"
          >
            إغلاق
          </button>

        </div>

      </article>
    `).join("");
}

async function renderAdminReviews() {
  const data = await api(
    "/api/admin/reviews"
  );

  const reviews =
    (data.reviews || [])
      .filter(
        review =>
          review.status ===
          "pending"
      );

  const content =
    $("#admin-content");

  if (!reviews.length) {

    content.innerHTML = `
      <div class="empty-state">
        لا توجد تقييمات معلقة.
      </div>
    `;

    return;
  }

  content.innerHTML =
    reviews.map(review => `
      <article class="admin-item">

        <div>

          <strong>
            ${escapeHTML(
              review.targetName
            )}
          </strong>

          <p>
            ${escapeHTML(
              review.comment
            )}
          </p>

          <small>
            ${escapeHTML(
              review.username
            )}
            ·
            ${stars(review.rating)}
          </small>

        </div>

        <div class="admin-actions">

          <button
            class="primary"
            data-admin-review="${escapeHTML(review.id)}"
            data-status="approved"
          >
            قبول
          </button>

          <button
            class="danger-button"
            data-admin-review="${escapeHTML(review.id)}"
            data-status="rejected"
          >
            رفض
          </button>

        </div>

      </article>
    `).join("");
}

async function renderAdminUsers() {
  const data = await api(
    "/api/admin/users"
  );

  const users =
    data.users || [];

  const content =
    $("#admin-content");

  content.innerHTML = `
    <div class="admin-table">

      <div class="admin-row admin-header">
        <span>المستخدم</span>
        <span>الدور</span>
        <span>Discord</span>
        <span>تاريخ التسجيل</span>
      </div>

      ${
        users.map(user => `
          <div class="admin-row">

            <span>
              ${escapeHTML(
                user.username
              )}
            </span>

            <span>
              ${escapeHTML(
                user.role
              )}
            </span>

            <span>
              ${
                user.discordId
                  ? escapeHTML(
                      user.discordId
                    )
                  : "غير مرتبط"
              }
            </span>

            <span>
              ${formatDate(
                user.createdAt
              )}
            </span>

          </div>
        `).join("")
      }

    </div>
  `;
}

async function renderAdminLogs() {
  const data = await api(
    "/api/admin/logs"
  );

  const logs =
    data.logs || [];

  const content =
    $("#admin-content");

  if (!logs.length) {

    content.innerHTML = `
      <div class="empty-state">
        لا يوجد سجل.
      </div>
    `;

    return;
  }

  content.innerHTML =
    logs.map(log => `
      <article class="admin-item">

        <div>

          <strong>
            ${escapeHTML(
              log.type
            )}
          </strong>

          <p>
            ${escapeHTML(
              log.admin ||
              "system"
            )}
          </p>

        </div>

        <small>
          ${formatDate(
            log.createdAt
          )}
        </small>

      </article>
    `).join("");
}


// =========================
// ADMIN ACTIONS
// =========================

async function reviewGroup(
  id,
  status
) {
  try {

    await api(
      `/api/admin/groups/${encodeURIComponent(id)}/review`,
      {
        method: "PATCH",
        body: {
          status
        }
      }
    );

    showToast(
      status === "approved"
        ? "تم قبول المجموعة"
        : "تم رفض المجموعة"
    );

    await loadAdminStats();

    await loadAdminTab(
      "groups"
    );

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}

async function reviewApplication(
  id,
  status
) {
  try {

    const reviewNote =
      prompt(
        "ملاحظة المراجعة:",
        ""
      );

    await api(
      `/api/admin/applications/${encodeURIComponent(id)}/review`,
      {
        method: "PATCH",
        body: {
          status,
          reviewNote:
            reviewNote || ""
        }
      }
    );

    showToast(
      "تم تحديث الطلب"
    );

    await loadAdminStats();

    await loadAdminTab(
      "applications"
    );

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}

async function updateTicketStatus(
  id,
  status
) {
  try {

    await api(
      `/api/admin/tickets/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: {
          status
        }
      }
    );

    showToast(
      "تم تحديث التذكرة"
    );

    await loadAdminStats();

    await loadAdminTab(
      "tickets"
    );

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}

async function reviewReview(
  id,
  status
) {
  try {

    await api(
      `/api/admin/reviews/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: {
          status
        }
      }
    );

    showToast(
      "تم تحديث التقييم"
    );

    await loadAdminStats();

    await loadAdminTab(
      "reviews"
    );

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}


// =========================
// MODAL
// =========================

function openModal(html) {
  const modal =
    $("#modal");

  const content =
    $("#modal-content");

  if (!modal || !content) {
    return;
  }

  content.innerHTML =
    html;

  modal.classList.remove(
    "hidden"
  );
}

function closeModal() {
  const modal =
    $("#modal");

  if (!modal) return;

  modal.classList.add(
    "hidden"
  );

  const content =
    $("#modal-content");

  if (content) {
    content.innerHTML = "";
  }
}


// =========================
// EVENTS
// =========================

document.addEventListener(
  "click",
  async event => {

    const viewButton =
      event.target.closest(
        "[data-view]"
      );

    if (
      viewButton &&
      !event.target.closest(
        "form"
      )
    ) {
      event.preventDefault();

      navigate(
        viewButton.dataset.view
      );

      return;
    }


    const createGroupButton =
      event.target.closest(
        '[data-action="create-group"]'
      );

    if (createGroupButton) {
      await createGroup();
      return;
    }


    const createWatchButton =
      event.target.closest(
        '[data-action="create-watch"]'
      );

    if (createWatchButton) {
      await createWatchRoom();
      return;
    }


    const createReviewButton =
      event.target.closest(
        '[data-action="create-review"]'
      );

    if (createReviewButton) {
      await createReview();
      return;
    }


    const createTicketButton =
      event.target.closest(
        '[data-action="create-ticket"]'
      );

    if (createTicketButton) {
      await createTicket();
      return;
    }


    const createApplicationButton =
      event.target.closest(
        '[data-action="create-application"]'
      );

    if (createApplicationButton) {
      await createApplication();
      return;
    }


    const linkDiscordButton =
      event.target.closest(
        '[data-action="link-discord"]'
      );

    if (linkDiscordButton) {
      await linkDiscord();
      return;
    }


    const groupOpen =
      event.target.closest(
        "[data-group-open]"
      );

    if (groupOpen) {

      await openGroup(
        groupOpen.dataset.groupOpen
      );

      return;
    }


    const groupJoin =
      event.target.closest(
        "[data-group-join]"
      );

    if (groupJoin) {

      await joinGroup(
        groupJoin.dataset.groupJoin
      );

      return;
    }


    const watchOpen =
      event.target.closest(
        "[data-watch-open]"
      );

    if (watchOpen) {

      await openWatchRoom(
        watchOpen.dataset.watchOpen
      );

      return;
    }


    const ticketOpen =
      event.target.closest(
        "[data-ticket-open]"
      );

    if (ticketOpen) {

      await openTicket(
        ticketOpen.dataset.ticketOpen
      );

      return;
    }


    const groupReview =
      event.target.closest(
        "[data-admin-group-review]"
      );

    if (groupReview) {

      await reviewGroup(
        groupReview.dataset.adminGroupReview,
        groupReview.dataset.status
      );

      return;
    }


    const applicationReview =
      event.target.closest(
        "[data-admin-application-review]"
      );

    if (applicationReview) {

      await reviewApplication(
        applicationReview.dataset.adminApplicationReview,
        applicationReview.dataset.status
      );

      return;
    }


    const ticketStatus =
      event.target.closest(
        "[data-admin-ticket-status]"
      );

    if (ticketStatus) {

      await updateTicketStatus(
        ticketStatus.dataset.adminTicketStatus,
        ticketStatus.dataset.status
      );

      return;
    }


    const reviewButton =
      event.target.closest(
        "[data-admin-review]"
      );

    if (reviewButton) {

      await reviewReview(
        reviewButton.dataset.adminReview,
        reviewButton.dataset.status
      );

      return;
    }


    const adminTab =
      event.target.closest(
        "[data-admin-tab]"
      );

    if (adminTab) {

      $$(".admin-tabs button")
        .forEach(button => {
          button.classList.toggle(
            "active",
            button === adminTab
          );
        });

      await loadAdminTab(
        adminTab.dataset.adminTab
      );

      return;
    }

  }
);


// =========================
// LOGIN FORM
// =========================

$("#login-form")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const form =
        event.currentTarget;

      const message =
        $("#login-message");

      try {

        message.textContent =
          "جاري تسجيل الدخول...";

        await login(
          form.username.value.trim(),
          form.password.value
        );

        form.reset();

        message.textContent = "";

      } catch (error) {

        message.textContent =
          error.message;

        showToast(
          error.message,
          "error"
        );
      }
    }
  );


// =========================
// REGISTER FORM
// =========================

$("#register-form")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const form =
        event.currentTarget;

      const message =
        $("#register-message");

      try {

        message.textContent =
          "جاري إنشاء الحساب...";

        await register(
          form.username.value.trim(),
          form.password.value,
          form.confirmPassword.value
        );

        form.reset();

        message.textContent = "";

      } catch (error) {

        message.textContent =
          error.message;

        showToast(
          error.message,
          "error"
        );
      }
    }
  );


// =========================
// LOGOUT
// =========================

$("#logout-button")
  ?.addEventListener(
    "click",
    logout
  );


// =========================
// MEMBER SEARCH
// =========================

$("#member-search")
  ?.addEventListener(
    "input",
    event => {

      const query =
        event.target.value
          .trim()
          .toLowerCase();

      const filtered =
        state.members.filter(member => {

          const name = (
            member.displayName ||
            ""
          ).toLowerCase();

          const username = (
            member.username ||
            ""
          ).toLowerCase();

          return (
            name.includes(query) ||
            username.includes(query)
          );
        });

      renderMembers(
        filtered
      );
    }
  );


// =========================
// MOBILE MENU
// =========================

$("#menu")
  ?.addEventListener(
    "click",
    () => {

      $("#mobile-menu")
        ?.classList.toggle(
          "open"
        );

    }
  );


// =========================
// MODAL CLOSE
// =========================

$("#close")
  ?.addEventListener(
    "click",
    closeModal
  );

$("#modal")
  ?.addEventListener(
    "click",
    event => {

      if (
        event.target.id ===
        "modal"
      ) {
        closeModal();
      }

    }
  );


// =========================
// DISCORD LIVE EVENTS
// =========================

socket.on(
  "discord:memberUpdate",
  () => {

    if (
      state.currentView ===
      "members"
    ) {
      loadMembers();
    }

  }
);

socket.on(
  "discord:activity",
  () => {

    if (
      state.currentView ===
      "members"
    ) {
      loadMembers();
    }

  }
);

socket.on(
  "discord:voice",
  () => {

    if (
      state.currentView ===
      "members"
    ) {
      loadMembers();
    }

  }
);

socket.on(
  "watch:created",
  () => {

    if (
      state.currentView ===
      "watch"
    ) {
      loadWatchRooms();
    }

  }
);


// =========================
// INIT
// =========================

async function init() {

  $("#year").textContent =
    new Date().getFullYear();

  await checkAuth();

  await loadHome();

  navigate("home");
}

init();
