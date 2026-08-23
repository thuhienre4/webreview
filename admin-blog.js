const $ = (selector) => document.querySelector(selector);
let posts = [];
const fields = ['source-url', 'title', 'slug', 'brand', 'category', 'image', 'excerpt', 'content', 'featured', 'published'];

function value(id) {
  const element = $('#' + id);
  return element.type === 'checkbox' ? element.checked : element.value.trim();
}

function escapeHtml(input) {
  return String(input || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function notice(message, error = false) {
  $('#notice').textContent = message;
  $('#notice').className = 'notice' + (error ? ' error' : '');
}

function showPreview() {
  const url = $('#image').value.trim();
  $('#preview').src = url;
  $('#preview').style.display = url ? 'block' : 'none';
}

function resetForm() {
  const form = $('#post-form');
  HTMLFormElement.prototype.reset.call(form);
  $('#post-id').value = '';
  $('#category').value = 'Reviews';
  $('#form-title').textContent = 'New blog post';
  showPreview();
  notice('');
}

function fill(post) {
  $('#post-id').value = post.id || '';
  fields.forEach((id) => {
    const key = id.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
    const element = $('#' + id);
    if (element.type === 'checkbox') element.checked = Boolean(post[key]);
    else element.value = post[key] || '';
  });
  $('#form-title').textContent = 'Edit post';
  showPreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function render() {
  const root = $('#posts');
  if (!posts.length) {
    root.innerHTML = '<div class="empty">No posts yet.</div>';
    return;
  }
  root.innerHTML = posts.map((post) => `<article class="post">
    <div class="post-head"><div><h3>${escapeHtml(post.title)}</h3><div class="muted">${escapeHtml(post.brand || post.category || 'Blog')}</div></div><span class="tag">${post.published ? 'Published' : 'Draft'}</span></div>
    <div class="actions"><button type="button" data-edit="${escapeHtml(post.id)}">Edit</button><button class="secondary danger" type="button" data-delete="${escapeHtml(post.id)}">Delete</button></div>
  </article>`).join('');
}

async function load() {
  posts = await api('/api/admin/blog');
  render();
}

$('#extract').addEventListener('click', async () => {
  const sourceUrl = value('source-url');
  if (!sourceUrl) return notice('Enter an official page URL first.', true);
  $('#extract').disabled = true;
  notice('Extracting metadata and generating a draft...');
  try {
    const data = await api('/api/admin/blog/extract', { method: 'POST', body: JSON.stringify({ sourceUrl }) });
    ['title', 'slug', 'brand', 'image', 'excerpt', 'content'].forEach((id) => {
      if (data[id]) $('#' + id).value = data[id];
    });
    showPreview();
    notice(data.warning || 'Draft generated. Please review it before publishing.', Boolean(data.warning));
  } catch (error) {
    notice(error.message, true);
  } finally {
    $('#extract').disabled = false;
  }
});

$('#image').addEventListener('input', showPreview);
$('#new-post').addEventListener('click', resetForm);
$('#post-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = $('#post-id').value;
  const payload = {};
  fields.forEach((field) => {
    payload[field.replace(/-([a-z])/g, (_, character) => character.toUpperCase())] = value(field);
  });
  notice('Saving...');
  try {
    await api(id ? '/api/admin/blog/' + encodeURIComponent(id) : '/api/admin/blog', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    resetForm();
    await load();
    notice('Post saved.');
  } catch (error) {
    notice(error.message, true);
  }
});

$('#posts').addEventListener('click', async (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) fill(posts.find((post) => post.id === editId));
  if (deleteId && confirm('Delete this post?')) {
    try {
      await api('/api/admin/blog/' + encodeURIComponent(deleteId), { method: 'DELETE' });
      await load();
    } catch (error) {
      notice(error.message, true);
    }
  }
});

(async () => {
  try {
    const session = await api('/api/admin/session');
    $('#admin-email').textContent = session.email || '';
    await load();
  } catch {
    location.href = '/admin';
  }
})();
