#!/usr/bin/env node

/**
 * FlowMind Test Server — pure Node.js HTTP server (no dependencies)
 * Starts on http://localhost:3456
 * Credentials: admin / test123
 */

const http = require('http');
const PORT = process.env.PORT || 3456;

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(pair => {
    const eq = pair.indexOf('=');
    if (eq === -1) return;
    cookies[pair.slice(0, eq).trim()] = decodeURIComponent(pair.slice(eq + 1).trim());
  });
  return cookies;
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      const params = {};
      if (body) {
        body.split('&').forEach(pair => {
          const eq = pair.indexOf('=');
          if (eq === -1) return;
          params[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
        });
      }
      resolve(params);
    });
  });
}

function redirect(res, location, clearSession = false) {
  const headers = { Location: location };
  if (clearSession) headers['Set-Cookie'] = 'session=; Max-Age=0; Path=/; HttpOnly';
  res.writeHead(302, headers);
  res.end();
}

function setSession(res, username) {
  res.setHeader('Set-Cookie', `session=${encodeURIComponent(username)}; Path=/; HttpOnly`);
}

function getUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies.session ? decodeURIComponent(cookies.session) : null;
}

// ── HTML Layout ───────────────────────────────────────────────────────────────

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #0d1117; color: #c9d1d9; line-height: 1.6; min-height: 100vh; }
  a { color: #58a6ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .nav { background: #161b22; border-bottom: 1px solid #30363d; padding: 14px 32px;
         display: flex; align-items: center; gap: 24px; }
  .nav .brand { font-size: 18px; font-weight: 700; color: #58a6ff; letter-spacing: -0.5px; }
  .nav .links { display: flex; gap: 20px; margin-left: auto; }
  .nav .links a { font-size: 14px; color: #8b949e; }
  .nav .links a:hover { color: #c9d1d9; text-decoration: none; }
  .container { max-width: 960px; margin: 0 auto; padding: 40px 24px; }
  h1 { font-size: 28px; font-weight: 700; color: #f0f6fc; margin-bottom: 8px; }
  h2 { font-size: 20px; font-weight: 600; color: #f0f6fc; margin-bottom: 12px; margin-top: 28px; }
  h3 { font-size: 16px; font-weight: 600; color: #e6edf3; margin-bottom: 8px; }
  p  { color: #8b949e; margin-bottom: 16px; }
  .subtitle { font-size: 16px; color: #8b949e; margin-bottom: 32px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 24px; margin-bottom: 20px; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .btn { display: inline-block; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600;
         cursor: pointer; border: none; transition: background 0.15s; text-decoration: none; }
  .btn-primary { background: #238636; color: #fff; }
  .btn-primary:hover { background: #2ea043; text-decoration: none; }
  .btn-secondary { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; }
  .btn-secondary:hover { background: #30363d; text-decoration: none; }
  .btn-danger  { background: #b91c1c; color: #fff; }
  .btn-danger:hover { background: #dc2626; text-decoration: none; }
  .form-group { margin-bottom: 16px; }
  label { display: block; font-size: 13px; font-weight: 600; color: #e6edf3; margin-bottom: 6px; }
  input[type=text], input[type=email], input[type=password] {
    width: 100%; padding: 10px 12px; background: #0d1117; border: 1px solid #30363d;
    border-radius: 6px; color: #c9d1d9; font-size: 14px; outline: none; }
  input:focus { border-color: #58a6ff; }
  .alert { padding: 12px 16px; border-radius: 6px; font-size: 14px; margin-bottom: 20px; }
  .alert-error   { background: #3d0014; border: 1px solid #6e0019; color: #ff7b7b; }
  .alert-success { background: #0d2b1a; border: 1px solid #1a4731; color: #7ee787; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .badge-green { background: #0d2b1a; color: #7ee787; }
  .badge-blue  { background: #0d1d3b; color: #79c0ff; }
  .hero { padding: 60px 0 40px; text-align: center; }
  .hero h1 { font-size: 40px; margin-bottom: 12px; }
  .hero-btns { display: flex; gap: 12px; justify-content: center; margin-top: 28px; }
  .features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 40px; }
  .feature { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; }
  .feature .icon { font-size: 28px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 12px; color: #8b949e; font-weight: 600; text-transform: uppercase;
       padding: 10px 16px; background: #0d1117; border-bottom: 1px solid #21262d; }
  td { padding: 12px 16px; border-bottom: 1px solid #21262d; font-size: 14px; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #161b22; }
  .price { font-size: 22px; font-weight: 700; color: #58a6ff; }
  .login-box { max-width: 400px; margin: 0 auto; }
  .divider { border: none; border-top: 1px solid #30363d; margin: 24px 0; }
  .user-info { display: flex; align-items: center; gap: 12px; padding: 16px; background: #0d1117;
               border: 1px solid #30363d; border-radius: 8px; margin-bottom: 24px; }
  .avatar { width: 44px; height: 44px; border-radius: 50%; background: #238636;
            display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; color: #fff; }
  .stat-row { display: flex; gap: 16px; flex-wrap: wrap; margin: 20px 0; }
  .stat { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px 24px; min-width: 120px; }
  .stat-num { font-size: 26px; font-weight: 700; color: #f0f6fc; }
  .stat-label { font-size: 11px; color: #8b949e; text-transform: uppercase; margin-top: 2px; }
`;

function layout(title, body, user = null) {
  const navLinks = user
    ? `<a href="/dashboard">Dashboard</a><a href="/products">Products</a><a href="/profile">Profile</a><a href="/about">About</a>`
    : `<a href="/products">Products</a><a href="/about">About</a><a href="/login">Login</a>`;
  const userTag = user ? `<span style="font-size:13px;color:#7ee787;">● ${user}</span>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — FlowShop</title>
  <style>${CSS}</style>
</head>
<body>
  <nav class="nav">
    <a class="brand" href="/">⚡ FlowShop</a>
    <div class="links">${navLinks}${userTag ? '&nbsp;&nbsp;' + userTag : ''}</div>
  </nav>
  <div class="container">
    ${body}
  </div>
</body>
</html>`;
}

// ── Route Handlers ────────────────────────────────────────────────────────────

function homePage(user) {
  return layout('Home', `
    <div class="hero">
      <h1>Welcome to FlowShop</h1>
      <p class="subtitle">The best place to buy developer tools and automation software.</p>
      ${user
        ? `<p style="color:#7ee787;font-size:15px;">Welcome back, <strong>${user}</strong>!</p>`
        : '<p style="color:#8b949e;">Sign in to access your dashboard and orders.</p>'}
      <div class="hero-btns">
        <a href="/products" class="btn btn-primary">Browse Products</a>
        ${user ? `<a href="/dashboard" class="btn btn-secondary">My Dashboard</a>` : `<a href="/login" class="btn btn-secondary">Sign In</a>`}
      </div>
    </div>

    <div class="features">
      <div class="feature">
        <div class="icon">🚀</div>
        <h3>Fast &amp; Reliable</h3>
        <p>Our platform is built for speed. Every action is instant.</p>
      </div>
      <div class="feature">
        <div class="icon">🔒</div>
        <h3>Secure</h3>
        <p>Your data is encrypted end-to-end. Privacy first.</p>
      </div>
      <div class="feature">
        <div class="icon">🤖</div>
        <h3>AI-Powered</h3>
        <p>Smart automation tools that learn from your workflow.</p>
      </div>
    </div>

    <h2>Latest Announcements</h2>
    <div class="card">
      <h3>FlowShop v2.0 is live!</h3>
      <p>We've redesigned the entire platform from the ground up. Faster, smarter, and more powerful than ever.</p>
      <a href="/about">Read more →</a>
    </div>
    <div class="card">
      <h3>New Products Available</h3>
      <p>Check out our latest automation tools in the products section.</p>
      <a href="/products">Browse now →</a>
    </div>
  `, user);
}

function loginPage(error = '') {
  return layout('Login', `
    <div style="padding-top: 40px;">
      <div class="login-box">
        <h1>Sign In</h1>
        <p class="subtitle">Welcome back. Please sign in to continue.</p>
        ${error ? `<div class="alert alert-error">${error}</div>` : ''}
        <div class="card">
          <form method="POST" action="/login">
            <div class="form-group">
              <label for="username">Username</label>
              <input id="username" name="username" type="text" placeholder="Enter your username" autocomplete="username">
            </div>
            <div class="form-group">
              <label for="password">Password</label>
              <input id="password" name="password" type="password" placeholder="Enter your password" autocomplete="current-password">
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px;">Sign In</button>
          </form>
          <hr class="divider">
          <p style="font-size:13px;color:#8b949e;text-align:center;">
            Demo credentials: <code style="color:#7ee787;">admin</code> / <code style="color:#7ee787;">test123</code>
          </p>
        </div>
      </div>
    </div>
  `);
}

function dashboardPage(user) {
  return layout('Dashboard', `
    <h1>Dashboard</h1>
    <p class="subtitle">Your activity and account overview.</p>

    <div class="user-info">
      <div class="avatar">${user[0].toUpperCase()}</div>
      <div>
        <div style="font-weight:600;color:#f0f6fc;">${user}</div>
        <div style="font-size:13px;color:#8b949e;">Administrator · Last login: just now</div>
      </div>
      <form method="POST" action="/logout" style="margin-left:auto;">
        <button type="submit" class="btn btn-secondary">Sign Out</button>
      </form>
    </div>

    <div class="stat-row">
      <div class="stat"><div class="stat-num">12</div><div class="stat-label">Orders</div></div>
      <div class="stat"><div class="stat-num">3</div><div class="stat-label">Active</div></div>
      <div class="stat"><div class="stat-num">$482</div><div class="stat-label">Spent</div></div>
      <div class="stat"><div class="stat-num">98%</div><div class="stat-label">Uptime</div></div>
    </div>

    <h2>Recent Orders</h2>
    <div class="card" style="padding:0;overflow:hidden;">
      <table>
        <thead><tr><th>Order #</th><th>Product</th><th>Status</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>#1042</td><td>FlowMind Pro</td><td><span class="badge badge-green">Delivered</span></td><td>$49</td></tr>
          <tr><td>#1038</td><td>DevTools Bundle</td><td><span class="badge badge-green">Delivered</span></td><td>$89</td></tr>
          <tr><td>#1021</td><td>AI Automation Kit</td><td><span class="badge badge-blue">Processing</span></td><td>$129</td></tr>
        </tbody>
      </table>
    </div>

    <h2>Quick Actions</h2>
    <div class="card-grid">
      <a href="/products" class="btn btn-secondary" style="text-align:center;padding:16px;">Browse Products</a>
      <a href="/profile" class="btn btn-secondary" style="text-align:center;padding:16px;">Edit Profile</a>
    </div>
  `, user);
}

function productsPage(user) {
  const products = [
    { id: 1, name: 'FlowMind Starter', price: '$19', desc: 'Record and replay web flows with ease. Perfect for small teams.', badge: 'Popular' },
    { id: 2, name: 'FlowMind Pro', price: '$49', desc: 'AI-powered test healing, visual regression, and multi-tab support.', badge: 'Best Value' },
    { id: 3, name: 'FlowMind Enterprise', price: '$129', desc: 'Unlimited flows, suite management, and priority support.', badge: 'For Teams' },
  ];
  const cards = products.map(p => `
    <div class="card" id="product-${p.id}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <h3>${p.name}</h3>
        <span class="badge badge-blue">${p.badge}</span>
      </div>
      <p>${p.desc}</p>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;">
        <span class="price">${p.price}<span style="font-size:14px;color:#8b949e;">/mo</span></span>
        <button class="btn btn-primary add-to-cart" data-id="${p.id}" data-name="${p.name}">Add to Cart</button>
      </div>
    </div>
  `).join('');

  return layout('Products', `
    <h1>Products</h1>
    <p class="subtitle">Choose the plan that fits your automation needs.</p>
    <div id="cart-message" style="display:none;" class="alert alert-success"></div>
    <div class="card-grid">${cards}</div>

    <div class="card">
      <h3>All Plans Include</h3>
      <ul style="list-style:none;padding:0;margin:12px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <li style="color:#8b949e;">✓ Browser recording</li>
        <li style="color:#8b949e;">✓ Screenshot capture</li>
        <li style="color:#8b949e;">✓ Flow export/import</li>
        <li style="color:#8b949e;">✓ CLI access</li>
        <li style="color:#8b949e;">✓ 30-day free trial</li>
        <li style="color:#8b949e;">✓ Cancel anytime</li>
      </ul>
    </div>

    <script>
      document.querySelectorAll('.add-to-cart').forEach(btn => {
        btn.addEventListener('click', () => {
          const msg = document.getElementById('cart-message');
          msg.textContent = btn.dataset.name + ' added to cart!';
          msg.style.display = 'block';
          btn.textContent = 'Added ✓';
          btn.style.background = '#2ea043';
          setTimeout(() => { msg.style.display = 'none'; btn.textContent = 'Add to Cart'; btn.style.background = ''; }, 2500);
        });
      });
    </script>
  `, user);
}

function aboutPage(user) {
  return layout('About', `
    <h1>About FlowShop</h1>
    <p class="subtitle">Building the future of web automation since 2023.</p>

    <div class="card">
      <h2>Our Mission</h2>
      <p>FlowShop exists to make web automation accessible to every developer, regardless of expertise level. We believe testing should be as natural as using the web.</p>

      <h2>The Team</h2>
      <p>We're a distributed team of engineers and designers passionate about developer tooling. Our platform is built with love and tested rigorously.</p>

      <h2>Technology</h2>
      <p>Built on top of Playwright, powered by AI, and designed for real-world use cases. FlowShop handles the complexity so you don't have to.</p>
    </div>

    <div class="card-grid">
      <div class="card">
        <h3>Founded</h3>
        <p>2023</p>
      </div>
      <div class="card">
        <h3>Customers</h3>
        <p>500+ developers</p>
      </div>
      <div class="card">
        <h3>Flows Run</h3>
        <p>1M+ per month</p>
      </div>
    </div>

    <h2>Contact</h2>
    <div class="card">
      <p>Email: <a href="mailto:hello@flowshop.dev">hello@flowshop.dev</a></p>
      <p>Twitter: <a href="#">@flowshopdev</a></p>
      <p>GitHub: <a href="#">github.com/flowshop</a></p>
    </div>
  `, user);
}

function profilePage(user) {
  return layout('Profile', `
    <h1>Profile</h1>
    <p class="subtitle">Manage your account settings.</p>

    <div class="card">
      <div class="user-info" style="margin-bottom:0;">
        <div class="avatar">${user[0].toUpperCase()}</div>
        <div>
          <div style="font-weight:600;color:#f0f6fc;">${user}</div>
          <div style="font-size:13px;color:#8b949e;">Administrator</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Account Details</h2>
      <table>
        <tbody>
          <tr><td style="color:#8b949e;width:160px;">Username</td><td>${user}</td></tr>
          <tr><td style="color:#8b949e;">Role</td><td><span class="badge badge-green">Admin</span></td></tr>
          <tr><td style="color:#8b949e;">Member since</td><td>January 2024</td></tr>
          <tr><td style="color:#8b949e;">Email</td><td>${user}@example.com</td></tr>
        </tbody>
      </table>
    </div>

    <form method="POST" action="/logout">
      <button type="submit" class="btn btn-danger">Sign Out</button>
    </form>
  `, user);
}

function notFoundPage() {
  return layout('Not Found', `
    <div style="text-align:center;padding:80px 0;">
      <h1 style="font-size:60px;color:#8b949e;">404</h1>
      <h2>Page Not Found</h2>
      <p>The page you're looking for doesn't exist.</p>
      <a href="/" class="btn btn-primary" style="margin-top:16px;display:inline-block;">Go Home</a>
    </div>
  `);
}

// ── Server ─────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const user = getUser(req);
  const url = req.url.split('?')[0];
  const method = req.method;

  // JSON API
  if (url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', user: user || null, time: new Date().toISOString() }));
    return;
  }

  // Static routes
  if (method === 'GET') {
    if (url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(homePage(user));
    }
    if (url === '/login') {
      if (user) return redirect(res, '/dashboard');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(loginPage());
    }
    if (url === '/dashboard') {
      if (!user) return redirect(res, '/login');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(dashboardPage(user));
    }
    if (url === '/products') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(productsPage(user));
    }
    if (url === '/about') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(aboutPage(user));
    }
    if (url === '/profile') {
      if (!user) return redirect(res, '/login');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(profilePage(user));
    }
  }

  // POST routes
  if (method === 'POST') {
    if (url === '/login') {
      const body = await parseBody(req);
      if (body.username === 'admin' && body.password === 'test123') {
        res.writeHead(302, {
          Location: '/dashboard',
          'Set-Cookie': `session=${encodeURIComponent(body.username)}; Path=/; HttpOnly`,
        });
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(loginPage('Invalid username or password. Try admin / test123'));
    }
    if (url === '/logout') {
      redirect(res, '/', true);
      return;
    }
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/html' });
  res.end(notFoundPage());
});

server.listen(PORT, () => {
  console.log(`\n  FlowMind Test Server`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  URL:         http://localhost:${PORT}`);
  console.log(`  Credentials: admin / test123`);
  console.log(`  Press Ctrl+C to stop.\n`);
});
