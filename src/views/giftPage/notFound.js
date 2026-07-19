'use strict';

function renderNotFound() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gift not found — Ehdy</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f9f6f2;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 24px;
      padding: 40px 32px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .icon { font-size: 56px; margin-bottom: 20px; display: block; }
    h1 { font-size: 22px; font-weight: 700; color: #1C1410; margin-bottom: 10px; }
    p { font-size: 15px; color: #7A6A62; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <span class="icon">🔍</span>
    <h1>Gift not found</h1>
    <p>This link may have expired or already been claimed.</p>
  </div>
</body>
</html>`;
}

module.exports = { renderNotFound };
