import { byId, esc } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import { sendChat, getChatHistory, clearChatHistory } from '../../api/ai.js';
import { toast } from '../../components/toast.js';
import { emergencyHtml } from '../symptoms/symptoms.js';

let welcomeHtml = '';
let busy = false;

/**
 * Safe renderer for AI text: everything is HTML-escaped FIRST, then a tiny markdown subset
 * (**bold**, *italic*, "- " bullets, line breaks) is applied. Model output can never inject markup.
 */
export function formatAiText(raw) {
  let t = esc(raw);
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  t = t.replace(/^\s*[-*•] (.+)$/gm, '• $1');
  t = t.replace(/\n/g, '<br>');
  return t.replace(/(Always consult a qualified doctor[^<]*?\.)/i, `<span class="disclaimer">${icon('triangle-alert')} $1</span>`);
}

const avatar = (kind) => (kind === 'user' ? `<div class="msg-avatar user-av">${icon('user')}</div>` : `<div class="msg-avatar ai">${icon('heart-pulse')}</div>`);

function addMessage(kind, innerHtml, { raw = false } = {}) {
  const box = byId('chatMessages');
  const div = document.createElement('div');
  div.className = `msg ${kind === 'user' ? 'user' : 'ai'}`;
  div.innerHTML = `${avatar(kind)}<div class="msg-bubble">${innerHtml}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}
const userHtml = (text) => esc(text).replace(/\n/g, '<br>');

export function initChat() {
  welcomeHtml = byId('chatMessages').innerHTML;
  byId('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });
}

/** Loads THIS user's stored conversation from the server (never shared with other accounts). */
export async function loadChatHistory() {
  const box = byId('chatMessages');
  box.innerHTML = welcomeHtml;
  try {
    const messages = await getChatHistory();
    for (const m of messages) addMessage(m.role === 'user' ? 'user' : 'ai', m.role === 'user' ? userHtml(m.content) : formatAiText(m.content));
  } catch { /* history is optional; the chat still works */ }
}
export function resetChatView() { if (welcomeHtml) byId('chatMessages').innerHTML = welcomeHtml; }

export async function clearChat() {
  try { await clearChatHistory(); resetChatView(); toast('Chat history deleted.'); }
  catch (err) { toast(err.message, 'error'); }
}

export async function sendMsg({ text, includeVitals = false } = {}) {
  if (busy) return;
  const input = byId('chatInput');
  const message = (text ?? input.value).trim();
  if (!message) return;
  input.value = '';
  busy = true; byId('sendBtn').disabled = true;
  addMessage('user', userHtml(message));
  const typing = addMessage('ai', `<span style="opacity:.6">Analysing your question… ${icon('search')}</span>`);
  try {
    const { reply, emergency } = await sendChat(message, includeVitals);
    typing.remove();
    if (emergency) addMessage('ai', emergencyHtml(emergency));
    addMessage('ai', formatAiText(reply));
  } catch (err) {
    typing.remove();
    // The AI failing is stated plainly; no canned "answer" is ever shown in its place.
    const wait = err.retryAfterSeconds ? ` Please wait about ${err.retryAfterSeconds} seconds.` : '';
    addMessage('ai', `<span style="color:#c53030">${icon('circle-alert')} ${esc(err.message)}${esc(wait)}</span><br><span style="font-size:.8em;opacity:.8">Your message was not answered. If this is urgent or an emergency, call 112.</span>`);
  } finally {
    busy = false; byId('sendBtn').disabled = false; byId('chatInput').focus();
  }
}
export const askQuick = ({ arg, dataset }) => { sendMsg({ text: arg, includeVitals: dataset.includeVitals === 'true' }); };
