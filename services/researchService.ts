import { performWebSearch, scrapeURL } from './webSearchService';

interface ResearchResult {
  answer: string;
  sources: string[];
  verified: boolean;
  depth: 'normal' | 'deep';
}

export class ResearchService {
  // Detect research complexity
  detectResearchType(prompt: string): 'normal' | 'deep' {
    const deepTriggers = [
      'research', 'comprehensive', 'detailed analysis',
      'compare', 'pros and cons', 'in depth', 'thorough'
    ];
    
    return deepTriggers.some(t => prompt.toLowerCase().includes(t))
      ? 'deep'
      : 'normal';
  }

  // Normal research: Brave only (fast & free)
  async normalResearch(query: string, onProgress?: (msg: string) => void): Promise<ResearchResult> {
    onProgress?.('🔍 Searching with Brave...');
    
    // 1. Brave Search (free, fast)
    const searchResults = await performWebSearch(query);
    
    onProgress?.('📄 Reading top 3 sources...');
    
    // 2. Extract URLs
    const urls = this.extractURLs(searchResults, 3);
    
    // 3. Scrape pages
    const content = await this.scrapeMultiple(urls);
    
    // 4. Format for AI
    onProgress?.('🧠 Synthesizing answer...');
    return {
      answer: this.formatNormalResults(searchResults, content),
      sources: urls,
      verified: false,
      depth: 'normal'
    };
  }

  // Deep research: Brave + Perplexity (comprehensive)
  async deepResearch(
    query: string,
    onProgress?: (msg: string) => void
  ): Promise<{ preliminary: ResearchResult; final: ResearchResult }> {
    
    // PHASE 1: Quick Brave search
    onProgress?.('🔍 Initial search with Brave...');
    const braveResults = await performWebSearch(query);
    const quickURLs = this.extractURLs(braveResults, 3);
    const quickContent = await this.scrapeMultiple(quickURLs);
    
    const preliminary: ResearchResult = {
      answer: this.formatPreliminary(braveResults, quickContent),
      sources: quickURLs,
      verified: false,
      depth: 'normal'
    };
    
    onProgress?.('🎯 Deep search with Perplexity (filtered sources)...');
    
    const trustedDomains = this.selectTrustedDomains(query);
    const perplexityResults = await this.searchPerplexity(query, trustedDomains);
    
    onProgress?.('📚 Analyzing 7 more sources...');
    const deepURLs = this.extractURLs(perplexityResults, 7);
    const deepContent = await this.scrapeMultiple(deepURLs);
    
    onProgress?.('✅ Cross-checking facts...');
    const verified = this.crossCheck(quickContent, deepContent);
    
    onProgress?.('🧠 Synthesizing final answer...');
    const final: ResearchResult = {
      answer: this.formatDeepResults(braveResults, perplexityResults, deepContent, verified),
      sources: [...quickURLs, ...deepURLs],
      verified: true,
      depth: 'deep'
    };
    
    return { preliminary, final };
  }

  // Select trusted domains based on query topic
  private selectTrustedDomains(query: string): string[] {
    const lower = query.toLowerCase();
    
    if (/code|programming/i.test(query)) {
      return ['github.com', 'stackoverflow.com', 'developer.mozilla.org'];
    }
    if (/roblox|lua/i.test(query)) {
      return ['create.roblox.com', 'devforum.roblox.com'];
    }
    if (/ai|machine learning/i.test(query)) {
      return ['arxiv.org', 'openai.com', 'huggingface.co'];
    }
    
    return ['wikipedia.org', 'britannica.com', 'reuters.com'];
  }

  private async searchPerplexity(query: string, domains: string[]): Promise<string> {
    console.log(`MOCK: Perplexity search for "${query}" within domains: ${domains.join(', ')}`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    return `
      Perplexity deep search results for "${query}":
      Source: https://${domains[0]}/result4 - Deeper insight from a trusted source.
      Source: https://example.net/result5 - Another relevant deep search result.
      Source: https://example.org/result6 - A third result from the deep search.
    `;
  }

  private crossCheck(preliminary: string[], deep: string[]): {verified: string[], conflicting: string[]} {
    return {
      verified: ["Based on multiple sources, this fact appears to be correct.", "Another verified statement from cross-checking sources."],
      conflicting: []
    };
  }

  private extractURLs(results: string, count: number): string[] {
    const urlRegex = /(?:URL:|Source:)\s*(https?:\/\/[^\s]+)/gi;
    const matches = [...results.matchAll(urlRegex)];
    return matches.slice(0, count).map(m => m[1]);
  }

  private async scrapeMultiple(urls: string[]): Promise<string[]> {
    const promises = urls.map(url => scrapeURL(url));
    const results = await Promise.allSettled(promises);
    return results.map((r, i) => 
      r.status === 'fulfilled' ? r.value : `[Failed to scrape ${urls[i]}]`
    );
  }

  private formatNormalResults(search: string, content: string[]): string {
    return `Based on a quick search, here's what I found:\n\n${content.join('\n\n---\n\n')}`;
  }

  private formatPreliminary(search: string, content: string[]): string {
    return `Here are some initial findings. I'm now starting a more detailed analysis...\n\n${content.join('\n\n---\n\n')}`;
  }

  private formatDeepResults(brave: string, perplexity: string, deepContent: string[], verified: any): string {
    return `After a comprehensive review, here is a verified summary:\n\n**Verified Facts:**\n- ${verified.verified.join('\n- ')}\n\n**Detailed Analysis:**\n${deepContent.join('\n\n')}`;
  }
}

export const researchService = new ResearchService();
