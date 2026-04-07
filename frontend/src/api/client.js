import axios from 'axios';

const API_BASE = 'http://localhost:8000/api';

const client = axios.create({
  baseURL: API_BASE,
  timeout: 30000, // 30 seconds (Claude API is fast)
});

// Market endpoints
export const getMarketSummary = async () => {
  const { data } = await client.get('/market/summary');
  return data;
};

export const getStateRankings = async () => {
  const { data } = await client.get('/market/states');
  return data;
};

// Location data
export const getLocationData = async (state) => {
  const { data } = await client.get(`/location/${state}`);
  return data;
};

// Project calculator
export const calculateProjectEconomics = async (params) => {
  const { data } = await client.post('/calculate', params);
  return data;
};

// Reference scenarios
export const getReferenceScenarios = async () => {
  const { data } = await client.get('/scenarios');
  return data;
};

// Research context
export const getResearchContext = async () => {
  const { data } = await client.get('/research/context');
  return data;
};

// AI Chat
export const sendChatMessage = async (messages, calculatorState = {}) => {
  const { data } = await client.post('/chat', {
    messages,
    calculator_state: calculatorState,
  });
  return data;
};

// Health check
export const healthCheck = async () => {
  const { data } = await client.get('/health');
  return data;
};

export default client;
