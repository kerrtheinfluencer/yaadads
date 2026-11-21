/* Shared listing feedback. Real Supabase sessions only; no local-only accounts or reviews. */
(function () {
  'use strict';
  var active = null;
  function node(tag, text, parent) {
    var el = document.createElement(tag);
    if (text) el.textContent = text;
    if (parent) parent.appendChild(el);
    return el;
  }
  function button(text, parent, action) {
    var el = node('button', text, parent);
    el.type = 'button';
    el.addEventListener('click', action);
    return el;
  }
  function field(label, tag, parent, type) {
    var wrap = node('label', label, parent);
    var input = node(tag, '', wrap);
    if (type) input.type = type;
    return input;
  }
  function message(error) {
    if (error && error.code === '23505') return 'You already posted a review (or reported this post). Delete your review first to replace it.';
    if (error && (error.code === '42P01' || error.code === 'PGRST205')) return 'Reviews and comments are being set up. Please try again soon.';
    if (error && error.code === '42501') return 'Please sign in again. This listing may no longer accept posts.';
    return error && error.message || 'Could not connect. Please try again.';
  }
  function mount(root, db) {
    if (!root || !db || root.dataset.mounted) return;
    if (active) active();
    root.dataset.mounted = 'true';
    root.classList.add('ad-feedback');
    root.id = 'ad-feedback';
    root.replaceChildren();
    var alive = true, user = null, page = 0, pageSize = 10, available = false;
    var generation = 0, kind = 'comment', busy = false, authBusy = false;
    node('h2', 'Reviews & comments', root);
    node('p', 'Ask a question or share your experience. Reviews are member opinions, not verified purchases. Keep it respectful and never share private details.', root);
    var authNotice = node('p', '', root);
    authNotice.setAttribute('role', 'status');
    var tabs = node('div', '', root);
    tabs.className = 'feedback-actions';
    var commentsTab = button('Comments', tabs, function () { changeKind('comment'); });
    var reviewsTab = button('Reviews', tabs, function () { changeKind('review'); });
    var status = node('p', '', root);
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    var list = node('div', '', root);
    var paging = node('div', '', root);
    paging.className = 'feedback-actions';
    var prev = button('Previous', paging, function () { page--; load(); });
    var next = button('Next', paging, function () { page++; load(); });
    button('Refresh', paging, function () { load(); });
    var account = node('div', '', root);
    account.className = 'feedback-account';
    var form = node('form', '', root);
    var nameLine = node('p', '', form);
    var stars = field('Rating', 'select', form);
    for (var i = 1; i <= 5; i++) {
      var option = node('option', i + (i === 1 ? ' star' : ' stars'), stars);
      option.value = String(i);
    }
    stars.value = '5';
    var body = field('Your comment', 'textarea', form);
    body.rows = 4; body.maxLength = 2000; body.required = true;
    var submit = node('button', 'Post comment', form);
    submit.type = 'submit';
    function setStatus(text) { if (alive) status.textContent = text; }
    function changeKind(value) {
      kind = value; page = 0;
      commentsTab.setAttribute('aria-pressed', String(kind === 'comment'));
      reviewsTab.setAttribute('aria-pressed', String(kind === 'review'));
      stars.parentNode.hidden = kind !== 'review';
      body.parentNode.firstChild.textContent = kind === 'review' ? 'Your experience' : 'Your comment';
      submit.textContent = kind === 'review' ? 'Post review' : 'Post comment';
      load();
    }
    async function verifiedUser() {
      var result = await db.auth.getUser();
      if (result.error || !result.data.user) throw new Error('Please sign in to post or report.');
      return result.data.user;
    }

    function updateAccount() {
      account.replaceChildren();
      form.hidden = !user;
      submit.disabled = !available || busy;
      if (user) {
        authNotice.textContent = '';
        nameLine.textContent = 'Posting as ' + (user.user_metadata && (user.user_metadata.name || user.user_metadata.full_name) || 'Buyer');
        return;
      }
      node('h3', 'Join free as a buyer', account);
      node('p', 'No ad or phone number needed.', account).className = 'fb-sub';
      var gbtn = button('', account, async function () {
        try {
          var result = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } });
          if (result.error) throw result.error;
        } catch (error) { setStatus(message(error)); }
      });
      gbtn.className = 'fb-google';
      // Built with DOM calls only: this file is held to a no-markup-strings rule (see tools/test-ad-feedback.js).
      (function () {
        var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('width', '20'); svg.setAttribute('height', '20'); svg.setAttribute('viewBox', '0 0 18 18'); svg.setAttribute('aria-hidden', 'true');
        [['#4285F4', 'M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z'],
         ['#34A853', 'M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.87-3.04.87-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z'],
         ['#FBBC05', 'M3.97 10.73A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.19.29-1.73V4.94H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.06l3.01-2.33z'],
         ['#EA4335', 'M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z']
        ].forEach(function (d) { var pth = document.createElementNS(NS, 'path'); pth.setAttribute('fill', d[0]); pth.setAttribute('d', d[1]); svg.appendChild(pth); });
        var label = document.createElement('span'); label.textContent = 'Continue with Google';
        gbtn.textContent = ''; gbtn.appendChild(svg); gbtn.appendChild(label);
      })();
      var emailToggle = button('Use email instead', account, function () {
        authForm.hidden = !authForm.hidden;
        emailToggle.textContent = authForm.hidden ? 'Use email instead' : 'Hide email form';
      });
      emailToggle.className = 'fb-link';
      var authForm = node('form', '', account);
      authForm.hidden = true;
      var mode = field('Account', 'select', authForm);
      node('option', 'Create free buyer account', mode).value = 'signup';
      node('option', 'Log in', mode).value = 'login';
      var name = field('Display name (public)', 'input', authForm, 'text');
      name.required = true; name.maxLength = 80; name.autocomplete = 'name';
      var email = field('Email (private)', 'input', authForm, 'email');
      email.required = true; email.autocomplete = 'email';
      var password = field('Password (at least 6 characters)', 'input', authForm, 'password');
      password.required = true; password.minLength = 6; password.autocomplete = 'new-password';
      var authSubmit = node('button', 'Create free buyer account', authForm);
      authSubmit.type = 'submit';
      mode.addEventListener('change', function () {
        name.parentNode.hidden = mode.value === 'login';
        name.required = mode.value === 'signup';
        password.autocomplete = mode.value === 'login' ? 'current-password' : 'new-password';
        authSubmit.textContent = mode.value === 'login' ? 'Log in' : 'Create free buyer account';
      });
      authForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (authBusy) return;
        authBusy = true; authSubmit.disabled = true;
        try {
          var result;
          if (mode.value === 'signup') {
            if (!name.value.trim()) throw new Error('Please enter a display name.');
            result = await db.auth.signUp({ email: email.value.trim(), password: password.value,
              options: { data: { name: name.value.trim(), account_type: 'buyer' },
                emailRedirectTo: window.location.origin + window.location.pathname } });
          } else {
            result = await db.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
          }
          if (result.error) throw result.error;
          password.value = '';
          if (!result.data.session) {
            authNotice.textContent = 'Check your email to confirm your account, then return to this listing and log in.';
          } else {
            user = result.data.session.user; updateAccount(); load();
          }
        } catch (error) { setStatus(message(error)); }
        finally { authBusy = false; authSubmit.disabled = false; }
      });
    }
    async function load() {
      var request = ++generation;
      prev.disabled = true; next.disabled = true;
      setStatus('Loading…');
      try {
        var result = await db.from('ad_feedback')
          .select('id,author_id,author_name,body,rating,created_at', { count: 'exact' })
          .eq('ad_id', root.dataset.adId).eq('kind', kind)
          .order('created_at', { ascending: false }).order('id', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (!alive || request !== generation) return;
        if (result.error) throw result.error;
        available = true; submit.disabled = busy;
        list.replaceChildren();
        (result.data || []).forEach(renderPost);
        setStatus(result.count ? result.count + ' ' + (kind === 'review' ? 'review(s)' : 'comment(s)') + ' · Page ' + (page + 1) : 'No ' + (kind === 'review' ? 'reviews' : 'comments') + ' yet. Be the first!');
        prev.disabled = page === 0;
        next.disabled = (page + 1) * pageSize >= result.count;
      } catch (error) {
        if (request === generation) {
          available = false; submit.disabled = true;
          list.replaceChildren(); setStatus(message(error));
        }
      }
    }
    async function act(action, btn) {
      btn.disabled = true;
      try { await action(await verifiedUser()); }
      catch (error) { setStatus(message(error)); }
      finally { btn.disabled = false; }
    }
    function renderPost(post) {
      var article = node('article', '', list);
      node('strong', post.author_name || 'Buyer', article);
      if (post.rating) node('span', ' · ' + post.rating + '/5 stars', article);
      var date = node('time', new Date(post.created_at).toLocaleDateString(), article);
      date.dateTime = post.created_at;
      node('p', post.body, article);
      if (user && user.id === post.author_id) {
        var del = button('Delete my post', article, function () {
          if (!window.confirm('Delete your post?')) return;
          act(async function (member) {
            var result = await db.from('ad_feedback').delete().eq('id', post.id).eq('author_id', member.id);
            if (result.error) throw result.error;
            page = 0; await load();
          }, del);
        });
      } else {
        var reason = field('Report reason', 'select', article);
        ['spam', 'abuse', 'misleading'].forEach(function (value) { node('option', value, reason).value = value; });
        var report = button('Report', article, function () {
          act(async function (member) {
            var result = await db.from('ad_feedback_reports').insert({ feedback_id: post.id, reporter_id: member.id, reason: reason.value });
            if (result.error) throw result.error;
            setStatus('Report sent for moderator review.');
          }, report);
        });
      }
    }
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (busy || !available) return;
      busy = true; submit.disabled = true;
      var postKind = kind, text = body.value.trim(), rating = Number(stars.value);
      try {
        var member = await verifiedUser();
        if (!text || text.length > 2000) throw new Error('Write between 1 and 2,000 characters.');
        if (postKind === 'review' && member.id === root.dataset.sellerId) throw new Error('You cannot review your own listing. You can answer buyers in Comments.');
        var result = await db.from('ad_feedback').insert({ ad_id: root.dataset.adId,
          author_id: member.id, kind: postKind, body: text, rating: postKind === 'review' ? rating : null });
        if (result.error) throw result.error;
        body.value = ''; page = 0; await load();
      } catch (error) { setStatus(message(error)); }
      finally { busy = false; submit.disabled = !available; }
    });
    updateAccount(); changeKind('comment');
    var subscription = db.auth.onAuthStateChange(function (event, session) {
      // Never await another Supabase operation within the auth callback.
      setTimeout(function () {
        if (!alive) return;
        user = session && session.user || null;
        updateAccount(); load();
      }, 0);
    });
    db.auth.getSession().then(function (result) {
      if (!alive) return;
      if (result.error) { setStatus(message(result.error)); return; }
      user = result.data.session && result.data.session.user || null;
      updateAccount();
    }).catch(function (error) { setStatus(message(error)); });
    active = function () {
      alive = false;
      subscription.data.subscription.unsubscribe();
    };
  }
  window.AdFeedback = { mount: mount };
  var root = document.querySelector('[data-ad-feedback]');
  if (root) {
    try {
      var db = typeof _db !== 'undefined' && _db;
      if (!db) db = window.supabase.createClient(root.dataset.supabaseUrl, root.dataset.supabaseKey);
      mount(root, db);
    } catch (error) { root.textContent = 'Reviews could not load. Please refresh to try again.'; }
  }
})();
