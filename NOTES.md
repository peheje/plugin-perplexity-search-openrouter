# Notes

## What this repo does

- This TypingMind plugin exposes a tool named `search_via_perplexity_openrouter`.
- When the active chat model decides it needs web search, TypingMind calls the plugin tool.
- The plugin then makes a second OpenRouter request to `perplexity/sonar`.
- `perplexity/sonar` performs search and synthesis itself, then returns a text answer plus citations.
- That synthesized tool output is fed back into the original TypingMind conversation.

## Architecture comparison

### 1. Plain OpenRouter model call

```text
TypingMind model -> plugin -> OpenRouter -> gpt-5.4-mini -> answer
```

- No web search happens.
- This is just a normal second model call.

### 2. Search-native model call

```text
TypingMind model -> plugin -> OpenRouter -> perplexity/sonar -> search + answer
```

- Search happens inside the target model.
- This is what this repo does today.

### 3. Normal model plus OpenRouter web plugin

```text
TypingMind model -> plugin -> OpenRouter + web plugin -> gpt-5.4-mini -> answer
```

- OpenRouter fetches web results and injects them into the inner model call.
- The inner model synthesizes an answer from those results.
- We built and tested this design in a separate repo, but results were not promising enough.

### 4. Direct `:online` model usage

```text
TypingMind -> OpenRouter + web plugin -> current model -> answer
```

- This skips the TypingMind tool/plugin hop.
- It is convenient, but search augmentation is attached to each request for that model.

## Key findings

### `:online` works in TypingMind

- Manually appending `:online` to an imported OpenRouter model in TypingMind works.
- Example: `openai/gpt-5.4-mini:online`.

### `:online` appears to add web-search context on every request

- We confirmed this empirically with OpenRouter activity data.
- Same prompt, same model family, but `:online` showed a major jump in tokens and cost.
- Example test:
  - normal request: about 55 tokens, about $0.0000908
  - `:online` request: about 4,491 tokens, about $0.000567
- Practical conclusion: `:online` is simple and useful, but expensive to leave on all the time.

### Why the Perplexity plugin feels better than the OpenRouter-web-plugin wrapper

- `perplexity/sonar` is a specialized search-native model.
- Our OpenRouter web-plugin experiment used a general model plus injected search results.
- In a TypingMind tool flow, the inner model does not know its output is tool evidence for another model.
- That mismatch hurts quality because the inner model writes a final-style answer instead of compact search evidence.

### Why the OpenRouter web-plugin wrapper is awkward in TypingMind

- The TypingMind chat model decides to call a tool.
- The tool then makes a second OpenRouter call with `plugins: [{ id: "web" }]`.
- That inner call returns a synthesized answer, not raw search hits.
- The original model then reasons over another model's answer instead of over raw evidence.

## Alternative directions we explored

### A. Keep using search-native models

- This repo already does that with `perplexity/sonar`.
- We also investigated whether OpenRouter has other search-native or search-specialized models.

Relevant OpenRouter options we found:

- `perplexity/sonar`
- `perplexity/sonar-pro`
- `perplexity/sonar-pro-search`
- `perplexity/sonar-deep-research`
- `openai/gpt-4o-mini-search-preview`
- `openai/gpt-4o-search-preview`
- `openai/o4-mini-deep-research`
- `openai/o3-deep-research`
- xAI Grok models with native web search support via OpenRouter

Cost signal from the live OpenRouter catalog suggested:

- `perplexity/sonar` remains one of the cheaper true search-native options.
- OpenAI search-preview models may be more expensive than Sonar.
- xAI Grok native web search looked closer to Sonar pricing.

### B. Use OpenRouter web search plugin inside a TypingMind plugin

- We built this in a separate repo: `peheje/plugin-web-search-openrouter`.
- It used OpenRouter's `web` plugin with configurable engines, then later a simplified Exa-only version.
- It worked technically, but testing showed weaker results than both `:online` and Perplexity for the target use case.

### C. Build a raw-results search plugin

- This is now the cleanest architectural alternative.
- Idea: plugin calls a search API directly and returns raw results like title, URL, snippet, maybe date.
- Then the active TypingMind chat model does the reasoning itself.
- Benefits:
  - no second synthesizer model
  - lower cost
  - lower latency
  - cleaner tool output
- Tradeoff: likely requires an additional API key for the search provider.

## Search providers discussed for a raw-results plugin

- SerpAPI
- Exa direct API
- Brave Search API
- Tavily API
- Firecrawl direct API

Important distinction:

- These would usually require their own API keys.
- They do not require logging into a personal Google account.

### Notes on SerpAPI

- SerpAPI is a search API provider, not Google account OAuth.
- The plugin would use a SerpAPI key.
- SerpAPI returns structured search results from engines like Google.
- It can log API usage and queries like any API provider, but it does not need access to a user's private Google account.
- TypingMind already documents a SerpAPI-based plugin pattern.

## TypingMind plugin capability findings

- TypingMind plugins are tool-style extensions.
- They can provide external tools, plugin context, HTTP actions, JavaScript implementations, and MCP servers.
- They can receive tool parameters, user settings, limited resources, and return output.
- We did not find support for intercepting or rewriting the current outgoing model request.
- We did not find support for changing the active chat model to `:online` from inside a plugin.

Practical conclusion:

- A plugin probably cannot transparently rewrite the current model call to append `:online`.
- So a "flip the active model to search mode for just this turn" plugin is likely not supported.

## Current recommendation

Best options, in order:

1. Build a raw-results search plugin.
2. Keep using search-native OpenRouter models when needed.
3. Avoid using `:online` as a blanket default, since it appears to add significant token and cost overhead.

## Existing extra repo created during investigation

- Repo: `https://github.com/peheje/plugin-web-search-openrouter`
- This repo was created and pushed during testing.
- It is separate from this repo.

## Short summary

- This plugin works because it uses `perplexity/sonar`, which is a search-native model.
- Plain OpenRouter model calls do not search unless `:online` or `plugins: [{ id: "web" }]` is used.
- `:online` works in TypingMind, but testing strongly suggests it adds web-search context and token overhead on every request.
- A TypingMind plugin that wraps OpenRouter's web plugin is architecturally awkward because it returns a synthesized inner-model answer rather than raw evidence.
- The most promising future direction is a raw-results search plugin.
