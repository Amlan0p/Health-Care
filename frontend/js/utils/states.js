import { esc } from './dom.js';
import { icon } from '../components/icons.js';

// Consistent loading / error markup so a failed request is never shown as an empty list.
export const loadingHtml = (text = 'Loading…') =>
  `<div class="state-box">${icon('loader-circle', 'icon-spin')} ${esc(text)}</div>`;

export const errorHtml = (message, retryKey) =>
  `<div class="state-box" role="alert">${icon('circle-alert')} ${esc(message)}<br>${retryKey ? `<button type="button" class="btn-retry" data-action="retry" data-arg="${esc(retryKey)}">${icon('refresh-cw')} Try again</button>` : ''}</div>`;

export const emptyHtml = (html) =>
  `<div style="text-align:center;padding:20px;color:var(--text-dimmer);font-size:0.85rem;">${html}</div>`;
