const currentUser = localStorage.getItem("user");
let posts = JSON.parse(localStorage.getItem("posts") || "[]");

function savePosts() {
  localStorage.setItem("posts", JSON.stringify(posts));
}

function getUserProfilePic(username) {
  const users = JSON.parse(localStorage.getItem("allUsers") || "[]");
  const user = users.find(u => u.username === username);
  return user && user.profilePic ? user.profilePic : 'https://via.placeholder.com/40';
}

function renderPosts() {
  const main = document.getElementById("main-content");
  let html = `<h2>Posts</h2>`;
  [...posts].reverse().forEach((p, idx) => {
    const index = posts.length - 1 - idx; // actual index in posts array
    const pic = getUserProfilePic(p.user);
    const isOwner = p.user === currentUser;

    html += `
      <div class="post">
        ${isOwner ? `
          <button class="menu-btn" onclick="toggleMenu(${index})">⋮</button>
          <div class="menu-options" id="menu-${index}">
            <button onclick="deletePost(${index})">Delete</button>
          </div>
        ` : ''}
        <div style="display:flex;align-items:center; margin-bottom: 8px;">
          <img src="${pic}" class="profile-pic-small" alt="Profile Picture" />
          <strong>${p.user}</strong>
        </div>
        <p>${escapeHtml(p.text)}</p>
        <div class="comments">
          ${(p.comments || []).map(c => `
            <div class="comment"><strong>${c.user}</strong>: ${escapeHtml(c.text)}</div>
          `).join('')}
        </div>
        <div class="comment-box">
          <input type="text" placeholder="Add a comment..." onkeypress="handleCommentKey(event, ${index})" />
        </div>
      </div>
    `;
  });
  main.innerHTML = html;
  // Close all menus when posts are re-rendered
  document.querySelectorAll('.menu-options').forEach(menu => menu.style.display = 'none');
}

function toggleMenu(index) {
  const menu = document.getElementById(`menu-${index}`);
  if (!menu) return;
  const isShown = menu.style.display === 'flex' || menu.style.display === 'block';
  // Close all menus
  document.querySelectorAll('.menu-options').forEach(m => m.style.display = 'none');
  menu.style.display = isShown ? 'none' : 'flex';
}

function deletePost(index) {
  if (!confirm("Are you sure you want to delete this post?")) return;
  posts.splice(index, 1);
  savePosts();
  renderPosts();
}

function handleCommentKey(event, index) {
  if (event.key === "Enter") {
    const input = event.target;
    const text = input.value.trim();
    if (!text) return;
    if (!posts[index].comments) posts[index].comments = [];
    posts[index].comments.push({ user: currentUser, text });
    savePosts();
    renderPosts();
  }
}

function addPost(text) {
  posts.push({ user: currentUser, text, comments: [] });
  savePosts();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
