import { request } from './client.js';
const AI_TIMEOUT = 45000; // the backend allows the provider ~20s; leave headroom for retries/latency
export const sendChat = (message, includeVitals = false) => request('/chat', { method: 'POST', body: { message, includeVitals }, timeoutMs: AI_TIMEOUT });
export const getChatHistory = async () => (await request('/chat/history')).messages;
export const clearChatHistory = () => request('/chat/history', { method: 'DELETE' });
export const analyzeSymptoms = (symptoms) => request('/symptoms/analyze', { method: 'POST', body: { symptoms }, timeoutMs: AI_TIMEOUT });
