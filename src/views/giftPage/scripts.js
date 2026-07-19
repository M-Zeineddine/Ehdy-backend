'use strict';

/**
 * Inline client scripts: tap-to-unwrap reveal, the occasion Lottie
 * animation, and voucher-code copying.
 */
function renderPageScripts(lottieUrl) {
  return `
  <script src="https://unpkg.com/lottie-web@5.12.2/build/player/lottie_light.min.js"></script>
  <script>
    // Tap-to-unwrap reveal
    (function() {
      var btn = document.getElementById('unwrapBtn');
      if (!btn) return;
      btn.addEventListener('click', function() {
        if (btn.classList.contains('opening')) return;
        btn.classList.add('opening');
        setTimeout(function() {
          document.body.classList.add('opened');
          document.dispatchEvent(new Event('gift:opened'));
        }, 420);
      });
    })();

    // Occasion animation (falls back to the static emoji if it can't load)
    (function() {
      var el = document.getElementById('lottieIcon');
      if (!el || !window.lottie) return;
      try {
        var anim = lottie.loadAnimation({
          container: el,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: ${JSON.stringify(lottieUrl)}
        });
        anim.addEventListener('DOMLoaded', function() {
          el.style.display = 'block';
          document.getElementById('iconEmoji').style.display = 'none';
        });
      } catch (e) { /* keep emoji */ }
    })();

    function copyCode() {
      const code = document.getElementById('vcode').textContent;
      navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('copyBtn');
        btn.textContent = '✓';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = '⧉'; btn.classList.remove('copied'); }, 2000);
      });
    }
  </script>`;
}

module.exports = { renderPageScripts };
