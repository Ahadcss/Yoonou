// ============================================================
// Yoonou — Système multilingue (Français / English / Wolof)
// ⚠️ Les traductions wolof sont une première version générée par IA.
// À faire relire par un locuteur natif avant un vrai lancement public —
// le wolof a des variations régionales importantes.
// ============================================================

const YOONOU_TRANSLATIONS = {
  fr: {
    // Commun à toutes les pages
    nav_login: "Connexion",
    nav_signup: "Inscription",
    nav_start: "Commencer",
    lang_switcher_label: "Langue",

    // auth.html
    auth_tab_login: "Connexion",
    auth_tab_signup: "Inscription",
    auth_login_phone: "Numéro de téléphone",
    auth_login_password: "Mot de passe",
    auth_login_btn: "Se connecter",
    auth_login_error: "Numéro de téléphone ou mot de passe incorrect.",
    auth_role_client: "Client",
    auth_role_transporteur: "Transporteur",
    auth_prenom: "Prénom",
    auth_nom: "Nom",
    auth_phone: "Numéro de téléphone",
    auth_phone_confirm: "Confirmer le numéro de téléphone",
    auth_phone_mismatch: "Les deux numéros ne correspondent pas.",
    auth_password: "Mot de passe (6 caractères min.)",
    auth_ville: "Ville",
    auth_signup_btn: "Créer mon compte",
    auth_back_home: "← Retour à l'accueil",

    // index.html (nav + hero, premier passage)
    home_eyebrow: "🇸🇳 Né au Sénégal · Disponible maintenant",
    home_hero_title_1: "Votre marchandise a une destination.",
    home_hero_title_2: "Yoonou lui trace la voie.",
    home_hero_meaning: "« Yoonou » signifie la voie en wolof.",
    home_hero_lead: "Du petit colis au camion complet, sur une seule plateforme. Vélo, moto, tricycle, charrette, voiture, SUV, minivan, pick-up, camionnette ou camion : un transporteur partenaire prend en charge vos marchandises, où que vous soyez au Sénégal.",
    home_hero_cta_primary: "🚀 Commencer maintenant",
    home_hero_cta_secondary: "Voir comment ça marche"
  },

  en: {
    nav_login: "Log in",
    nav_signup: "Sign up",
    nav_start: "Get started",
    lang_switcher_label: "Language",

    auth_tab_login: "Log in",
    auth_tab_signup: "Sign up",
    auth_login_phone: "Phone number",
    auth_login_password: "Password",
    auth_login_btn: "Log in",
    auth_login_error: "Incorrect phone number or password.",
    auth_role_client: "Customer",
    auth_role_transporteur: "Driver",
    auth_prenom: "First name",
    auth_nom: "Last name",
    auth_phone: "Phone number",
    auth_phone_confirm: "Confirm phone number",
    auth_phone_mismatch: "The two numbers don't match.",
    auth_password: "Password (min. 6 characters)",
    auth_ville: "City",
    auth_signup_btn: "Create my account",
    auth_back_home: "← Back to home",

    home_eyebrow: "🇸🇳 Born in Senegal · Available now",
    home_hero_title_1: "Your goods have a destination.",
    home_hero_title_2: "Yoonou charts the way.",
    home_hero_meaning: "\"Yoonou\" means the path in Wolof.",
    home_hero_lead: "From small parcels to full truckloads, on one platform. Bike, motorbike, tricycle, cart, car, SUV, minivan, pickup, van or truck: a partner driver takes care of your goods, wherever you are in Senegal.",
    home_hero_cta_primary: "🚀 Get started now",
    home_hero_cta_secondary: "See how it works",

    // ---- Paramètres / Lieux / Aide / Entreprise (nouvelles pages) ----
    settings_back: "← My account",
    settings_title: "Settings",
    settings_sub: "Language, places, help and more.",
    settings_language: "🌍 Language",
    settings_language_desc: "Choose the app language.",
    settings_language_note: "Some pages are not translated yet: they stay in French.",
    settings_section_map: "Map",
    settings_add_place: "Add a place",
    settings_add_place_desc: "A place is missing or misplaced? Add it to the map.",
    settings_section_help: "Help",
    settings_help: "Help and history",
    settings_help_desc: "A problem with a delivery? Contact the Yoonou team.",
    settings_section_business: "Business",
    settings_business: "Create a business account",
    settings_soon: "SOON",
    settings_business_desc: "Regular deliveries, several users, invoices.",
    biz_badge: "COMING SOON",
    biz_title: "Yoonou for business is coming soon",
    biz_text: "We are building a space designed for businesses: regular deliveries, several users on one account and simpler tracking. Thanks for your patience!",
    biz_back: "← Back",
    zone_move_hint: "You can move the map",
    zone_search_ph: "Search for a place to go to",
    zone_title: "Show the location on the map",
    zone_sub: "And fill in the details",
    zone_type_ph: "Type of place",
    zone_name_ph: "Name",
    zone_landmark_ph: "Useful landmark (optional) — e.g. opposite the pharmacy",
    zone_next: "Next",
    zone_recap_title: "Check before sending",
    zone_recap_sub: "A Yoonou admin validates this place before it appears for everyone.",
    zone_send: "Send",
    zone_edit: "Edit",
    zone_thanks: "Thank you!",
    zone_thanks_sub: "Your place will be visible to everyone once validated by Yoonou.",
    zone_again: "Add another place",
    zone_done: "Back",
    zone_geo_error: "Could not get your position. Check that location is allowed.",
    zone_no_result: "No result. Move the map to the spot: this is exactly the place to add.",
    zone_duplicate: "This place already exists here.",
    help_back: "← Back",
    help_title: "What do you need help with?",
    help_urgent: "Emergency / safety",
    help_urgent_desc: "Danger, accident, assault: the team is alerted right away with your position.",
    help_history_client: "My rides and orders",
    help_history_driver: "My deliveries",
    help_more: "See more",
    help_other: "Other",
    help_other_title: "Another problem",
    help_other_desc: "Account, app, commission payment…",
    help_details_ph: "Explain in a few words (optional)",
    help_send_wa: "Send on WhatsApp",
    help_send_app: "Send to the team in the app",
    help_close: "Close",
    pos_search_ph: "Search for a place or an address",
    pos_sub: "Place the pin exactly where you want to be delivered, then send.",
    pos_landmark_ph: "Useful landmark (optional) — e.g. blue gate, opposite the pharmacy",
    pos_send: "Send my location",
    pos_done_title: "Thank you!",
    pos_done_sub: "Your location has been sent. You can close this page."
  },

  wo: {
    // ⚠️ Traductions wolof — première version IA, à faire valider par un
    // locuteur natif avant lancement public.
    nav_login: "Dugg",
    nav_signup: "Bind",
    nav_start: "Tambali",
    lang_switcher_label: "Làkk",

    auth_tab_login: "Dugg",
    auth_tab_signup: "Bind",
    auth_login_phone: "Nimero telefon",
    auth_login_password: "Baatub tëriim",
    auth_login_btn: "Dugg",
    auth_login_error: "Nimero telefon walla baatub tëriim baaxul.",
    auth_role_client: "Kiliyaan",
    auth_role_transporteur: "Yóbbukat",
    auth_prenom: "Tur",
    auth_nom: "Sant",
    auth_phone: "Nimero telefon",
    auth_phone_confirm: "Dëggal nimero telefon bi",
    auth_phone_mismatch: "Ñaari nimero yi feeñuñu benn.",
    auth_password: "Baatub tëriim (6 mbind yu ndaw)",
    auth_ville: "Dëkk",
    auth_signup_btn: "Sos sama compte",
    auth_back_home: "← Dellu ci kër gi",

    home_eyebrow: "🇸🇳 Juddu ci Senegaal · Am na léegi",
    home_hero_title_1: "Say yëf am nañu fu ñu jëm.",
    home_hero_title_2: "Yoonou moo leen di won yoon wi.",
    home_hero_meaning: "« Yoonou » mooy « yoon wi » ci wolof.",
    home_hero_lead: "Li ci ndaw ba ci kamiyoŋ bu mag, ci benn plateforme rekk. Weer, moto, tricycle, sarret, oto, SUV, minivan, pick-up, kamiyoŋet walla kamiyoŋ: benn yóbbukat dañuy jël say yëf, foo mën a nekk ci Senegaal.",
    home_hero_cta_primary: "🚀 Tambali léegi",
    home_hero_cta_secondary: "Xool ni mu doxe"
  }
};

