import { byId, $, $$, esc } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import { loadData } from '../../utils/data.js';
import { loadingHtml, errorHtml } from '../../utils/states.js';
import { getSymptoms } from '../../api/content.js';
import { analyzeSymptoms } from '../../api/ai.js';

let busy = false;

export async function loadSymptoms() {
  const grid = byId('symptomGrid');
  grid.innerHTML = loadingHtml('Loading symptoms…');
  try {
    const { symptoms } = await getSymptoms();
    grid.innerHTML = symptoms.map((s) =>
      `<button type="button" class="symptom-tag" data-action="toggle-symptom" data-id="${esc(s.id)}" aria-pressed="false"><span class="emoji">${icon(s.icon)}</span>${esc(s.label)}</button>`).join('');
  } catch (err) { grid.innerHTML = errorHtml(`Could not load symptoms. ${err.message}`, 'symptoms'); }
}

export async function loadRisks() {
  const box = byId('commonRisks');
  try {
    const { risks } = await loadData('health-risks');
    box.innerHTML = risks.map((r) =>
      `<div class="common-risk"><div class="common-risk-title">${icon(r.icon)} ${esc(r.title)}</div><div class="common-risk-desc">${esc(r.desc)}</div></div>`).join('');
  } catch { box.innerHTML = '<div class="state-box">Could not load this section.</div>'; }
}

export function toggleSymptom(el) {
  const on = el.classList.toggle('selected');
  el.setAttribute('aria-pressed', String(on));
}

export function emergencyHtml(e) {
  if (!e) return '';
  const actions = (e.actions || []).map((a) => `<a href="tel:${esc(a.tel)}">${icon('phone')}&nbsp;${esc(a.label)}</a>`).join('');
  return `<div class="emergency-alert" role="alert"><strong>${icon('siren')} ${esc(e.title)}</strong>${esc(e.message)}<div class="em-actions">${actions}</div></div>`;
}

const SEV = {
  high: { cls: 'high', pct: 80, label: 'High Severity', color: '#e53e3e' },
  medium: { cls: 'medium', pct: 50, label: 'Moderate Severity', color: '#d97706' },
  low: { cls: '', pct: 25, label: 'Low Severity', color: '#16a34a' },
};

export async function checkSymptoms() {
  const selected = $$('.symptom-tag.selected').map((el) => el.dataset.id);
  const result = byId('symptomResult'); const btn = $('.check-btn');
  result.classList.add('show');
  if (!selected.length) { result.innerHTML = '<p style="color:var(--text-body);">Please select at least one symptom.</p>'; return; }
  if (busy) return;
  busy = true; btn.disabled = true; btn.textContent = 'Analysing…';
  result.innerHTML = `<div class="state-box" style="text-align:left;padding:6px 0;">${icon('loader-circle', 'icon-spin')} Asking the AI service…</div>`;
  try {
    const { result: r, emergency, disclaimer } = await analyzeSymptoms(selected);
    const sev = SEV[r.mostLikely.severity] || SEV.low;
    let html = emergencyHtml(emergency) + `
      <div style="margin-bottom:10px;"><span style="font-size:0.7rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-dimmer);font-family:'Nunito',sans-serif;">Possible condition (AI suggestion)</span>
      <div style="font-family:'Nunito',sans-serif;font-weight:800;font-size:1rem;color:var(--text-dark);margin-top:3px;">${esc(r.mostLikely.name)}</div></div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <div class="severity-bar" style="flex:1;margin-bottom:0;"><div class="severity-fill ${sev.cls}" style="width:${sev.pct}%;"></div></div>
        <span style="font-size:0.72rem;font-weight:700;color:${sev.color};white-space:nowrap;">${icon('circle', 'dot')} ${sev.label}</span></div>
      <p style="font-size:0.82rem;color:var(--text-body);margin-bottom:10px;line-height:1.6;">${esc(r.mostLikely.advice)}</p>`;
    if (r.alsoConsider.length) html += `<p style="font-size:0.75rem;color:var(--text-dimmer);margin-bottom:8px;"><strong style="color:var(--text-body);">Also consider:</strong> ${r.alsoConsider.map(esc).join(', ')}</p>`;
    if (r.warning) html += `<div style="padding:8px 12px;background:rgba(229,62,62,0.08);border-left:3px solid #e53e3e;border-radius:6px;font-size:0.8rem;color:#c53030;margin-bottom:8px;">${icon('triangle-alert')} ${esc(r.warning)}</div>`;
    html += `<div style="padding:8px 12px;background:rgba(245,158,11,0.08);border-left:3px solid #f59e0b;border-radius:6px;font-size:0.78rem;color:#b45309;">${icon('triangle-alert')} ${esc(disclaimer)}</div>`;
    result.innerHTML = html;
  } catch (err) {
    // Real failure message, plus deterministic emergency guidance when red-flag symptoms were selected.
    const red = selected.some((id) => ['chest-pain', 'breathlessness'].includes(id));
    result.innerHTML = (red ? emergencyHtml({ title: 'Some selected symptoms can be serious', message: 'Chest pain or breathlessness can signal an emergency. If severe, sudden or worsening, call 112 or 102 now.', actions: [{ label: 'Call 112', tel: '112' }, { label: 'Ambulance 102', tel: '102' }] }) : '')
      + `<p style="font-size:0.85rem;color:#c53030;">${icon('circle-alert')} ${esc(err.message || 'The AI analysis is unavailable right now.')} You can try again, or consult a doctor.</p>`;
  } finally {
    busy = false; btn.disabled = false; btn.textContent = 'Analyse Symptoms';
  }
}
