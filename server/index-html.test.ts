import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("index.html meta tags", () => {
  const htmlPath = path.resolve(__dirname, "../client/index.html");
  const html = fs.readFileSync(htmlPath, "utf-8");

  it("should have lang='ja' on html element", () => {
    expect(html).toMatch(/<html\s+lang="ja">/);
  });

  it("should have favicon link tags", () => {
    expect(html).toContain('rel="icon"');
    expect(html).toContain('href="/favicon.ico"');
    expect(html).toContain('href="/favicon-32x32.png"');
  });

  it("should have apple-touch-icon", () => {
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('href="/apple-touch-icon.png"');
  });

  it("should have meta description", () => {
    expect(html).toContain('name="description"');
    expect(html).toMatch(/content="[^"]*順番待ち[^"]*"/);
  });

  it("should have theme-color meta tag", () => {
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('content="#0f172a"');
  });

  it("should have Open Graph tags", () => {
    expect(html).toContain('property="og:type"');
    expect(html).toContain('content="website"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('property="og:locale"');
    expect(html).toContain('content="ja_JP"');
    expect(html).toContain('property="og:site_name"');
  });

  it("should have Twitter Card tags", () => {
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('content="summary_large_image"');
    expect(html).toContain('name="twitter:title"');
    expect(html).toContain('name="twitter:description"');
    expect(html).toContain('name="twitter:image"');
  });

  it("should NOT contain template comment blocks", () => {
    expect(html).not.toContain("THIS IS THE START OF A COMMENT BLOCK");
    expect(html).not.toContain("THIS IS THE END OF A COMMENT BLOCK");
    expect(html).not.toContain("BLOCK TO BE DELETED");
  });

  it("should not have lang='en'", () => {
    expect(html).not.toMatch(/<html\s+lang="en">/);
  });
});