function yoonouGetLang(){
  return localStorage.getItem('yoonou_lang') || 'fr';
}

function yoonouSetLang(lang){
  localStorage.setItem('yoonou_lang', lang);
  yoonouApplyTranslations();
  yoonouUpdateSwitcherUI();
}

function yoonouApplyTranslations(){
  const lang = yoonouGetLang();
  const dict = YOONOU_TRANSLATIONS[lang] || YOONOU_TRANSLATIONS.fr;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.textContent = dict[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (dict[key]) el.placeholder = dict[key];
  });
  document.documentElement.lang = lang;
}

function yoonouUpdateSwitcherUI(){
  const lang = yoonouGetLang();
  document.querySelectorAll('.yoonou-lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
}

function yoonouInjectLangSwitcher(containerId){
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <button type="button" class="yoonou-lang-btn" data-lang="fr">FR</button>
    <button type="button" class="yoonou-lang-btn" data-lang="en">EN</button>
    <button type="button" class="yoonou-lang-btn" data-lang="wo">WO</button>
  `;
  container.querySelectorAll('.yoonou-lang-btn').forEach(btn => {
    btn.addEventListener('click', () => yoonouSetLang(btn.dataset.lang));
  });
  yoonouUpdateSwitcherUI();
}

document.addEventListener('DOMContentLoaded', () => {
  yoonouApplyTranslations();
});
