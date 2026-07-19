'use strict';

// Mirrors GIFT_THEMES in Kado-app/src/constants/giftThemes.ts
// `lottie` is a Noto animated-emoji codepoint (fonts.gstatic.com hosting);
// `emoji` is the static fallback shown until/unless the animation loads;
// `particles` drift slowly up the page as ambient decoration.
const THEMES = {
  birthday: {
    gradient: ['#FF6B6B', '#FF8E53'],
    emoji: '🎂',
    lottie: '1f382',
    particles: ['🎈', '✨'],
    decorations: [
      { w: 140, h: 140, r: 70, top: -45, right: -35, bg: 'rgba(255,255,255,0.15)' },
      { w: 90, h: 90, r: 45, bottom: -25, left: -25, bg: 'rgba(255,200,100,0.22)' },
      { w: 40, h: 40, r: 20, top: 28, left: 48, bg: 'rgba(255,255,255,0.12)' },
      { w: 20, h: 20, r: 10, top: 60, right: 75, bg: 'rgba(255,255,255,0.2)' },
    ],
  },
  thankyou: {
    gradient: ['#11998e', '#38ef7d'],
    emoji: '🙏',
    lottie: '1f64f',
    particles: ['🌸', '✨'],
    decorations: [
      { w: 160, h: 160, r: 80, top: -60, right: -50, bg: 'rgba(255,255,255,0.12)' },
      { w: 70, h: 70, r: 35, bottom: -20, right: 40, bg: 'rgba(100,255,200,0.2)' },
      { w: 30, h: 30, r: 15, top: 22, left: 30, bg: 'rgba(255,255,255,0.15)' },
    ],
  },
  love: {
    gradient: ['#FF758C', '#FF7EB3'],
    emoji: '❤️',
    lottie: '2764_fe0f',
    particles: ['💗', '💕', '✨'],
    decorations: [
      { w: 120, h: 120, r: 60, top: -35, left: -35, bg: 'rgba(255,255,255,0.15)' },
      { w: 100, h: 100, r: 50, bottom: -30, right: -30, bg: 'rgba(255,160,190,0.22)' },
      { w: 50, h: 50, r: 25, top: 18, right: 58, bg: 'rgba(255,255,255,0.1)' },
    ],
  },
  thinking: {
    gradient: ['#8360C3', '#7EB8F7'],
    emoji: '💜',
    lottie: '1f49c',
    particles: ['💜', '✨'],
    decorations: [
      { w: 150, h: 150, r: 75, top: -50, right: -50, bg: 'rgba(255,255,255,0.1)' },
      { w: 60, h: 60, r: 30, bottom: 10, left: 15, bg: 'rgba(200,180,255,0.25)' },
      { w: 35, h: 35, r: 18, top: 14, left: 62, bg: 'rgba(255,255,255,0.12)' },
    ],
  },
  congrats: {
    gradient: ['#F7971E', '#FFD200'],
    emoji: '🎉',
    lottie: '1f389',
    particles: ['⭐', '✨'],
    decorations: [
      { w: 130, h: 130, r: 65, top: -38, right: -38, bg: 'rgba(255,255,255,0.15)' },
      { w: 80, h: 80, r: 40, bottom: -20, left: -20, bg: 'rgba(255,220,100,0.2)' },
      { w: 40, h: 40, r: 20, top: 32, left: 80, bg: 'rgba(255,255,255,0.12)' },
      { w: 22, h: 22, r: 11, bottom: 28, right: 80, bg: 'rgba(255,255,255,0.18)' },
    ],
  },
  sorry: {
    gradient: ['#4568DC', '#B06AB3'],
    emoji: '🥺',
    lottie: '1f97a',
    particles: ['💙', '🌸'],
    decorations: [
      { w: 160, h: 160, r: 80, top: -55, right: -55, bg: 'rgba(255,255,255,0.08)' },
      { w: 80, h: 80, r: 40, bottom: -15, left: 18, bg: 'rgba(180,150,255,0.2)' },
      { w: 45, h: 45, r: 23, top: 18, left: 40, bg: 'rgba(255,255,255,0.1)' },
    ],
  },
};

const DEFAULT_THEME = THEMES.birthday;

function getTheme(themeId) {
  return THEMES[themeId] || DEFAULT_THEME;
}

function lottieUrlFor(theme) {
  // Occasion animation (Google Noto animated emoji, stable gstatic hosting)
  return `https://fonts.gstatic.com/s/e/notoemoji/latest/${theme.lottie}/lottie.json`;
}

module.exports = { THEMES, getTheme, lottieUrlFor };
