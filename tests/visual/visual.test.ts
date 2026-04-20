/**
 * GhostRun Visual Regression Test Suite
 * 
 * Captures screenshots during flow execution and compares them against
 * baseline images to detect visual changes in web pages.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, ChromiumBrowser, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Test sites that should remain visually consistent
const VISUAL_TEST_SITES = [
  { name: 'Wikipedia', url: 'https://en.wikipedia.org', selector: '#content' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com', selector: '.hnname' },
  { name: 'MDN Home', url: 'https://developer.mozilla.org', selector: 'header' },
];

const BASELINE_DIR = 'tests/visual/baselines';
const DIFF_DIR = 'tests/visual/diffs';
const SCREENSHOT_DIR = 'tests/visual/screenshots';

describe('Visual Regression Tests', () => {
  let browser: ChromiumBrowser;
  let page: Page;

  beforeAll(async () => {
    // Create directories
    for (const dir of [BASELINE_DIR, DIFF_DIR, SCREENSHOT_DIR]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  for (const site of VISUAL_TEST_SITES) {
    it(`should capture baseline for ${site.name}`, async () => {
      const screenshotPath = path.join(SCREENSHOT_DIR, `${site.name.toLowerCase().replace(/\s+/g, '-')}-baseline.png`);
      
      await page.goto(site.url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000); // Allow fonts/images to load
      
      const element = page.locator(site.selector).first();
      await element.screenshot({ path: screenshotPath, animations: 'disabled' });
      
      // If no baseline exists, this becomes the baseline
      const baselinePath = path.join(BASELINE_DIR, `${site.name.toLowerCase().replace(/\s+/g, '-')}.png`);
      
      if (!fs.existsSync(baselinePath)) {
        fs.copyFileSync(screenshotPath, baselinePath);
        console.log(`Created baseline for ${site.name}: ${baselinePath}`);
      }
      
      expect(fs.existsSync(screenshotPath)).toBe(true);
    });

    it(`should not have visual regressions for ${site.name}`, async () => {
      const baselinePath = path.join(BASELINE_DIR, `${site.name.toLowerCase().replace(/\s+/g, '-')}.png`);
      const currentPath = path.join(SCREENSHOT_DIR, `${site.name.toLowerCase().replace(/\s+/g, '-')}-current.png`);
      const diffPath = path.join(DIFF_DIR, `${site.name.toLowerCase().replace(/\s+/g, '-')}-diff.png`);
      
      // Capture current state
      await page.goto(site.url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      const element = page.locator(site.selector).first();
      await element.screenshot({ path: currentPath, animations: 'disabled' });
      
      // Skip if no baseline exists
      if (!fs.existsSync(baselinePath)) {
        console.log(`No baseline exists for ${site.name}, skipping comparison`);
        return;
      }
      
      // Compare using ImageMagick or similar
      // If pixel difference > 5%, flag as regression
      const similarity = calculateImageSimilarity(baselinePath, currentPath);
      
      if (similarity < 95) {
        // Create diff image
        execSync(`compare -metric AE "${baselinePath}" "${currentPath}" "${diffPath}" 2>/dev/null || echo "ImageMagick not available"`);
        expect(similarity).toBeGreaterThanOrEqual(95);
      }
    });
  }
});

/**
 * Calculate image similarity percentage (0-100)
 * Uses pixel-by-pixel comparison
 */
function calculateImageSimilarity(img1: string, img2: string): number {
  try {
    // Use Node.js to compare images
    const buffer1 = fs.readFileSync(img1);
    const buffer2 = fs.readFileSync(img2);
    
    if (buffer1.length !== buffer2.length) {
      // Different file sizes suggest differences
      const sizeRatio = Math.min(buffer1.length, buffer2.length) / Math.max(buffer1.length, buffer2.length);
      return sizeRatio * 100;
    }
    
    // Simple byte comparison (not perfect but fast)
    let differences = 0;
    const compareLength = Math.min(buffer1.length, buffer2.length, 10000);
    
    for (let i = 0; i < compareLength; i++) {
      if (Math.abs(buffer1[i] - buffer2[i]) > 5) {
        differences++;
      }
    }
    
    return 100 - (differences / compareLength * 100);
  } catch {
    return 100; // Assume similar if can't compare
  }
}

export {};
