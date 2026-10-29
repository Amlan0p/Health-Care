'use strict';
/**
 * Deterministic emergency detection. This is intentionally NOT AI-based: it runs before/independently
 * of the model so an emergency notice is shown even if the AI service is down or omits a warning.
 * It errs on the side of showing guidance (informational questions may trigger it too).
 */
const RULES = [
  {
    category: 'self_harm',
    re: /\b(suicid\w*|kill (myself|my self)|end (my|my own) life|want to die|self[- ]?harm|hurt myself)\b/i,
    title: 'You are not alone — help is available right now',
    message: 'If you are thinking about harming yourself, please reach out to someone immediately. In an emergency call 112. You can also call Tele-MANAS 14416 or iCall 9152987821 to talk to a trained counsellor.',
    actions: [
      { label: 'Call 112', tel: '112' },
      { label: 'Tele-MANAS 14416', tel: '14416' },
      { label: 'iCall 9152987821', tel: '9152987821' },
    ],
  },
  {
    category: 'cardiac_respiratory',
    re: /\b(chest (pain|pressure|tightness)|heart attack|(can('|’)?t|cannot|unable to|struggling to|difficulty) breath\w*|not breathing|shortness of breath|severe breathlessness)\b/i,
    title: 'This may be a medical emergency',
    message: 'If you or someone near you has these symptoms right now, call 112 or 102 for an ambulance immediately. Do not wait for an online answer.',
    actions: [{ label: 'Call 112', tel: '112' }, { label: 'Ambulance 102', tel: '102' }],
  },
  {
    category: 'stroke',
    re: /\b(stroke|face (is )?droop\w*|slurred speech|sudden (weakness|numbness|confusion|loss of vision))\b/i,
    title: 'Possible stroke signs need urgent care',
    message: 'Sudden weakness, facial drooping, speech trouble or confusion need emergency care immediately. Call 112 or 102 now and note the time symptoms began.',
    actions: [{ label: 'Call 112', tel: '112' }, { label: 'Ambulance 102', tel: '102' }],
  },
  {
    category: 'urgent_other',
    re: /\b(overdos\w*|poison\w*|unconscious|unresponsive|seizure|convulsion\w*|severe(ly)? bleeding|bleeding (heavily|a lot|profusely)|anaphyla\w*|swallowed (a )?(battery|bleach|pesticide))\b/i,
    title: 'This may need emergency care',
    message: 'If this is happening now, call 112 or 102 immediately. For poisoning you can also contact a poison control centre or the nearest emergency department.',
    actions: [{ label: 'Call 112', tel: '112' }, { label: 'Ambulance 102', tel: '102' }],
  },
];

function detectEmergency(text) {
  if (typeof text !== 'string') return null;
  for (const r of RULES) {
    if (r.re.test(text)) return { category: r.category, title: r.title, message: r.message, actions: r.actions };
  }
  return null;
}

/** Emergency notice for the symptom checker when red-flag symptoms are selected. */
function symptomEmergency() {
  return {
    category: 'symptom_red_flag',
    title: 'Some selected symptoms can be serious',
    message: 'Chest pain or breathlessness can signal an emergency. If these are severe, sudden or getting worse, call 112 or 102 right away instead of waiting for the analysis.',
    actions: [{ label: 'Call 112', tel: '112' }, { label: 'Ambulance 102', tel: '102' }],
  };
}

module.exports = { detectEmergency, symptomEmergency };
