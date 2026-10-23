function setLanguage(lang) {
  const en = document.querySelectorAll('.lang-en');
  const ru = document.querySelectorAll('.lang-ru');

  if (lang === 'ru') {
    en.forEach(el => el.style.display = 'none');
    ru.forEach(el => el.style.display = 'block');
    document.documentElement.lang = 'ru';
    localStorage.setItem('hp-language', 'ru');
  } else {
    ru.forEach(el => el.style.display = 'none');
    en.forEach(el => el.style.display = 'block');
    document.documentElement.lang = 'en';
    localStorage.setItem('hp-language', 'en');
  }
}

const savedLanguage = localStorage.getItem('hp-language');
setLanguage(savedLanguage === 'ru' ? 'ru' : 'en');
