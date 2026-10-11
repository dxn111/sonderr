// Chat-model filter: the model picker must only offer real conversation
// models. A content-safety classifier answers a greeting with its verdict
// ("User Safety: safe"), which looks like Sonderr refusing to answer, so
// guard/moderation/embedding/speech/image models are filtered from discovery.
const assert = require("assert");
const { isChatModel } = require("../server/provider");

// Real chat models stay in the picker — including chat Nemotron variants.
const chat = [
  "deepseek-chat:free",
  "qwen/qwen3-235b-a22b:free",
  "gpt-4o",
  "claude-sonnet-4",
  "mistral-7b-instruct",
  "meta-llama/llama-3.1-nemotron-70b-instruct",
  "nvidia/llama-3.1-nemotron-ultra-253b-v1:free",
  "gemini-2.5-flash",
  "glm-4.5-air:free"
];
for (const id of chat) assert.ok(isChatModel(id), id + " should stay in the chat picker");

// Non-chat models are filtered: safety classifiers, guards, moderation,
// embedders, rerankers, speech, image generation, and classic encoders.
const nonChat = [
  "nvidia/nemotron-3.5-content-safety",
  "meta-llama/llama-guard-4-12b",
  "qwen/qwen3-guard-4b",
  "google/shieldgemma-2-9b",
  "nvidia/aegis-guard-2",
  "openai/omni-moderation-latest",
  "toxicity-classifier-v2",
  "sentiment-analysis-base",
  "text-embedding-3-large",
  "baai/bge-reranker-v2-m3",
  "openai/whisper-large-v3",
  "openai/tts-1",
  "speech-to-text-flash",
  "dall-e-3",
  "stabilityai/stable-diffusion-xl",
  "black-forest-labs/flux-1-schnell:free"
];
for (const id of nonChat) assert.ok(!isChatModel(id), id + " should be filtered from the chat picker");

assert.equal(isChatModel(""), false);
assert.equal(isChatModel(null), false);

console.log("chat model filter tests passed");
