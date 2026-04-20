/**
 * Screen Matcher - Match current screen to graph nodes during execution
 */

import type { FlowNode, Selector } from '@ghostrun/core';

export interface MatchContext {
  url: string;
  title: string;
  elements: MatchElement[];
}

export interface MatchElement {
  selector: string;
  selectorType: 'css' | 'xpath' | 'text' | 'role' | 'testid';
  text?: string;
  isVisible: boolean;
}

export interface MatchResult {
  nodeId: string;
  confidence: number;
  matchType: 'exact' | 'partial' | 'fuzzy';
  matchedBy: Array<{
    field: string;
    value: string;
    confidence: number;
  }>;
}

/**
 * Match current screen to a node
 */
export function matchScreen(context: MatchContext, node: FlowNode): MatchResult | null {
  const matchedBy: Array<{ field: string; value: string; confidence: number }> = [];
  let totalConfidence = 0;

  // Match URL
  if (node.data.url) {
    const urlMatch = matchUrl(context.url, node.data.url);
    if (urlMatch.confidence > 0) {
      matchedBy.push({ field: 'url', value: node.data.url, confidence: urlMatch.confidence });
      totalConfidence += urlMatch.confidence;
    }
  }

  // Match URL pattern
  if (node.data.urlPattern) {
    const patternMatch = matchUrlPattern(context.url, node.data.urlPattern);
    if (patternMatch.confidence > 0) {
      matchedBy.push({ field: 'urlPattern', value: node.data.urlPattern, confidence: patternMatch.confidence });
      totalConfidence += patternMatch.confidence;
    }
  }

  // Match title
  if (node.data.title) {
    const titleMatch = matchTitle(context.title, node.data.title);
    if (titleMatch.confidence > 0) {
      matchedBy.push({ field: 'title', value: node.data.title, confidence: titleMatch.confidence });
      totalConfidence += titleMatch.confidence;
    }
  }

  // Match selectors
  if (node.data.selectors && node.data.selectors.length > 0) {
    const selectorMatch = matchSelectors(context.elements, node.data.selectors);
    if (selectorMatch.confidence > 0) {
      matchedBy.push({ field: 'selectors', value: `${selectorMatch.matchedCount} selectors`, confidence: selectorMatch.confidence });
      totalConfidence += selectorMatch.confidence;
    }
  }

  // Calculate final confidence
  const avgConfidence = matchedBy.length > 0 ? totalConfidence / matchedBy.length : 0;

  if (matchedBy.length === 0) {
    return null;
  }

  let matchType: 'exact' | 'partial' | 'fuzzy' = 'fuzzy';
  if (avgConfidence >= 0.9 && matchedBy.length >= 2) {
    matchType = 'exact';
  } else if (avgConfidence >= 0.5) {
    matchType = 'partial';
  }

  return {
    nodeId: node.id,
    confidence: avgConfidence,
    matchType,
    matchedBy,
  };
}

/**
 * Match URL against pattern
 */
function matchUrl(actualUrl: string, expectedUrl: string): { confidence: number } {
  if (actualUrl === expectedUrl) {
    return { confidence: 1.0 };
  }

  // Check if expected URL is a substring
  if (actualUrl.includes(expectedUrl) || expectedUrl.includes(actualUrl)) {
    return { confidence: 0.7 };
  }

  // Compare domains
  try {
    const actual = new URL(actualUrl);
    const expected = new URL(expectedUrl);
    
    if (actual.hostname === expected.hostname) {
      if (actual.pathname === expected.pathname) {
        return { confidence: 0.9 };
      }
      // Check if path segments match
      const actualParts = actual.pathname.split('/').filter(Boolean);
      const expectedParts = expected.pathname.split('/').filter(Boolean);
      
      let matchingParts = 0;
      for (let i = 0; i < Math.min(actualParts.length, expectedParts.length); i++) {
        if (actualParts[i] === expectedParts[i]) {
          matchingParts++;
        } else if (/^\d+$/.test(expectedParts[i]) || /^[a-f0-9-]+$/i.test(expectedParts[i])) {
          // Allow numeric/UUID path segments to match
          matchingParts++;
        }
      }
      
      if (expectedParts.length > 0) {
        return { confidence: matchingParts / expectedParts.length };
      }
    }
  } catch {
    // URL parsing failed
  }

  return { confidence: 0 };
}

/**
 * Match URL against regex pattern
 */
function matchUrlPattern(url: string, pattern: string): { confidence: number } {
  try {
    const regex = new RegExp(pattern);
    if (regex.test(url)) {
      return { confidence: 0.95 };
    }
  } catch {
    // Invalid regex
  }
  return { confidence: 0 };
}

/**
 * Match page title
 */
function matchTitle(actualTitle: string, expectedTitle: string): { confidence: number } {
  const actual = actualTitle.toLowerCase();
  const expected = expectedTitle.toLowerCase();

  if (actual === expected) {
    return { confidence: 1.0 };
  }

  if (actual.includes(expected) || expected.includes(actual)) {
    return { confidence: 0.7 };
  }

  // Word overlap
  const actualWords = new Set(actual.split(/\s+/).filter(w => w.length > 2));
  const expectedWords = new Set(expected.split(/\s+/).filter(w => w.length > 2));
  
  let overlap = 0;
  for (const word of expectedWords) {
    if (actualWords.has(word)) {
      overlap++;
    }
  }

  if (expectedWords.size > 0) {
    return { confidence: overlap / expectedWords.size };
  }

  return { confidence: 0 };
}

/**
 * Match elements on page
 */
function matchSelectors(
  elements: MatchElement[],
  selectors: Selector[]
): { confidence: number; matchedCount: number } {
  let matchedCount = 0;

  for (const selector of selectors) {
    const found = elements.some(el => {
      if (el.selectorType !== selector.type) return false;
      
      switch (selector.type) {
        case 'css':
        case 'xpath':
          return el.selector === selector.value;
        case 'text':
          return el.text?.includes(selector.value);
        case 'role':
        case 'testid':
          return el.selector === selector.value;
        default:
          return false;
      }
    });

    if (found) {
      matchedCount++;
    }
  }

  if (selectors.length === 0) {
    return { confidence: 0, matchedCount: 0 };
  }

  return {
    confidence: matchedCount / selectors.length,
    matchedCount,
  };
}

/**
 * Find best matching node for current screen
 */
export function findBestMatch(
  context: MatchContext,
  nodes: FlowNode[]
): MatchResult | null {
  const screenNodes = nodes.filter(n => n.type === 'screen' || n.type === 'start');
  
  let bestMatch: MatchResult | null = null;
  let bestConfidence = 0;

  for (const node of screenNodes) {
    const result = matchScreen(context, node);
    if (result && result.confidence > bestConfidence) {
      bestConfidence = result.confidence;
      bestMatch = result;
    }
  }

  return bestConfidence >= 0.3 ? bestMatch : null;
}

/**
 * Find all nodes that could match current screen
 */
export function findAllMatches(
  context: MatchContext,
  nodes: FlowNode[],
  minConfidence = 0.3
): MatchResult[] {
  const screenNodes = nodes.filter(n => n.type === 'screen' || n.type === 'start');
  const matches: MatchResult[] = [];

  for (const node of screenNodes) {
    const result = matchScreen(context, node);
    if (result && result.confidence >= minConfidence) {
      matches.push(result);
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}
